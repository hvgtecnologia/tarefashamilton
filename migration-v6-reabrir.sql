-- Migração V6: qualquer pessoa pode reabrir uma tarefa concluída
-- Execute este SQL no Supabase SQL Editor (depois da V5). É seguro rodar mais de uma vez.
--
-- O que muda:
--  * Membro passa a poder reabrir a tarefa que concluiu (antes só o gestor).
--  * Ao reabrir (por qualquer pessoa) o banco limpa "concluída em / por quem" e o aviso de
--    conclusão nova, para a tarefa não continuar aparecendo como feita.
--  * tasks.next_spawned: lembra que a tarefa recorrente JÁ gerou a próxima ocorrência.
--    Sem isso, reabrir e concluir de novo criaria uma segunda cópia da próxima.

alter table public.tasks add column if not exists next_spawned boolean not null default false;

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
  v_allowed text[] := array[
    'status', 'is_completed', 'completed_at', 'checklist', 'member_notes', 'attachments', 'updated_at'
  ];
begin
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

      new.next_spawned := true;
    end if;
  end if;

  return new;
end;
$$;
