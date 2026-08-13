-- Migração V3: Adiciona horário da tarefa (usado para ordenar as tarefas do dia)
-- Execute este SQL no Supabase SQL Editor

-- 1. Horário (formato "HH:MM"), pareado com scheduled_date
alter table tasks add column if not exists scheduled_time text;
