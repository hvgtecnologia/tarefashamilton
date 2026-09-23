// Supabase Edge Function: drive-share
// Página pública do Meu Drive. Sem login: quem tem o link vê e baixa.
// O mesmo link serve para PASTA (lista tudo que está dentro, incluindo subpastas) e para ARQUIVO.
// Deploy: supabase functions deploy drive-share --no-verify-jwt
//
// Por que não entrega a URL crua do Storage: o bucket "drive" é privado de propósito. Aqui a
// validade é conferida na hora e o download sai por link assinado de curta duração. Assim,
// vencido é vencido na mesma hora, sem depender de a limpeza já ter rodado.
//
// Também responde JSON (?format=json) para uso por automação.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hora
const BUCKET = "drive";

const escapeHtml = (s: string) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

function formatBytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function expiryNote(expiresAt: string | null): string {
  if (!expiresAt) return "";
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "";
  const hours = diff / 3_600_000;
  const txt = hours < 1
    ? `${Math.ceil(diff / 60000)} min`
    : hours < 24
      ? `${Math.ceil(hours)} h`
      : `${Math.ceil(hours / 24)} dias`;
  return `<p class="note">Este link expira em ${txt}.</p>`;
}

const SHELL = (title: string, body: string) => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, system-ui, sans-serif; background: #f8fafc; color: #0f172a; margin: 0;
         display: flex; min-height: 100vh; align-items: center; justify-content: center; padding: 24px; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 28px; max-width: 560px;
          width: 100%; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .center { text-align: center; }
  h1 { font-size: 19px; margin: 0 0 4px; word-break: break-word; }
  .sub { color: #64748b; font-size: 13px; margin: 0 0 20px; }
  .note { color: #94a3b8; font-size: 12px; margin: 16px 0 0; }
  .icon { font-size: 40px; margin-bottom: 12px; }
  img, video { max-width: 100%; border-radius: 10px; margin-bottom: 20px; display: block; }
  a.btn { display: inline-block; background: #2563eb; color: #fff; text-decoration: none; font-weight: 700;
          padding: 12px 22px; border-radius: 10px; font-size: 14px; }
  a.btn:hover { background: #1d4ed8; }
  ul { list-style: none; padding: 0; margin: 0; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
  li { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-bottom: 1px solid #f1f5f9; }
  li:last-child { border-bottom: 0; }
  .fname { flex: 1; min-width: 0; }
  .fname strong { display: block; font-size: 14px; font-weight: 600; word-break: break-word; }
  .fname span { font-size: 12px; color: #94a3b8; }
  a.dl { color: #2563eb; text-decoration: none; font-weight: 700; font-size: 13px; white-space: nowrap; }
  h2.group { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: #94a3b8;
             margin: 20px 0 8px; font-weight: 700; }
</style></head>
<body><div class="card">${body}</div></body></html>`;

const html = (title: string, body: string, status = 200) =>
  new Response(SHELL(title, body), { status, headers: { "Content-Type": "text/html; charset=utf-8" } });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" },
  });

const goneHtml = () =>
  html(
    "Link indisponível",
    `<div class="center"><div class="icon">⌛</div><h1>Esse link não está mais disponível</h1>
     <p class="sub">Ele expirou ou o conteúdo foi removido.</p></div>`,
    404,
  );

serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("t") ?? url.pathname.split("/").filter(Boolean).pop();
  const wantsJson = url.searchParams.get("format") === "json" ||
    (req.headers.get("accept") ?? "").includes("application/json");

  if (!token || token === "drive-share") {
    return wantsJson
      ? json({ error: "Faltou o código do link (?t=...)" }, 400)
      : html("Link inválido", `<div class="center"><div class="icon">🔗</div><h1>Link inválido</h1>
             <p class="sub">Faltou o código.</p></div>`, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  // service_role porque o bucket é privado: é preciso assinar o download.
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

  // ---------- 1) O token é de uma PASTA? ----------
  const { data: folderRows } = await admin.rpc("get_shared_drive_folder", { p_token: token });

  if (folderRows && folderRows.length > 0) {
    const folderName: string = folderRows[0].folder_name;
    const expiresAt: string | null = folderRows[0].folder_expires_at;

    const files = await Promise.all(
      folderRows.map(async (r: any) => ({
        name: r.file_name as string,
        size: Number(r.size_bytes) || 0,
        mime: r.mime_type as string,
        path: (r.folder_path as string) || "",
        url: await sign(r.storage_path, r.file_name),
      })),
    );
    const usable = files.filter((f) => f.url);

    if (wantsJson) {
      return json({
        folder: folderName,
        expires_at: expiresAt,
        files: usable.map((f) => ({ name: f.name, size_bytes: f.size, mime_type: f.mime, subfolder: f.path, url: f.url })),
      });
    }

    const totalBytes = usable.reduce((sum, f) => sum + f.size, 0);
    const groups = new Map<string, typeof usable>();
    for (const f of usable) {
      if (!groups.has(f.path)) groups.set(f.path, []);
      groups.get(f.path)!.push(f);
    }

    const sections = [...groups.entries()]
      .map(([path, list]) => {
        const items = list
          .map(
            (f) => `<li><div class="fname"><strong>${escapeHtml(f.name)}</strong><span>${formatBytes(f.size)}</span></div>
                    <a class="dl" href="${f.url}">Baixar</a></li>`,
          )
          .join("");
        const heading = path ? `<h2 class="group">${escapeHtml(path)}</h2>` : "";
        return `${heading}<ul>${items}</ul>`;
      })
      .join("");

    return html(
      folderName,
      `<h1>📁 ${escapeHtml(folderName)}</h1>
       <p class="sub">${usable.length} arquivo${usable.length === 1 ? "" : "s"} · ${formatBytes(totalBytes)}</p>
       ${sections}
       ${expiryNote(expiresAt)}`,
    );
  }

  // ---------- 2) O token é de um ARQUIVO? ----------
  const { data: fileRow } = await admin.rpc("get_shared_drive_file", { p_token: token }).maybeSingle();

  if (fileRow) {
    const downloadUrl = await sign(fileRow.storage_path, fileRow.name);
    if (!downloadUrl) return wantsJson ? json({ error: "Arquivo indisponível" }, 404) : goneHtml();

    if (wantsJson) {
      return json({
        file: fileRow.name,
        size_bytes: Number(fileRow.size_bytes) || 0,
        mime_type: fileRow.mime_type,
        expires_at: fileRow.expires_at,
        url: downloadUrl,
      });
    }

    // Preview inline precisa de link sem "download" forçado
    const inlineUrl = (await sign(fileRow.storage_path)) ?? downloadUrl;
    const mime: string = fileRow.mime_type ?? "";
    const preview = mime.startsWith("image/")
      ? `<img src="${inlineUrl}" alt="${escapeHtml(fileRow.name)}">`
      : mime.startsWith("video/")
        ? `<video src="${inlineUrl}" controls></video>`
        : `<div class="icon">📄</div>`;

    return html(
      fileRow.name,
      `<div class="center">${preview}<h1>${escapeHtml(fileRow.name)}</h1>
       <p class="sub">${formatBytes(Number(fileRow.size_bytes) || 0)}</p>
       <a class="btn" href="${downloadUrl}">Baixar arquivo</a>
       ${expiryNote(fileRow.expires_at)}</div>`,
    );
  }

  // ---------- 3) Pasta vazia ainda é uma pasta válida ----------
  // get_shared_drive_folder devolve zero linhas tanto para "não existe/venceu" quanto para
  // "existe e está vazia". Só aqui, sem nenhum arquivo, checamos qual dos dois é.
  const { data: emptyFolder } = await admin
    .from("drive_folders")
    .select("name, expires_at")
    .eq("share_token", token)
    .maybeSingle();

  if (emptyFolder && (!emptyFolder.expires_at || new Date(emptyFolder.expires_at) > new Date())) {
    if (wantsJson) return json({ folder: emptyFolder.name, expires_at: emptyFolder.expires_at, files: [] });
    return html(
      emptyFolder.name,
      `<div class="center"><div class="icon">📁</div><h1>${escapeHtml(emptyFolder.name)}</h1>
       <p class="sub">Esta pasta ainda está vazia.</p></div>${expiryNote(emptyFolder.expires_at)}`,
    );
  }

  return wantsJson ? json({ error: "Link expirado ou inexistente" }, 404) : goneHtml();
});
