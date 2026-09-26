-- Migração V9: liberar arquivos grandes (vídeo) no Meu Drive
-- Execute este SQL no Supabase SQL Editor. É seguro rodar mais de uma vez.
--
-- ATENÇÃO: este SQL sozinho NÃO resolve. Ele só deixa o limite do bucket explícito.
-- Quem manda de verdade é o limite GLOBAL do projeto, que fica no painel:
--
--     Storage → Settings → "Upload file size limit"
--
-- O padrão é 50 MB, e é por isso que vídeo grande não subia. No plano Pro dá para subir esse
-- número (o teto do plano é 50 GB). O menor dos dois valores — global e do bucket — é o que vale.

update storage.buckets
set file_size_limit = 5368709120  -- 5 GB
where id = 'drive';

-- Confira o que ficou valendo no bucket:
--   select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'drive';
--
-- E confira o global no painel (não há tabela para ler isso via SQL).

-- Nada de mime_types: allowed_mime_types fica NULL de propósito, para aceitar qualquer formato
-- de vídeo que a câmera ou o editor cuspir (mp4, mov, webm, mkv...).

-- Lembrete de consumo: vídeo é o que mais pesa na cota de tráfego do Supabase — foi o que estourou
-- a conta em setembro. Uma pasta de 500 MB compartilhada com 10 pessoas são 5 GB de egress.
-- Para vídeo grande com muita gente, prefira validade curta.
