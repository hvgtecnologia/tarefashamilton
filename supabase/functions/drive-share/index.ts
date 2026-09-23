// Supabase Edge Function: drive-share
// API do compartilhamento do Meu Drive. Recebe o token de uma PASTA ou de um ARQUIVO, confere a
// validade e devolve JSON com links de download assinados (1 hora).
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

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hora
const BUCKET = "drive";

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

  const sign = async (path: string, downloadName?: string): Promise<string | null> => {
    const { data, error } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS, downloadName ? { download: downloadName } : undefined);
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
      const entries = await Promise.all(
        folderRows.map(async (r: any) => ({
          name: r.file_name as string,
          size_bytes: Number(r.size_bytes) || 0,
          mime_type: r.mime_type as string,
          subfolder: (r.folder_path as string) || "",
          url: await sign(r.storage_path, r.file_name),
        })),
      );

      return json({
        folder: folderRows[0].folder_name,
        expires_at: folderRows[0].folder_expires_at,
        files: entries.filter((e) => e.url),
      });
    }

    // ---------- 2) O token é de um ARQUIVO? ----------
    const { data: fileRow } = await admin.rpc("get_shared_drive_file", { p_token: token }).maybeSingle();

    if (fileRow) {
      const downloadUrl = await sign(fileRow.storage_path, fileRow.name);
      // Sem "download" forçado: serve para o app mostrar a prévia de imagem/vídeo
      const inlineUrl = (await sign(fileRow.storage_path)) ?? downloadUrl;
      if (!downloadUrl) return gone();

      return json({
        file: fileRow.name,
        size_bytes: Number(fileRow.size_bytes) || 0,
        mime_type: fileRow.mime_type,
        expires_at: fileRow.expires_at,
        url: downloadUrl,
        inline_url: inlineUrl,
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
      return json({ folder: emptyFolder.name, expires_at: emptyFolder.expires_at, files: [] });
    }

    return gone();
  } catch (err) {
    console.error("drive-share:", (err as Error).message);
    return json({ error: "Erro ao abrir o link." }, 500);
  }
});
