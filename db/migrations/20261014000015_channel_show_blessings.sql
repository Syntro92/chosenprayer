-- Per-channel switch (Admin > Channels > edit): show this channel's blessings on its public page.
-- Off hides the blessings section, the blessing count and the "leave a blessing" prompt, and stops
-- new blessings. Existing blessings are kept, so turning it back on restores them.
alter table public.channels add column show_blessings boolean not null default true;
