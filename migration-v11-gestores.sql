-- Migração V11: administradores de projeto (gestores delegados)
-- Execute este SQL no Supabase SQL Editor (depois da V5, V6, V8 e V10). É seguro rodar mais de uma vez.
--
-- O modelo, em três níveis:
--   * Você (master)         : dono de tudo. Nada mudou.
--   * Administrador de projeto : um membro da equipe que você coloca como "admin" de projetos
--     específicos. Nesses projetos ele vê todas as tarefas, edita, cria, apaga, coloca pessoas
--     (inclusive cadastrar gente nova) e pode tornar outro membro admin do MESMO projeto. Também
--     pode criar projetos novos (e vira admin deles). Nos outros projetos ele não enxerga nada.
--   * Usuário básico        : só vê as tarefas delegadas a ele (como o Bernardo hoje).
--
-- Tudo que um administrador cria continua sendo SEU: tasks.user_id e projects.user_id seguem sendo
-- o id do master, então aparece na sua tela, com o projeto e o responsável marcados.
--
-- O que cria:
--  * project_members        : quem está em cada projeto e com que papel ('admin' | 'member').
--  * team_members.created_by: quem cadastrou o membro (o master ou um admin de projeto).
--  * funções de apoio, policies de tasks/projects/categories para o admin, e RPCs para gerenciar
--    pessoas e criar projeto (a escrita em project_members só passa por elas).
--  * tasks_member_update_guard: reescrito pela terceira vez (V5, V6, V10). Agora o admin do projeto
--    edita tudo da tarefa, e o gatilho aninhado (FK, liberação de etapa) também pode zerar
--    project_id e depends_on — sem isso, o admin apagar um projeto ou uma etapa daria erro.

-- ---------- Tabelas e colunas ----------
alter table public.team_members add column if not exists created_by uuid references auth.users(id) on delete set null;

create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  member_user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_id, member_user_id)
);

create index if not exists project_members_user_idx on public.project_members (member_user_id);

-- ---------- Funções de apoio ----------
-- SECURITY DEFINER para poderem ler project_members/projects/team_members de dentro das policies
-- sem entrar em recursão de RLS. Nenhuma devolve dado: só verdadeiro/falso ou um id.

create or replace function public.project_owner(p_project uuid)
returns uuid language sql stable security definer set search_path = public
as $$ select user_id from public.projects where id = p_project $$;

create or replace function public.is_project_admin(p_project uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public
as $$
  select p_project is not null and p_user is not null and exists (
    select 1 from public.project_members
    where project_id = p_project and member_user_id = p_user and role = 'admin'
  )
$$;

create or replace function public.is_project_participant(p_project uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public
as $$
  select p_project is not null and p_user is not null and exists (
    select 1 from public.project_members where project_id = p_project and member_user_id = p_user
  )
$$;

-- O master de quem está logado (null se for o próprio master)
create or replace function public.my_master_id()
returns uuid language sql stable security definer set search_path = public
as $$ select master_id from public.team_members where member_user_id = auth.uid() $$;

-- Quem administra pelo menos um projeto
create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.project_members where member_user_id = auth.uid() and role = 'admin'
  )
$$;

-- A pessoa é da equipe deste master?
create or replace function public.is_in_team(p_master uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select p_user is null or exists (
    select 1 from public.team_members where master_id = p_master and member_user_id = p_user
  )
$$;

-- ---------- project_members ----------
alter table public.project_members enable row level security;
grant select on public.project_members to authenticated;

-- Escrita só pelas funções abaixo (não há policy de insert/update/delete de propósito).
drop policy if exists "See project people" on public.project_members;
create policy "See project people" on public.project_members
  for select using (
    auth.uid() = public.project_owner(project_id)      -- master
    or member_user_id = auth.uid()                      -- a própria linha
    or public.is_project_admin(project_id)              -- admin vê todo o time do projeto
  );

-- ---------- Gerenciar pessoas do projeto ----------
create or replace function public.set_project_member(p_project uuid, p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public
as $$
declare v_owner uuid := public.project_owner(p_project);
begin
  if v_owner is null then raise exception 'Projeto não encontrado' using errcode = 'P0002'; end if;
  if auth.uid() is null or not (auth.uid() = v_owner or public.is_project_admin(p_project)) then
    raise exception 'Sem permissão para gerenciar este projeto' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'member') then raise exception 'Papel inválido' using errcode = '22023'; end if;
  if p_user is null or not public.is_in_team(v_owner, p_user) then
    raise exception 'Essa pessoa não é da sua equipe' using errcode = '42501';
  end if;

  insert into public.project_members (project_id, member_user_id, role, added_by)
  values (p_project, p_user, p_role, auth.uid())
  on conflict (project_id, member_user_id) do update set role = excluded.role;
end;
$$;

create or replace function public.remove_project_member(p_project uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_owner uuid := public.project_owner(p_project);
begin
  if v_owner is null then raise exception 'Projeto não encontrado' using errcode = 'P0002'; end if;
  if auth.uid() is null or not (auth.uid() = v_owner or public.is_project_admin(p_project)) then
    raise exception 'Sem permissão para gerenciar este projeto' using errcode = '42501';
  end if;
  delete from public.project_members where project_id = p_project and member_user_id = p_user;
end;
$$;

-- Um admin cria um projeto novo. O projeto é do MASTER (aparece na tela dele) e o admin vira admin.
create or replace function public.create_project_as_manager(p_name text, p_description text, p_color text)
returns public.projects language plpgsql security definer set search_path = public
as $$
declare
  v_master uuid := public.my_master_id();
  v_row public.projects;
begin
  if v_master is null or not public.is_manager() then
    raise exception 'Só um administrador de projeto pode criar projetos' using errcode = '42501';
  end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Informe o nome do projeto' using errcode = '22023'; end if;

  insert into public.projects (user_id, name, description, color)
  values (v_master, trim(p_name), coalesce(p_description, ''), coalesce(p_color, '#3b82f6'))
  returning * into v_row;

  insert into public.project_members (project_id, member_user_id, role, added_by)
  values (v_row.id, auth.uid(), 'admin', auth.uid());

  return v_row;
end;
$$;

-- A equipe que o admin enxerga: todos os nomes (para poder colocar no projeto), mas telefone e login
-- só de quem já está nos projetos dele ou foi cadastrado por ele.
create or replace function public.project_team()
returns table (id uuid, member_user_id uuid, name text, username text, phone text, created_at timestamptz)
language sql stable security definer set search_path = public
as $$
  with mine as (
    select tm.* from public.team_members tm where tm.master_id = public.my_master_id()
  ),
  my_projects as (
    select project_id from public.project_members where member_user_id = auth.uid() and role = 'admin'
  )
  select m.id, m.member_user_id, m.name,
         case when visible then m.username end,
         case when visible then m.phone end,
         m.created_at
  from (
    select mine.*,
           (mine.created_by = auth.uid() or mine.member_user_id = auth.uid() or exists (
              select 1 from public.project_members pm
              where pm.member_user_id = mine.member_user_id and pm.project_id in (select project_id from my_projects)
           )) as visible
    from mine
  ) m
  where public.is_manager()
  order by m.name
$$;

grant execute on function
  public.set_project_member(uuid, uuid, text),
  public.remove_project_member(uuid, uuid),
  public.create_project_as_manager(text, text, text),
  public.project_team()
to authenticated;

-- ---------- projects: o admin edita e apaga o que administra ----------
drop policy if exists "Participants view project" on public.projects;
create policy "Participants view project" on public.projects
  for select using (public.is_project_participant(id));

drop policy if exists "Admins update project" on public.projects;
create policy "Admins update project" on public.projects
  for update using (public.is_project_admin(id))
  with check (public.is_project_admin(id) and user_id = public.project_owner(id));

drop policy if exists "Admins delete project" on public.projects;
create policy "Admins delete project" on public.projects
  for delete using (public.is_project_admin(id));

-- ---------- tasks: o admin enxerga e mexe em tudo do projeto dele ----------
-- Sem "deleted_at is null" de propósito: apagar uma tarefa é marcar deleted_at, e a linha nova
-- precisa continuar visível para o UPDATE ... RETURNING funcionar.
drop policy if exists "Admins view project tasks" on public.tasks;
create policy "Admins view project tasks" on public.tasks
  for select using (public.is_project_admin(project_id));

-- Tarefa criada por admin continua sendo do master; só pode ser delegada a gente da equipe dele.
drop policy if exists "Admins insert project tasks" on public.tasks;
create policy "Admins insert project tasks" on public.tasks
  for insert with check (
    public.is_project_admin(project_id)
    and user_id = public.project_owner(project_id)::text
    and public.is_in_team(public.project_owner(project_id), assigned_to)
  );

drop policy if exists "Admins update project tasks" on public.tasks;
create policy "Admins update project tasks" on public.tasks
  for update using (public.is_project_admin(project_id))
  with check (
    public.is_project_admin(project_id)
    and user_id = public.project_owner(project_id)::text
    and public.is_in_team(public.project_owner(project_id), assigned_to)
  );

drop policy if exists "Admins delete project tasks" on public.tasks;
create policy "Admins delete project tasks" on public.tasks
  for delete using (public.is_project_admin(project_id));

-- Delegar uma tarefa a alguém que ainda não está no projeto já coloca a pessoa no projeto.
-- Só quando quem delega é um admin (não o master): o master escolhe as pessoas pela tela.
create or replace function public.tasks_add_assignee_to_project()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.assigned_to is not null and new.project_id is not null
     and auth.uid() is not null and auth.uid()::text <> new.user_id then
    insert into public.project_members (project_id, member_user_id, role, added_by)
    values (new.project_id, new.assigned_to, 'member', auth.uid())
    on conflict (project_id, member_user_id) do nothing;
  end if;
  return null;
end;
$$;

drop trigger if exists tasks_add_assignee_to_project on public.tasks;
create trigger tasks_add_assignee_to_project
  after insert or update of assigned_to, project_id on public.tasks
  for each row execute function public.tasks_add_assignee_to_project();

-- ---------- Travas de integridade ----------
-- Por que existem: no Postgres a linha NOVA de um UPDATE só precisa passar na checagem de ALGUMA
-- policy, não da mesma que liberou a linha antiga. A policy antiga "dono edita o próprio projeto"
-- não tem checagem da linha nova, então um admin (liberado pela policy nova) conseguia trocar o
-- dono do projeto para si mesmo e tomá-lo do master. As travas abaixo valem para todo mundo.

-- O dono de um projeto nunca muda (só SQL Editor / service role, onde auth.uid() é nulo).
create or replace function public.projects_owner_immutable()
returns trigger language plpgsql as $$
begin
  if new.user_id is distinct from old.user_id and auth.uid() is not null then
    raise exception 'Não é possível trocar o dono do projeto' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists projects_owner_immutable on public.projects;
create trigger projects_owner_immutable
  before update of user_id on public.projects
  for each row execute function public.projects_owner_immutable();

-- Uma tarefa só pode apontar para um projeto do MESMO dono dela. Sem isso, um membro conseguia criar
-- uma tarefa "dele" dentro do projeto do master, invisível para o master. Garante que tudo que
-- acontece num projeto aparece na tela do master.
create or replace function public.tasks_project_owner_match()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.project_id is not null and auth.uid() is not null
     and public.project_owner(new.project_id)::text is distinct from new.user_id then
    raise exception 'A tarefa precisa ser do mesmo dono do projeto' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_project_owner_match on public.tasks;
create trigger tasks_project_owner_match
  before insert or update of project_id, user_id on public.tasks
  for each row execute function public.tasks_project_owner_match();

-- ---------- categories: o admin enxerga as do master (só leitura) ----------
drop policy if exists "Managers view master categories" on public.categories;
create policy "Managers view master categories" on public.categories
  for select using (public.is_manager() and user_id = public.my_master_id()::text);

-- ---------- Proteção do membro (V10 + admin de projeto) ----------
create or replace function public.tasks_member_update_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
  v_next text;
  v_reopen boolean;
  v_admin boolean;
  -- completed_by / completed_by_name / completion_seen / next_spawned ficam de fora de propósito:
  -- quem preenche é o próprio trigger, o membro não consegue forjar.
  -- client e depends_on também ficam de fora: são do gestor.
  v_allowed text[] := array[
    'status', 'is_completed', 'completed_at', 'checklist', 'member_notes', 'attachments', 'updated_at'
  ];
  -- O que um gatilho aninhado (liberação de etapa, FK "on delete set null") pode alterar
  v_nested text[] := array['status', 'updated_at', 'project_id', 'depends_on'];
begin
  -- Atualização feita por OUTRO gatilho, não pelo usuário diretamente: pg_trigger_depth() > 1 só
  -- acontece aninhado e não dá para forjar por uma chamada comum. Só deixa passar: mudança de status,
  -- e project_id / depends_on sendo ZERADOS (é o que as chaves estrangeiras fazem ao apagar um
  -- projeto ou uma etapa).
  if pg_trigger_depth() > 1 and auth.uid() is not null and (auth.uid())::text <> old.user_id then
    if (to_jsonb(new) - v_nested) is distinct from (to_jsonb(old) - v_nested)
       or (new.project_id is not null and new.project_id is distinct from old.project_id)
       or (new.depends_on is not null and new.depends_on is distinct from old.depends_on) then
      raise exception 'Atualização automática só pode alterar o status ou desvincular' using errcode = '42501';
    end if;
    return new;
  end if;

  -- Gestor (dono), SQL Editor e service role passam livres.
  -- Mesmo assim, reabrir limpa os dados de conclusão (vale para qualquer caminho).
  if auth.uid() is null or (auth.uid())::text = old.user_id then
    if old.is_completed and not new.is_completed then
      new.completed_at := null;
      new.completed_by := null;
      new.completed_by_name := null;
      new.completion_seen := true;
    end if;
    return new;
  end if;

  v_admin := public.is_project_admin(old.project_id, auth.uid());

  if v_admin then
    -- Admin do projeto edita tudo, menos o dono da tarefa: ela continua sendo do master.
    if new.user_id is distinct from old.user_id then
      raise exception 'Não é possível trocar o dono da tarefa' using errcode = '42501';
    end if;
  else
    if old.assigned_to is distinct from auth.uid() then
      raise exception 'Sem permissão para alterar esta tarefa' using errcode = '42501';
    end if;

    if (to_jsonb(new) - v_allowed) is distinct from (to_jsonb(old) - v_allowed) then
      raise exception 'Membros só podem atualizar o andamento da tarefa' using errcode = '42501';
    end if;

    -- Pode anexar comprovantes, mas não apagar o que o gestor anexou
    if not (coalesce(new.attachments, '[]'::jsonb) @> coalesce(old.attachments, '[]'::jsonb)) then
      raise exception 'Membros não podem remover anexos da tarefa' using errcode = '42501';
    end if;
  end if;

  -- Reabrir: tirar de "concluída" ou mudar o status de uma concluída para outro que não "done"
  v_reopen := old.is_completed and (not new.is_completed or new.status is distinct from 'done');

  if v_reopen then
    new.is_completed := false;
    if new.status = 'done' then
      new.status := 'todo';
    end if;
    new.completed_at := null;
    new.completed_by := null;
    new.completed_by_name := null;
    new.completion_seen := true;
  elsif new.status = 'done' and not new.is_completed then
    -- status "done" sempre significa concluída
    new.is_completed := true;
  end if;

  if new.is_completed and not old.is_completed then
    select name into v_name from public.team_members where member_user_id = auth.uid();

    new.status := 'done';
    new.completed_at := coalesce(new.completed_at, now());
    new.completed_by := auth.uid();
    new.completed_by_name := v_name;
    new.completion_seen := false;

    -- Tarefa recorrente: cria a próxima ocorrência UMA vez só (membro não tem permissão de INSERT)
    if coalesce(old.recurrence, 'none') <> 'none' and not coalesce(old.next_spawned, false) then
      v_next := public.planner_next_date(old.scheduled_date, old.recurrence);

      insert into public.tasks (
        user_id, title, description, urgency, category, day_of_week, scheduled_date,
        scheduled_time, "position", notes, is_completed, attachments, project_id, status,
        due_date, checklist, recurrence, assigned_to, client, drive_links
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
        old.recurrence, old.assigned_to, old.client, coalesce(old.drive_links, '[]'::jsonb)
      );

      new.next_spawned := true;
    end if;
  end if;

  return new;
end;
$$;
