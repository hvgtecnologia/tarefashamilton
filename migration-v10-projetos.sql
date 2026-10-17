-- Migração V10: modelos de projeto, etapas com dependência e cliente nas tarefas
-- Execute este SQL no Supabase SQL Editor (depois da V5, V6 e V8). É seguro rodar mais de uma vez.
--
-- O que cria:
--  * tasks.client      : nome do cliente (texto livre). Alimenta a tela "Clientes".
--  * tasks.depends_on  : a etapa que precisa ser concluída antes desta. Etapa dependente nasce com
--                        status "Bloqueada" e é liberada sozinha quando a anterior é concluída.
--  * project_templates : modelos de projeto (as etapas com datas relativas), só do dono.
--  * tasks_release_dependents: o gatilho que libera (ou volta a bloquear) as etapas dependentes.
--  * tasks_member_update_guard: reescrito para permitir exatamente UMA coisa nova — o gatilho acima
--    mexer no STATUS de uma etapa de outra pessoa. Sem isso, o membro concluir a etapa 2 daria erro
--    de permissão ao tentar liberar a etapa 3, que é de outro membro (ou sua).

-- ---------- Colunas novas ----------
alter table public.tasks add column if not exists client text;
alter table public.tasks add column if not exists depends_on uuid references public.tasks(id) on delete set null;

do $$
begin
  alter table public.tasks
    add constraint tasks_no_self_dependency check (depends_on is null or depends_on <> id);
exception when duplicate_object then null;
end $$;

create index if not exists tasks_depends_on_idx on public.tasks (depends_on) where depends_on is not null;
create index if not exists tasks_client_idx on public.tasks (client) where client is not null;

-- ---------- Modelos de projeto ----------
create table if not exists public.project_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  color text not null default '#3b82f6',
  -- [{ "title", "description", "offsetDays", "time", "assignedTo", "dependsOn" (índice da etapa) }]
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.project_templates enable row level security;
grant select, insert, update, delete on public.project_templates to authenticated;

drop policy if exists "Owner manages templates" on public.project_templates;
create policy "Owner manages templates" on public.project_templates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- Liberar etapas dependentes ----------
-- SECURITY DEFINER porque quem conclui a etapa pode ser um membro, que não tem permissão para
-- mexer nas tarefas dos outros. A função só faz duas coisas, ambas só no campo status.
create or replace function public.tasks_release_dependents()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.is_completed and not old.is_completed then
    -- Concluiu: libera quem estava esperando
    update public.tasks
       set status = 'todo'
     where depends_on = new.id and status = 'blocked' and not is_completed and deleted_at is null;
  elsif old.is_completed and not new.is_completed then
    -- Reabriu: quem ainda nem começou volta a esperar. Quem já está andando não é mexido.
    update public.tasks
       set status = 'blocked'
     where depends_on = new.id and status = 'todo' and not is_completed and deleted_at is null;
  end if;
  return null;
end;
$$;

drop trigger if exists tasks_release_dependents on public.tasks;
create trigger tasks_release_dependents
  after update of is_completed on public.tasks
  for each row
  when (old.is_completed is distinct from new.is_completed)
  execute function public.tasks_release_dependents();

-- ---------- Proteção do membro (V6 + a exceção da liberação) ----------
create or replace function public.tasks_member_update_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
  v_next text;
  v_reopen boolean;
  -- completed_by / completed_by_name / completion_seen / next_spawned ficam de fora de propósito:
  -- quem preenche é o próprio trigger, o membro não consegue forjar.
  -- client e depends_on também ficam de fora: são do gestor.
  v_allowed text[] := array[
    'status', 'is_completed', 'completed_at', 'checklist', 'member_notes', 'attachments', 'updated_at'
  ];
begin
  -- Atualização feita por OUTRO gatilho (a liberação de etapa dependente), não pelo membro
  -- diretamente: pg_trigger_depth() > 1 só acontece aninhado, e o membro não consegue forjar isso
  -- por uma chamada comum. Mesmo assim só deixa passar mudança de status.
  if pg_trigger_depth() > 1 and auth.uid() is not null and (auth.uid())::text <> old.user_id then
    if (to_jsonb(new) - array['status', 'updated_at']) is distinct from (to_jsonb(old) - array['status', 'updated_at']) then
      raise exception 'Atualização automática só pode alterar o status' using errcode = '42501';
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
