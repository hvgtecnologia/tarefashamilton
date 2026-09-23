-- Migração V7: Meu Drive (pastas e arquivos com link compartilhável e prazo de validade)
-- Execute este SQL no Supabase SQL Editor. É seguro rodar mais de uma vez.
--
-- O que cria:
--  * drive_folders / drive_files: só o dono (você) enxerga e mexe, via RLS.
--  * Pasta E arquivo têm link próprio (share_token de 128 bits) e validade (expires_at).
--    O link da pasta dá acesso a tudo que está dentro dela, incluindo subpastas.
--  * Bucket de Storage "drive" PRIVADO. A entrega para quem tem o link é feita por link assinado
--    de curta duração, gerado na hora pela Edge Function drive-share. É isso que faz a validade
--    valer de verdade: sem bucket privado, quem salvasse a URL crua continuaria baixando depois
--    de vencido, até a limpeza rodar.
--  * Duas portas públicas e só elas: get_shared_drive_folder e get_shared_drive_file. Não existe
--    policy de leitura pública nas tabelas, então ninguém lista seus arquivos, só quem tem o link.
--
-- Depois de rodar este SQL, siga o DRIVE_SETUP.md para publicar as Edge Functions e agendar a
-- limpeza (é ela que apaga de verdade o que venceu).

-- =====================================================================
-- 1. Tabelas
-- =====================================================================
create table if not exists public.drive_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  parent_id uuid references public.drive_folders(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Colunas de compartilhamento/validade da PASTA (idempotente: a V7 antiga não tinha)
alter table public.drive_folders add column if not exists share_token text;
alter table public.drive_folders add column if not exists expires_at timestamptz;
update public.drive_folders set share_token = encode(extensions.gen_random_bytes(16), 'hex') where share_token is null;
alter table public.drive_folders alter column share_token set default encode(extensions.gen_random_bytes(16), 'hex');
alter table public.drive_folders alter column share_token set not null;
create unique index if not exists drive_folders_share_token_key on public.drive_folders(share_token);

create table if not exists public.drive_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid references public.drive_folders(id) on delete cascade,
  name text not null,
  storage_path text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0,
  share_token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists drive_folders_user_parent_idx on public.drive_folders(user_id, parent_id);
create index if not exists drive_folders_expires_idx on public.drive_folders(expires_at) where expires_at is not null;
create index if not exists drive_files_user_folder_idx on public.drive_files(user_id, folder_id);
create index if not exists drive_files_expires_idx on public.drive_files(expires_at) where expires_at is not null;

alter table public.drive_folders enable row level security;
alter table public.drive_files enable row level security;

drop policy if exists "drive_folders_owner_all" on public.drive_folders;
create policy "drive_folders_owner_all" on public.drive_folders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "drive_files_owner_all" on public.drive_files;
create policy "drive_files_owner_all" on public.drive_files
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =====================================================================
-- 2. Validade herdada: uma pasta vencida derruba tudo que está dentro
-- =====================================================================
-- Sobe a árvore a partir da pasta e devolve true se ela (ou alguma pasta acima) já venceu.
create or replace function public.drive_branch_expired(p_folder_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  with recursive up as (
    select id, parent_id, expires_at from public.drive_folders where id = p_folder_id
    union all
    select f.id, f.parent_id, f.expires_at
    from public.drive_folders f join up on f.id = up.parent_id
  )
  select coalesce(bool_or(expires_at is not null and expires_at <= now()), false) from up;
$$;

-- =====================================================================
-- 3. Porta pública 1: link de um ARQUIVO
-- =====================================================================
create or replace function public.get_shared_drive_file(p_token text)
returns table (
  id uuid,
  name text,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  expires_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select f.id, f.name, f.storage_path, f.mime_type, f.size_bytes, f.expires_at
  from public.drive_files f
  where f.share_token = p_token
    and (f.expires_at is null or f.expires_at > now())
    and (f.folder_id is null or not public.drive_branch_expired(f.folder_id));
$$;

-- =====================================================================
-- 4. Porta pública 2: link de uma PASTA (tudo que está dentro, recursivo)
-- =====================================================================
-- Devolve uma linha por arquivo visível. folder_path é a trilha dentro da pasta compartilhada
-- ('' para os que estão na raiz dela), usada só para agrupar na página pública.
create or replace function public.get_shared_drive_folder(p_token text)
returns table (
  folder_name text,
  folder_expires_at timestamptz,
  file_id uuid,
  file_name text,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  folder_path text
)
language sql stable security definer set search_path = public
as $$
  with recursive root as (
    select id, name, expires_at
    from public.drive_folders
    where share_token = p_token
      and (expires_at is null or expires_at > now())
      and not public.drive_branch_expired(id)
  ),
  tree as (
    select r.id, ''::text as path from root r
    union all
    select c.id, case when t.path = '' then c.name else t.path || ' / ' || c.name end
    from public.drive_folders c
    join tree t on c.parent_id = t.id
    -- subpasta vencida não entra (nem o que está dentro dela)
    where c.expires_at is null or c.expires_at > now()
  )
  select r.name, r.expires_at, f.id, f.name, f.storage_path, f.mime_type, f.size_bytes, t.path
  from root r
  join tree t on true
  join public.drive_files f on f.folder_id = t.id
  where f.expires_at is null or f.expires_at > now()
  order by t.path, f.name;
$$;

revoke all on function public.get_shared_drive_file(text) from public;
revoke all on function public.get_shared_drive_folder(text) from public;
revoke all on function public.drive_branch_expired(uuid) from public;
grant execute on function public.get_shared_drive_file(text) to anon, authenticated;
grant execute on function public.get_shared_drive_folder(text) to anon, authenticated;

-- =====================================================================
-- 5. Bucket PRIVADO + acesso só do dono
-- =====================================================================
-- Privado de propósito: quem recebe o link baixa por link assinado de curta duração emitido pela
-- drive-share. Assim, vencido é vencido na hora, sem depender da limpeza ter rodado.
insert into storage.buckets (id, name, public)
values ('drive', 'drive', false)
on conflict (id) do update set public = false;

drop policy if exists "drive_owner_select" on storage.objects;
create policy "drive_owner_select" on storage.objects
  for select using (
    bucket_id = 'drive' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "drive_owner_insert" on storage.objects;
create policy "drive_owner_insert" on storage.objects
  for insert with check (
    bucket_id = 'drive' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "drive_owner_delete" on storage.objects;
create policy "drive_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'drive' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "drive_owner_update" on storage.objects;
create policy "drive_owner_update" on storage.objects
  for update using (
    bucket_id = 'drive' and (storage.foldername(name))[1] = auth.uid()::text
  );
