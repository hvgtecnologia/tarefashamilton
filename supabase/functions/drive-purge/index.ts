// Supabase Edge Function: drive-purge
// Apaga de verdade (Storage + banco) o que venceu no Meu Drive: arquivos vencidos E pastas
// vencidas (com tudo que está dentro, inclusive subpastas).
// Chamada pelo Cron Job do Supabase (ver DRIVE_SETUP.md) ou manualmente.
// Deploy: supabase functions deploy drive-purge --no-verify-jwt
//
// A página pública já nega o acesso assim que vence; esta função é o que libera o espaço.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUCKET = "drive";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } });

// Todos os ids de pasta abaixo (e incluindo) das raízes informadas
async function collectFolderTree(admin: SupabaseClient, rootIds: string[]): Promise<string[]> {
  const all = new Set<string>(rootIds);
  let frontier = rootIds;

  // Profundidade limitada por segurança: uma árvore de 50 níveis já é patológica
  for (let depth = 0; depth < 50 && frontier.length > 0; depth++) {
    const { data, error } = await admin.from("drive_folders").select("id").in("parent_id", frontier);
    if (error) throw new Error(error.message);
    const next = (data ?? []).map((r) => r.id as string).filter((id) => !all.has(id));
    next.forEach((id) => all.add(id));
    frontier = next;
  }
  return [...all];
}

async function removeFromStorage(admin: SupabaseClient, paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await admin.storage.from(BUCKET).remove(paths.slice(i, i + 100));
    if (error) console.error("Erro ao apagar do Storage:", error.message);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const now = new Date().toISOString();

  try {
    let purgedFiles = 0;
    let purgedFolders = 0;

    // ---------- 1) Pastas vencidas, com tudo dentro ----------
    const { data: expiredFolders, error: folderError } = await admin
      .from("drive_folders")
      .select("id")
      .not("expires_at", "is", null)
      .lt("expires_at", now);
    if (folderError) return json({ error: folderError.message }, 500);

    if (expiredFolders && expiredFolders.length > 0) {
      const rootIds = expiredFolders.map((f) => f.id as string);
      const treeIds = await collectFolderTree(admin, rootIds);

      // Apaga os objetos do Storage antes: o cascade do banco apaga as linhas, nunca os arquivos
      for (let i = 0; i < treeIds.length; i += 50) {
        const slice = treeIds.slice(i, i + 50);
        const { data: files, error } = await admin.from("drive_files").select("storage_path").in("folder_id", slice);
        if (error) return json({ error: error.message }, 500);
        const paths = (files ?? []).map((f) => f.storage_path as string);
        if (paths.length > 0) {
          await removeFromStorage(admin, paths);
          purgedFiles += paths.length;
        }
      }

      // Apagar as raízes basta: subpastas e arquivos caem por cascade
      const { error: deleteError } = await admin.from("drive_folders").delete().in("id", rootIds);
      if (deleteError) return json({ error: deleteError.message }, 500);
      purgedFolders = rootIds.length;
    }

    // ---------- 2) Arquivos vencidos individualmente ----------
    const { data: expiredFiles, error: fileError } = await admin
      .from("drive_files")
      .select("id, storage_path")
      .not("expires_at", "is", null)
      .lt("expires_at", now);
    if (fileError) return json({ error: fileError.message }, 500);

    if (expiredFiles && expiredFiles.length > 0) {
      await removeFromStorage(admin, expiredFiles.map((f) => f.storage_path as string));
      const { error: deleteError } = await admin.from("drive_files").delete().in("id", expiredFiles.map((f) => f.id));
      if (deleteError) return json({ error: deleteError.message }, 500);
      purgedFiles += expiredFiles.length;
    }

    return json({ purged_folders: purgedFolders, purged_files: purgedFiles });
  } catch (err) {
    return json({ error: `Erro interno: ${(err as Error).message}` }, 500);
  }
});
