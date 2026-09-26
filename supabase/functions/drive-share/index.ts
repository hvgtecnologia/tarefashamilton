// Supabase Edge Function: drive-share
// API do compartilhamento do Meu Drive. Recebe o token de uma PASTA ou de um ARQUIVO, confere a
// validade e devolve JSON com links de download assinados.
// Deploy: supabase functions deploy drive-share --no-verify-jwt
//
// Por que só JSON: o Supabase força "text/plain" em qualquer HTML servido por Edge Function
// (proteção antiphishing do domínio *.supabase.co), então uma página montada aqui chegaria como
// texto cru no navegador. Quem desenha a página é o app, na rota #/s/<token>; esta função continua
// sendo a autoridade — o bucket é privado, e só aqui a validade é conferida e o download é assinado.
//
// Também serve para automação (Claude, n8n, scripts): basta chamar e ler o JSON.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUCKET = "drive";

// Teto da assinatura. Seis horas em vez de uma: um vídeo grande baixado numa conexão ruim passava
// da hora e o navegador não conseguia retomar o download, o que aparecia para quem recebeu o link
// como "link quebrado". Também cobre o caso de deixar a página aberta e só clicar depois.
const MAX_TTL_SECONDS = 6 * 60 * 60;
const MIN_TTL_SECONDS = 60;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });

const gone = () => json({ error: "Esse link expirou ou não existe mais." }, 404);

// A assinatura nunca pode durar mais do que a validade do conteúdo, senão um link assinado
// sobreviveria ao vencimento — e a promessa do Drive é que vencido é vencido na hora.
function ttlFor(expiresAt: string | null | undefined): number {
  if (!expiresAt) return MAX_TTL_SECONDS;
  const remaining = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
  return Math.max(MIN_TTL_SECONDS, Math.min(MAX_TTL_SECONDS, remaining));
}

// Só o que o navegador toca nativamente ganha link de visualização. Nos outros o botão de baixar
// já resolve, e assinar duas vezes seria round-trip jogado fora.
const isPlayable = (mime: string | null | undefined) =>
  !!mime && (mime.startsWith("video/") || mime.startsWith("audio/") || mime.startsWith("image/") || mime === "application/pdf");

// Nota de texto (orientação escrita no app). O conteúdo vai embutido no JSON em vez de a página
// buscar o arquivo: o visitante lê e copia sem um segundo pedido, e não dependemos de CORS no
// Storage. Só até o teto — acima disso é arquivo normal, para baixar.
const TEXT_INLINE_LIMIT_BYTES = 128 * 1024;

const isTextNote = (mime: string | null | undefined, name: string | null | undefined) =>
  (!!mime && mime.startsWith("text/")) || (!!name && /\.(txt|md|markdown|csv|log)$/i.test(name));

async function readText(
  admin: ReturnType<typeof createClient>,
  path: string,
  sizeBytes: number,
  mime: string | null | undefined,
  name: string | null | undefined,
): Promise<string | null> {
  if (!isTextNote(mime, name)) return null;
  if (sizeBytes > TEXT_INLINE_LIMIT_BYTES) return null;
  const { data, error } = await admin.storage.from(BUCKET).download(path);
  if (error || !data) {
    console.error("Erro ao ler nota", path, error?.message);
    return null;
  }
  return await data.text();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const token = url.searchParams.get("t") ?? url.pathname.split("/").filter(Boolean).pop();

  if (!token || token === "drive-share") {
    return json({ error: "Faltou o código do link (?t=...)" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  // service_role porque o bucket é privado: é preciso assinar cada download.
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const sign = async (path: string, ttl: number, downloadName?: string): Promise<string | null> => {
    const { data, error } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(path, ttl, downloadName ? { download: downloadName } : undefined);
    if (error) {
      console.error("Erro ao assinar", path, error.message);
      return null;
    }
    return data?.signedUrl ?? null;
  };

  try {
    // ---------- 1) O token é de uma PASTA (com arquivos)? ----------
    const { data: folderRows } = await admin.rpc("get_shared_drive_folder", { p_token: token });

    if (folderRows && folderRows.length > 0) {
      const folderExpiresAt = folderRows[0].folder_expires_at as string | null;
      const ttl = ttlFor(folderExpiresAt);

      const files = await Promise.all(
        folderRows.map(async (r: any) => {
          const size = Number(r.size_bytes) || 0;
          const downloadUrl = await sign(r.storage_path, ttl, r.file_name);
          // Sem "download" forçado: é o que permite assistir o vídeo na própria página.
          const inlineUrl = isPlayable(r.mime_type) ? await sign(r.storage_path, ttl) : null;
          const textContent = await readText(admin, r.storage_path, size, r.mime_type, r.file_name);
          return {
            name: r.file_name as string,
            size_bytes: size,
            mime_type: r.mime_type as string,
            subfolder: (r.folder_path as string) || "",
            url: downloadUrl,
            inline_url: inlineUrl,
            text_content: textContent,
          };
        }),
      );

      // Antes um arquivo que falhasse ao assinar era removido da lista em silêncio, então a pasta
      // aparecia incompleta sem ninguém saber por quê. Agora ele fica visível como indisponível.
      return json({
        folder: folderRows[0].folder_name,
        expires_at: folderExpiresAt,
        ttl_seconds: ttl,
        files,
      });
    }

    // ---------- 2) O token é de um ARQUIVO? ----------
    const { data: fileRow } = await admin.rpc("get_shared_drive_file", { p_token: token }).maybeSingle();

    if (fileRow) {
      const ttl = ttlFor(fileRow.expires_at);
      const downloadUrl = await sign(fileRow.storage_path, ttl, fileRow.name);
      const inlineUrl = (isPlayable(fileRow.mime_type) ? await sign(fileRow.storage_path, ttl) : null) ?? downloadUrl;
      if (!downloadUrl) return gone();

      const size = Number(fileRow.size_bytes) || 0;
      return json({
        file: fileRow.name,
        size_bytes: size,
        mime_type: fileRow.mime_type,
        expires_at: fileRow.expires_at,
        ttl_seconds: ttl,
        url: downloadUrl,
        inline_url: inlineUrl,
        text_content: await readText(admin, fileRow.storage_path, size, fileRow.mime_type, fileRow.name),
      });
    }

    // ---------- 3) Pasta vazia ainda é uma pasta válida ----------
    // get_shared_drive_folder devolve zero linhas tanto para "não existe/venceu" quanto para
    // "existe e está vazia". Só aqui, sem nenhum arquivo, distinguimos os dois casos.
    const { data: emptyFolder } = await admin
      .from("drive_folders")
      .select("name, expires_at")
      .eq("share_token", token)
      .maybeSingle();

    if (emptyFolder && (!emptyFolder.expires_at || new Date(emptyFolder.expires_at) > new Date())) {
      return json({
        folder: emptyFolder.name,
        expires_at: emptyFolder.expires_at,
        ttl_seconds: ttlFor(emptyFolder.expires_at),
        files: [],
      });
    }

    return gone();
  } catch (err) {
    console.error("drive-share:", (err as Error).message);
    return json({ error: "Erro ao abrir o link." }, 500);
  }
});
