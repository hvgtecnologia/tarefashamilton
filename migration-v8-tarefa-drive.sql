-- Migração V8: anexar pastas e arquivos do Meu Drive numa tarefa
-- Execute este SQL no Supabase SQL Editor. É seguro rodar mais de uma vez.
--
-- Por que uma coluna nova em vez de reaproveitar "attachments": são coisas diferentes.
-- attachments = arquivo que vive preso à tarefa. drive_links = referência a algo do Drive, que tem
-- vida própria (validade, link compartilhável, pode ser uma pasta inteira).
--
-- Cada item guarda o necessário para montar o link e desenhar o chip, sem precisar consultar o
-- Drive: { "kind": "folder" | "file", "id": uuid, "name": "...", "token": "..." }
-- O token é a chave pública de compartilhamento — é justamente o que permite ao membro da equipe
-- abrir o conteúdo sem ter acesso ao seu Drive.

alter table public.tasks add column if not exists drive_links jsonb not null default '[]'::jsonb;

-- Nada a fazer em RLS: a policy de tasks já cobre a coluna.
-- E o membro NÃO consegue alterar drive_links: o trigger tasks_member_update_guard (V5/V6) só
-- libera uma lista fixa de colunas de andamento, e esta não está nela. Confira rodando:
--   select pg_get_functiondef('public.tasks_member_update_guard'::regproc) like '%drive_links%';
-- Tem que dar "false" — ou seja, a coluna é do gestor.
