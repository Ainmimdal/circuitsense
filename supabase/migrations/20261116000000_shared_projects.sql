-- Published circuits: a signed-in user publishes a copy and gets a short link.
-- Anyone with the link can open it as their own copy; nobody can list them.
-- Safe to run twice.

create table if not exists public.shared_projects (
    id text primary key check (id ~ '^[a-z0-9]{10,32}$'),
    owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    name text not null check (char_length(name) between 1 and 200),
    data jsonb not null,
    created_at timestamptz not null default now(),
    constraint shared_projects_data_size check (pg_column_size(data) < 2 * 1024 * 1024)
);

alter table public.shared_projects enable row level security;

drop policy if exists "Users see their own published circuits" on public.shared_projects;
create policy "Users see their own published circuits" on public.shared_projects
    for select to authenticated using ((select auth.uid()) = owner_id);

-- 200 published circuits per account keeps the free-tier database small.
drop policy if exists "Users publish their own circuits" on public.shared_projects;
create policy "Users publish their own circuits" on public.shared_projects
    for insert to authenticated with check (
        (select auth.uid()) = owner_id
        and (select count(*) from public.shared_projects where owner_id = (select auth.uid())) < 200
    );

drop policy if exists "Users remove their own published circuits" on public.shared_projects;
create policy "Users remove their own published circuits" on public.shared_projects
    for delete to authenticated using ((select auth.uid()) = owner_id);

-- The only way in for visitors: one circuit, by its exact link id.
create or replace function public.get_shared_project(project_id text)
    returns table (name text, data jsonb)
    language sql stable security definer set search_path = public as $$
    select name, data from public.shared_projects where id = project_id;
$$;
revoke all on function public.get_shared_project(text) from public;
grant execute on function public.get_shared_project(text) to anon, authenticated;
