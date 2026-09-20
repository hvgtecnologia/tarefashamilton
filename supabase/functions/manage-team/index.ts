// Supabase Edge Function: manage-team
// Cria, redefine a senha e remove membros da equipe. Só o gestor (quem não é membro) pode chamar.
// Deploy com: supabase functions deploy manage-team --project-ref <ref>
//
// Por que existe: criar usuário no Supabase Auth exige a service_role key, que jamais pode ir pro navegador.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });

// O membro loga com "usuário"; por baixo o Supabase Auth usa usuario@equipe.invalid.
// ".invalid" é um domínio reservado (RFC 6761) que nunca existe: nenhum e-mail sai daqui,
// ninguém consegue "recuperar senha" de um membro por fora, e o e-mail do gestor não é exposto.
// Precisa bater com TEAM_EMAIL_DOMAIN em lib/team.ts.
const TEAM_EMAIL_DOMAIN = "equipe.invalid";
const buildLoginEmail = (username: string) => `${username}@${TEAM_EMAIL_DOMAIN}`;

function normalizePhone(raw: unknown): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function validPassword(password: string): string | null {
  if (password.length < 6 || password.length > 72) return "A senha deve ter entre 6 e 72 caracteres.";
  return null;
}

async function findOwnMember(admin: SupabaseClient, masterId: string, memberId: unknown) {
  if (typeof memberId !== "string") return null;
  const { data } = await admin
    .from("team_members")
    .select("id, member_user_id, name, username, phone")
    .eq("id", memberId)
    .eq("master_id", masterId)
    .maybeSingle();
  return data;
}

async function createMember(admin: SupabaseClient, caller: User, body: any) {
  const name = String(body.name ?? "").trim();
  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  if (!name || name.length > 80) return json({ error: "Informe o nome do membro." }, 400);
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
    return json({ error: "O usuário deve ter de 3 a 30 caracteres: letras minúsculas, números, ponto, hífen ou underline." }, 400);
  }
  const passwordError = validPassword(password);
  if (passwordError) return json({ error: passwordError }, 400);

  const { data: existing } = await admin.from("team_members").select("id").eq("username", username).maybeSingle();
  if (existing) return json({ error: "Esse usuário já existe. Escolha outro." }, 409);

  const loginEmail = buildLoginEmail(username);
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: loginEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: name, team_member: true },
  });

  if (createError || !created?.user) {
    const message = createError?.message ?? "Não foi possível criar o usuário.";
    return json({ error: /already|registered|exists/i.test(message) ? "Esse usuário já existe. Escolha outro." : message }, 400);
  }

  const { data: member, error: insertError } = await admin
    .from("team_members")
    .insert({
      master_id: caller.id, member_user_id: created.user.id, name, username,
      login_email: loginEmail, phone: normalizePhone(body.phone) || null,
    })
    .select("id, member_user_id, name, username, phone, created_at")
    .single();

  if (insertError) {
    // Desfaz a criação do usuário para não deixar conta órfã
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: insertError.message }, 500);
  }

  return json({ member });
}

async function resetPassword(admin: SupabaseClient, caller: User, body: any) {
  const member = await findOwnMember(admin, caller.id, body.member_id);
  if (!member) return json({ error: "Membro não encontrado." }, 404);

  const password = String(body.password ?? "");
  const passwordError = validPassword(password);
  if (passwordError) return json({ error: passwordError }, 400);

  const { error } = await admin.auth.admin.updateUserById(member.member_user_id, { password });
  if (error) return json({ error: error.message }, 400);
  return json({ ok: true });
}

async function updateMember(admin: SupabaseClient, caller: User, body: any) {
  const member = await findOwnMember(admin, caller.id, body.member_id);
  if (!member) return json({ error: "Membro não encontrado." }, 404);

  const name = String(body.name ?? "").trim();
  if (!name || name.length > 80) return json({ error: "Informe o nome do membro." }, 400);

  const { data: updated, error } = await admin
    .from("team_members")
    .update({ name, phone: normalizePhone(body.phone) || null })
    .eq("id", member.id)
    .select("id, member_user_id, name, username, phone, created_at")
    .single();

  if (error) return json({ error: error.message }, 400);
  await admin.auth.admin.updateUserById(member.member_user_id, { user_metadata: { full_name: name, team_member: true } });
  return json({ member: updated });
}

async function deleteMember(admin: SupabaseClient, caller: User, body: any) {
  const member = await findOwnMember(admin, caller.id, body.member_id);
  if (!member) return json({ error: "Membro não encontrado." }, 404);

  // profiles.id referencia auth.users; remove antes por garantia (a migração V5 também põe ON DELETE CASCADE)
  await admin.from("profiles").delete().eq("id", member.member_user_id);

  // Tarefas dele voltam para o gestor sem responsável (FK on delete set null); o nome de quem concluiu fica no histórico.
  const { error } = await admin.auth.admin.deleteUser(member.member_user_id);
  if (error) return json({ error: error.message }, 400);
  return json({ ok: true });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    const caller = userData?.user;
    if (userError || !caller) return json({ error: "Sessão inválida. Entre novamente." }, 401);

    // Membro não gerencia equipe
    const { data: callerMembership } = await admin
      .from("team_members").select("id").eq("member_user_id", caller.id).maybeSingle();
    if (callerMembership) return json({ error: "Apenas o gestor pode gerenciar a equipe." }, 403);

    const body = await req.json().catch(() => ({}));
    switch (body?.action) {
      case "create": return await createMember(admin, caller, body);
      case "update": return await updateMember(admin, caller, body);
      case "reset_password": return await resetPassword(admin, caller, body);
      case "delete": return await deleteMember(admin, caller, body);
      default: return json({ error: "Ação inválida." }, 400);
    }
  } catch (err) {
    return json({ error: `Erro interno: ${(err as Error).message}` }, 500);
  }
});
