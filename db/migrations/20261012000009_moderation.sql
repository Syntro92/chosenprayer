-- Moderation: integrity rules + indexes for the report queue.
-- Soft removal (status = 'removed') must always say when it happened, and a report that
-- has been handled must say when. These make half-finished moderation states impossible.

alter table public.posts
  add constraint posts_removal_consistent check ((status = 'removed') = (removed_at is not null));

alter table public.comments
  add constraint comments_removal_consistent check ((status = 'removed') = (removed_at is not null));

alter table public.reports
  add constraint reports_handled_consistent check ((status = 'open') = (handled_at is null));

-- Count/list reports per target, and page through handled reports.
create index reports_post_idx    on public.reports (post_id)    where post_id is not null;
create index reports_comment_idx on public.reports (comment_id) where comment_id is not null;
create index reports_handled_idx on public.reports (handled_at desc) where status <> 'open';

-- Find a member's removed content quickly (moderator review of repeat offenders).
create index posts_removed_idx    on public.posts (author_id)    where status = 'removed';
create index comments_removed_idx on public.comments (author_id) where status = 'removed';
