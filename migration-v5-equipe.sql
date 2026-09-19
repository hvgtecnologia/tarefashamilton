-- Migração V5: Equipe (gestor delega tarefas a membros)
-- Execute este SQL no Supabase SQL Editor. É seguro rodar mais de uma vez.
--
-- O que muda:
--  * team_members: quem é membro de qual gestor (escrita só pela Edge Function manage-team)
--  * tasks: assigned_to (responsável), completed_by/completed_by_name (quem concluiu),
--    completion_seen (gestor já viu a conclusão?), member_notes (retorno do membro)
--  * Segurança (RLS): membro só enxerga/atualiza o que foi delegado a ele, e só o andamento
--  * Trigger: protege os campos do gestor e cria a próxima ocorrência de tarefas recorrentes
--    concluídas por membros (o membro não tem permissão de criar tarefas)
--  * Corrige a policy de UPDATE de categories, que estava "using (true)" (qualquer usuário
--    logado podia editar categorias de outros)
--  * profiles.id passa a ter ON DELETE CASCADE (senão remover um membro dá erro de FK)

-- =====================================================================
-- 1. Membros da equipe
-- =====================================================================
create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  master_id uuid not null references auth.users(id) on delete cascade,
  member_user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  username text not null unique check (username = lower(username)),
  login_email text not null,
  created_at timestamptz default now()
);

create index if not exists team_members_master_idx on public.team_members(master_id);

alter table public.team_members enable row level security;

drop policy if exists "Team visible to master and member" on public.team_members;
create policy "Team visible to master and member"
  on public.team_members for select
  using (master_id = auth.uid() or member_user_id = auth.uid());
-- Sem policies de insert/update/delete de propósito: só a Edge Function (service role) escreve.

-- =====================================================================
-- 2. Novas colunas em tasks
-- =====================================================================
alter table public.tasks add column if not exists assigned_to uuid references auth.users(id) on delete set null;
alter table public.tasks add column if not exists completed_by uuid references auth.users(id) on delete set null;
alter table public.tasks add column if not exists completed_by_name text;
alter table public.tasks add column if not exists completion_seen boolean not null default true;
alter table public.tasks add column if not exists member_notes text default '';

create index if not exists tasks_assigned_to_idx on public.tasks(assigned_to) where assigned_to is not null;

-- =====================================================================
-- 3. Funções auxiliares
-- =====================================================================

-- O usuário logado (gestor) é dono deste membro?
create or replace function public.is_my_team_member(p_user uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.team_members tm
    where tm.member_user_id = p_user and tm.master_id = auth.uid()
  );
$$;

-- Próxima data de uma tarefa recorrente (mesma regra do app: daily/weekdays/weekly/monthly)
create or replace function public.planner_next_date(p_base text, p_recurrence text)
returns text
language plpgsql stable
as $$
declare
  d date;
begin
  if p_recurrence is null or p_recurrence = 'none' then
    return null;
  end if;

  d := coalesce(nullif(p_base, '')::date, current_date);

  if p_recurrence = 'daily' then
    d := d + 1;
  elsif p_recurrence = 'weekdays' then
    d := d + 1;
    if extract(dow from d) = 6 then
      d := d + 2;
    elsif extract(dow from d) = 0 then
      d := d + 1;
    end if;
  elsif p_recurrence = 'weekly' then
    d := d + 7;
  elsif p_recurrence = 'monthly' then
    d := (d + interval '1 month')::date;
  else
    return null;
  end if;

  return to_char(d, 'YYYY-MM-DD');
end;
$$;

-- Login por usuário (sem @): a tela de login descobre o e-mail interno do membro
create or replace function public.team_login_email(p_username text)
returns text
language sql stable security definer set search_path = public
as $$
  select login_email from public.team_members
  where username = lower(trim(p_username))
  limit 1;
$$;

revoke all on function public.team_login_email(text) from public;
grant execute on function public.team_login_email(text) to anon, authenticated;

-- =====================================================================
-- 4. Policies de tasks
-- =====================================================================

-- Membro: enxerga e atualiza (limitado pelo trigger abaixo) só o que foi delegado a ele
drop policy if exists "Members can view assigned tasks" on public.tasks;
create policy "Members can view assigned tasks"
  on public.tasks for select
  using (assigned_to = auth.uid() and deleted_at is null);

drop policy if exists "Members can update assigned tasks" on public.tasks;
create policy "Members can update assigned tasks"
  on public.tasks for update
  using (assigned_to = auth.uid() and deleted_at is null)
  with check (assigned_to = auth.uid() and deleted_at is null);

-- Gestor: só pode delegar para membros da própria equipe
drop policy if exists "Users can insert own tasks" on public.tasks;
create policy "Users can insert own tasks"
  on public.tasks for insert
  with check (
    (auth.uid())::text = user_id
    and (assigned_to is null or public.is_my_team_member(assigned_to))
  );

drop policy if exists "Users can update own tasks" on public.tasks;
create policy "Users can update own tasks"
  on public.tasks for update
  using ((auth.uid())::text = user_id)
  with check (
    (auth.uid())::text = user_id
    and (assigned_to is null or public.is_my_team_member(assigned_to))
  );

-- =====================================================================
-- 5. Trigger: o que um membro pode (e não pode) alterar
-- =====================================================================
create or replace function public.tasks_member_update_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
  v_next text;
  -- completed_by / completed_by_name / completion_seen ficam de fora de propósito:
  -- quem preenche é o próprio trigger ao concluir, o membro não consegue forjar.
  v_allowed text[] := array[
    'status', 'is_completed', 'completed_at', 'checklist', 'member_notes', 'attachments', 'updated_at'
  ];
begin
  -- Gestor (dono), SQL Editor e service role passam livres
  if auth.uid() is null or (auth.uid())::text = old.user_id then
    return new;
  end if;

  if old.assigned_to is distinct from auth.uid() then
    raise exception 'Sem permissão para alterar esta tarefa' using errcode = '42501';
  end if;

  if (to_jsonb(new) - v_allowed) is distinct from (to_jsonb(old) - v_allowed) then
    raise exception 'Membros só podem atualizar o andamento da tarefa' using errcode = '42501';
  end if;

  -- status "done" sempre significa concluída
  if new.status = 'done' and not new.is_completed then
    new.is_completed := true;
  end if;

  -- Reabrir é coisa do gestor (também evita duplicar a próxima ocorrência de recorrentes)
  if old.is_completed and (not new.is_completed or new.status is distinct from 'done') then
    raise exception 'Peça ao gestor para reabrir esta tarefa' using errcode = '42501';
  end if;

  if new.is_completed and not old.is_completed then
    select name into v_name from public.team_members where member_user_id = auth.uid();

    new.status := 'done';
    new.completed_at := coalesce(new.completed_at, now());
    new.completed_by := auth.uid();
    new.completed_by_name := v_name;
    new.completion_seen := false;

    -- Tarefa recorrente: cria a próxima ocorrência (membro não tem permissão de INSERT)
    if coalesce(old.recurrence, 'none') <> 'none' then
      v_next := public.planner_next_date(old.scheduled_date, old.recurrence);

      insert into public.tasks (
        user_id, title, description, urgency, category, day_of_week, scheduled_date,
        scheduled_time, "position", notes, is_completed, attachments, project_id, status,
        due_date, checklist, recurrence, assigned_to
      ) values (
        old.user_id, old.title, old.description, old.urgency, old.category,
        case when v_next is not null then 'monday' else 'inbox' end,
        v_next, old.scheduled_time, old."position", old.notes, false,
        coalesce(old.attachments, '[]'::jsonb), old.project_id, 'todo',
        case when old.due_date is not null then public.planner_next_date(old.due_date, old.recurrence) end,
        coalesce(
          (select jsonb_agg(case when jsonb_typeof(e) = 'object' then jsonb_set(e, '{done}', 'false'::jsonb) else e end)
             from jsonb_array_elements(coalesce(old.checklist, '[]'::jsonb)) e),
          '[]'::jsonb
        ),
        old.recurrence, old.assigned_to
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_member_update_guard on public.tasks;
create trigger tasks_member_update_guard
  before update on public.tasks
  for each row execute function public.tasks_member_update_guard();

-- =====================================================================
-- 6. Membro enxerga só as categorias/projetos das tarefas delegadas a ele
-- =====================================================================
drop policy if exists "Members can view assigned categories" on public.categories;
create policy "Members can view assigned categories"
  on public.categories for select
  using (exists (
    select 1 from public.tasks t
    where t.assigned_to = auth.uid() and t.deleted_at is null and t.category = categories.id::text
  ));

drop policy if exists "Members can view assigned projects" on public.projects;
create policy "Members can view assigned projects"
  on public.projects for select
  using (exists (
    select 1 from public.tasks t
    where t.assigned_to = auth.uid() and t.deleted_at is null and t.project_id = projects.id
  ));

-- =====================================================================
-- 7. Correções de segurança que já existiam
-- =====================================================================
drop policy if exists "Users can update own categories" on public.categories;
create policy "Users can update own categories"
  on public.categories for update
  using ((auth.uid())::text = user_id)
  with check ((auth.uid())::text = user_id);

alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles
  add constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade;
