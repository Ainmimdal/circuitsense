-- Elera cloud project library. Each signed-in user only ever sees their own rows.
-- Run once in the Supabase SQL editor (or with `supabase db push`).

create table if not exists public.projects (
    owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    id text not null,
    name text not null check (char_length(name) between 1 and 200),
    data jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    created_at timestamptz not null default now(),
    primary key (owner_id, id),
    -- Keeps one runaway project from eating the 500 MB free-tier database.
    constraint projects_data_size check (pg_column_size(data) < 5 * 1024 * 1024)
);

alter table public.projects enable row level security;

drop policy if exists "Users read their own projects" on public.projects;
create policy "Users read their own projects" on public.projects
    for select to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists "Users add their own projects" on public.projects;
create policy "Users add their own projects" on public.projects
    for insert to authenticated with check ((select auth.uid()) = owner_id);

drop policy if exists "Users update their own projects" on public.projects;
create policy "Users update their own projects" on public.projects
    for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

drop policy if exists "Users delete their own projects" on public.projects;
create policy "Users delete their own projects" on public.projects
    for delete to authenticated using ((select auth.uid()) = owner_id);

-- Deleted projects are kept as small tombstones so other devices learn about
-- the delete; clear out ones older than 90 days to keep the table small.
create or replace function public.purge_deleted_projects() returns void
    language sql security definer set search_path = public as $$
    delete from public.projects where deleted_at < now() - interval '90 days';
$$;
revoke all on function public.purge_deleted_projects() from public, anon, authenticated;
