// Supabase Edge Function: manage-team
// Cria, redefine a senha e remove membros da equipe.
// Quem pode chamar:
//   * o gestor (master): tudo;
//   * um membro que é ADMINISTRADOR DE PROJETO: cadastrar gente nova (sempre dentro de um projeto que
//     ele administra) e editar / redefinir a senha só de quem ELE mesmo cadastrou. Nunca remover membro.
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

// Quem está chamando e com que poderes. ownerId é o master dono da equipe (o próprio, ou o master de
// quem é administrador de projeto).
interface Actor {
  user: User;
  ownerId: string;
  isMaster: boolean;
}

async function findOwnMember(admin: SupabaseClient, actor: Actor, memberId: unknown) {
  if (typeof memberId !== "string") return null;
  let query = admin
    .from("team_members")
    .select("id, member_user_id, name, username, phone")
    .eq("id", memberId)
    .eq("master_id", actor.ownerId);
  // O administrador de projeto só mexe em quem ele mesmo cadastrou
  if (!actor.isMaster) query = query.eq("created_by", actor.user.id);
  const { data } = await query.maybeSingle();
  return data;
}

async function isProjectAdmin(admin: SupabaseClient, userId: string, projectId: string): Promise<boolean> {
  const { data } = await admin
    .from("project_members").select("role")
    .eq("project_id", projectId).eq("member_user_id", userId).eq("role", "admin").maybeSingle();
  return !!data;
}

async function createMember(admin: SupabaseClient, actor: Actor, body: any) {
  const caller = actor.user;
  const projectId = typeof body.project_id === "string" && body.project_id ? body.project_id : null;

  // Administrador de projeto: só cadastra dentro de um projeto que administra
  if (!actor.isMaster) {
    if (!projectId) return json({ error: "Escolha o projeto em que a pessoa vai trabalhar." }, 400);
    if (!(await isProjectAdmin(admin, caller.id, projectId))) {
      return json({ error: "Você não administra este projeto." }, 403);
    }
  }
  // Se veio um projeto, ele tem de ser do master dono da equipe (vale para o master também)
  if (projectId) {
    const { data: project } = await admin.from("projects").select("id, user_id").eq("id", projectId).maybeSingle();
    if (!project || project.user_id !== actor.ownerId) return json({ error: "Projeto não encontrado." }, 404);
  }

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

  const memberRow = {
    master_id: actor.ownerId, member_user_id: created.user.id, name, username,
    login_email: loginEmail, phone: normalizePhone(body.phone) || null,
  };
  const columns = "id, member_user_id, name, username, phone, created_at";
  let { data: member, error: insertError } = await admin
    .from("team_members").insert({ ...memberRow, created_by: caller.id }).select(columns).single();

  // A coluna created_by vem da migração V11. Antes dela, o master continua cadastrando normalmente;
  // o administrador de projeto é que não funciona (e nem existe sem a V11).
  if (insertError && /created_by/i.test(insertError.message) && actor.isMaster) {
    const retry = await admin.from("team_members").insert(memberRow).select(columns).single();
    member = retry.data;
    insertError = retry.error;
  }

  if (insertError) {
    // Desfaz a criação do usuário para não deixar conta órfã
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: insertError.message }, 500);
  }

  // Já entra no projeto (como participante; virar admin é uma decisão à parte)
  if (projectId) {
    const { error: pmError } = await admin.from("project_members").insert({
      project_id: projectId, member_user_id: created.user.id, role: "member", added_by: caller.id,
    });
    if (pmError) {
      // Sem isso a pessoa ficaria cadastrada mas sem lugar no projeto: desfaz tudo
      await admin.from("team_members").delete().eq("id", member.id);
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: `Não foi possível colocar a pessoa no projeto: ${pmError.message}` }, 500);
    }
  }

  return json({ member });
}

async function resetPassword(admin: SupabaseClient, actor: Actor, body: any) {
  const member = await findOwnMember(admin, actor, body.member_id);
  if (!member) return json({ error: "Membro não encontrado." }, 404);

  const password = String(body.password ?? "");
  const passwordError = validPassword(password);
  if (passwordError) return json({ error: passwordError }, 400);

  const { error } = await admin.auth.admin.updateUserById(member.member_user_id, { password });
  if (error) return json({ error: error.message }, 400);
  return json({ ok: true });
}

async function updateMember(admin: SupabaseClient, actor: Actor, body: any) {
  const member = await findOwnMember(admin, actor, body.member_id);
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

async function deleteMember(admin: SupabaseClient, actor: Actor, body: any) {
  // Remover alguém da equipe continua sendo só do master
  if (!actor.isMaster) return json({ error: "Apenas o gestor pode remover membros." }, 403);
  const member = await findOwnMember(admin, actor, body.member_id);
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

    // Gestor, ou membro que administra algum projeto. Membro comum não gerencia equipe.
    const { data: callerMembership } = await admin
      .from("team_members").select("id, master_id").eq("member_user_id", caller.id).maybeSingle();

    let actor: Actor;
    if (!callerMembership) {
      actor = { user: caller, ownerId: caller.id, isMaster: true };
    } else {
      const { data: adminRow } = await admin
        .from("project_members").select("project_id")
        .eq("member_user_id", caller.id).eq("role", "admin").limit(1).maybeSingle();
      if (!adminRow) return json({ error: "Apenas o gestor pode gerenciar a equipe." }, 403);
      actor = { user: caller, ownerId: callerMembership.master_id, isMaster: false };
    }

    const body = await req.json().catch(() => ({}));
    switch (body?.action) {
      case "create": return await createMember(admin, actor, body);
      case "update": return await updateMember(admin, actor, body);
      case "reset_password": return await resetPassword(admin, actor, body);
      case "delete": return await deleteMember(admin, actor, body);
      default: return json({ error: "Ação inválida." }, 400);
    }
  } catch (err) {
    return json({ error: `Erro interno: ${(err as Error).message}` }, 500);
  }
});
