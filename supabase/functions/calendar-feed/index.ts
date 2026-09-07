// Supabase Edge Function: calendar-feed
// Serve um feed de calendário iCal (.ics) em tempo real para o Google Calendar, Apple Calendar e Outlook
// Deploy com: supabase functions deploy calendar-feed --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id") || url.searchParams.get("token");

    if (!userId) {
      return new Response("Parâmetro 'user_id' é obrigatório. Ex: ?user_id=SEU_UUID", {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // Inicializa o cliente Supabase usando a SERVICE_ROLE_KEY do ambiente do Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Busca as tarefas com data agendada do usuário
    const { data: tasks, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .not("scheduled_date", "is", null);

    if (error) {
      return new Response(`Erro ao carregar tarefas: ${error.message}`, {
        status: 500,
        headers: corsHeaders,
      });
    }

    const now = new Date();
    const dtStamp = formatUtcDateTime(now);

    const lines: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Planner Semanal//PT-BR",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:Planner Semanal",
      "X-WR-TIMEZONE:America/Sao_Paulo",
      "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
      "X-PUBLISHED-TTL:PT1H",
    ];

    for (const task of tasks || []) {
      const targetDate = task.scheduled_date || task.due_date;
      if (!targetDate) continue;

      const cleanDate = targetDate.replace(/-/g, "");
      const uid = `${task.id}@planner-semanal.app`;

      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${uid}`);
      lines.push(`DTSTAMP:${dtStamp}`);
      lines.push(`SUMMARY:${escapeICal(task.title || "Sem título")}`);

      let description = task.description || "";
      if (task.notes) {
        description += (description ? "\n\n" : "") + `Notas:\n${task.notes}`;
      }
      if (task.checklist && Array.isArray(task.checklist) && task.checklist.length > 0) {
        const checklistStr = task.checklist.map((c: any) => `[${c.done ? "X" : " "}] ${c.text}`).join("\n");
        description += (description ? "\n\n" : "") + `Checklist:\n${checklistStr}`;
      }
      if (task.urgency) {
        description += (description ? "\n\n" : "") + `Prioridade: ${task.urgency}`;
      }

      if (description) {
        lines.push(`DESCRIPTION:${escapeICal(description)}`);
      }

      if (task.urgency === "P0") lines.push("PRIORITY:1");
      else if (task.urgency === "P1") lines.push("PRIORITY:2");
      else if (task.urgency === "P2") lines.push("PRIORITY:5");
      else if (task.urgency === "P3") lines.push("PRIORITY:9");

      if (task.is_completed) {
        lines.push("STATUS:COMPLETED");
      } else {
        lines.push("STATUS:CONFIRMED");
      }

      if (task.scheduled_time && /^\d{2}:\d{2}$/.test(task.scheduled_time)) {
        const [hourStr, minStr] = task.scheduled_time.split(":");
        const startDateTimeStr = `${cleanDate}T${hourStr}${minStr}00`;

        const startObj = new Date(`${targetDate}T${task.scheduled_time}:00`);
        const endObj = new Date(startObj.getTime() + 60 * 60 * 1000);
        const endHour = String(endObj.getHours()).padStart(2, "0");
        const endMin = String(endObj.getMinutes()).padStart(2, "0");
        const endYear = endObj.getFullYear();
        const endMonth = String(endObj.getMonth() + 1).padStart(2, "0");
        const endDay = String(endObj.getDate()).padStart(2, "0");
        const endDateTimeStr = `${endYear}${endMonth}${endDay}T${endHour}${endMin}00`;

        lines.push(`DTSTART:${startDateTimeStr}`);
        lines.push(`DTEND:${endDateTimeStr}`);
      } else {
        lines.push(`DTSTART;VALUE=DATE:${cleanDate}`);
        const nextDay = getNextDayISO(targetDate).replace(/-/g, "");
        lines.push(`DTEND;VALUE=DATE:${nextDay}`);
      }

      lines.push("END:VEVENT");
    }

    lines.push("END:VCALENDAR");
    const icsContent = lines.join("\r\n");

    return new Response(icsContent, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="planner.ics"',
        "Cache-Control": "public, max-age=300", // cache de 5 minutos
      },
    });
  } catch (err) {
    return new Response(`Erro interno: ${(err as Error).message}`, {
      status: 500,
      headers: corsHeaders,
    });
  }
});

function escapeICal(text: string): string {
  if (!text) return "";
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\n|\r/g, "\\n");
}

function formatUtcDateTime(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  const s = String(date.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${d}T${h}${min}${s}Z`;
}

function getNextDayISO(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split("T")[0];
}
