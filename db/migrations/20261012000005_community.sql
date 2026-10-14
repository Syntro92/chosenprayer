-- Community: members-only posts, comments (one level of replies), likes,
-- attachments, reports and notifications. Limits mirror src/lib/community/config.ts
-- and are enforced here so a client can never bypass them.
-- Users deleting their own content = hard delete. Moderator removals are soft
-- (status = 'removed') so reports and evidence survive.

create table public.posts (
  id              uuid primary key default gen_random_uuid(),
  author_id       uuid not null references public.profiles (id) on delete cascade,
  body            text not null default '' check (char_length(body) <= 1000),
  status          public.moderation_status not null default 'visible',
  removed_by      uuid references public.profiles (id) on delete set null,
  removed_at      timestamptz,
  removal_reason  text check (removal_reason is null or char_length(removal_reason) <= 300),
  edited_at       timestamptz,
  like_count      integer not null default 0 check (like_count >= 0),
  comment_count   integer not null default 0 check (comment_count >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index posts_feed_idx   on public.posts (created_at desc) where status = 'visible';
create index posts_author_idx on public.posts (author_id, created_at desc);
create trigger posts_set_updated_at before update on public.posts
  for each row execute function public.set_updated_at();

create table public.post_attachments (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references public.posts (id) on delete cascade,
  kind          public.attachment_kind not null,
  name          text not null check (char_length(name) between 1 and 255),
  size_bytes    integer not null check (size_bytes > 0 and size_bytes <= 5242880),      -- 5 MB
  mime          text not null,
  storage_path  text not null unique,                                                  -- object key in the private bucket
  alt           text check (alt is null or char_length(alt) <= 300),
  position      smallint not null default 0,
  created_at    timestamptz not null default now(),
  check (
    (kind = 'image' and mime in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')) or
    (kind = 'file'  and mime in ('application/pdf', 'text/plain',
                                 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))
  )
);
create index post_attachments_post_idx on public.post_attachments (post_id, position);

-- At most 6 attachments per post, at most 4 of them images.
create function public.trg_attachment_limits() returns trigger
language plpgsql set search_path = ''
as $$
declare
  total  int;
  images int;
begin
  perform 1 from public.posts where id = new.post_id for update;   -- serialise concurrent inserts
  select count(*), count(*) filter (where kind = 'image')
    into total, images from public.post_attachments where post_id = new.post_id;
  if total + 1 > 6 then
    raise exception 'a post can have at most 6 attachments' using errcode = 'check_violation';
  end if;
  if new.kind = 'image' and images + 1 > 4 then
    raise exception 'a post can have at most 4 images' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger post_attachments_limits before insert on public.post_attachments
  for each row execute function public.trg_attachment_limits();

create table public.comments (
  id              uuid primary key default gen_random_uuid(),
  post_id         uuid not null references public.posts (id) on delete cascade,
  author_id       uuid not null references public.profiles (id) on delete cascade,
  parent_id       uuid,
  body            text not null check (char_length(btrim(body)) between 1 and 500),
  status          public.moderation_status not null default 'visible',
  removed_by      uuid references public.profiles (id) on delete set null,
  removed_at      timestamptz,
  removal_reason  text check (removal_reason is null or char_length(removal_reason) <= 300),
  edited_at       timestamptz,
  like_count      integer not null default 0 check (like_count >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (post_id, id),
  -- a reply must live on the same post as its parent; deleting a comment deletes its replies
  foreign key (post_id, parent_id) references public.comments (post_id, id) on delete cascade
);
create index comments_thread_idx on public.comments (post_id, created_at);
create index comments_parent_idx on public.comments (parent_id) where parent_id is not null;
create index comments_author_idx on public.comments (author_id);
create trigger comments_set_updated_at before update on public.comments
  for each row execute function public.set_updated_at();

-- Replies are one level deep: you can reply to a comment, not to a reply.
create function public.trg_comment_depth() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.parent_id is not null
     and exists (select 1 from public.comments where id = new.parent_id and parent_id is not null) then
    raise exception 'replies cannot be nested more than one level' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger comments_depth before insert or update of parent_id on public.comments
  for each row execute function public.trg_comment_depth();

create table public.post_likes (
  post_id     uuid not null references public.posts (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index post_likes_user_idx on public.post_likes (user_id);

create table public.comment_likes (
  comment_id  uuid not null references public.comments (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (comment_id, user_id)
);
create index comment_likes_user_idx on public.comment_likes (user_id);

-- Counter upkeep ------------------------------------------------------------
create function public.trg_post_like_count() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
  else
    update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;
create trigger post_likes_count after insert or delete on public.post_likes
  for each row execute function public.trg_post_like_count();

create function public.trg_comment_like_count() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.comments set like_count = like_count + 1 where id = new.comment_id;
  else
    update public.comments set like_count = greatest(like_count - 1, 0) where id = old.comment_id;
  end if;
  return null;
end;
$$;
create trigger comment_likes_count after insert or delete on public.comment_likes
  for each row execute function public.trg_comment_like_count();

-- posts.comment_count = visible comments (replies included) on the post.
create function public.trg_post_comment_count() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  affected uuid;
begin
  for affected in
    select distinct x from unnest(array[
      case when tg_op in ('UPDATE', 'DELETE') then old.post_id end,
      case when tg_op in ('INSERT', 'UPDATE') then new.post_id end
    ]) as t(x) where x is not null
  loop
    update public.posts p
    set comment_count = (select count(*) from public.comments c where c.post_id = affected and c.status = 'visible')
    where p.id = affected;
  end loop;
  return null;
end;
$$;
create trigger comments_count after insert or delete or update of status, post_id on public.comments
  for each row execute function public.trg_post_comment_count();

-- Stamp edited_at when the text actually changes (so the UI can show "edited").
create function public.trg_mark_edited() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end;
$$;
create trigger posts_mark_edited    before update on public.posts    for each row execute function public.trg_mark_edited();
create trigger comments_mark_edited before update on public.comments for each row execute function public.trg_mark_edited();

-- Reports: any member can flag a post or a comment for moderators.
create table public.reports (
  id             uuid primary key default gen_random_uuid(),
  reporter_id    uuid not null references public.profiles (id) on delete cascade,
  post_id        uuid references public.posts (id) on delete cascade,
  comment_id     uuid references public.comments (id) on delete cascade,
  reason         public.report_reason not null,
  note           text not null default '' check (char_length(note) <= 300),
  status         public.report_status not null default 'open',
  handled_by     uuid references public.profiles (id) on delete set null,
  handled_at     timestamptz,
  resolution     text check (resolution is null or char_length(resolution) <= 500),
  created_at     timestamptz not null default now(),
  check (num_nonnulls(post_id, comment_id) = 1)               -- exactly one target
);
create unique index reports_once_per_post    on public.reports (reporter_id, post_id)    where post_id is not null;
create unique index reports_once_per_comment on public.reports (reporter_id, comment_id) where comment_id is not null;
create index reports_queue_idx on public.reports (created_at) where status = 'open';

-- In-app notifications (the bell in the community header).
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  actor_id    uuid references public.profiles (id) on delete set null,
  type        public.notification_type not null default 'system',
  text        text not null check (char_length(text) between 1 and 300),
  href        text check (href is null or href ~ '^/'),
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_inbox_idx  on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;
