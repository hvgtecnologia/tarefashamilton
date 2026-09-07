import { Task, Urgency } from '../types';

/**
 * Converte as tarefas do sistema em formato iCalendar (.ics) compatível com Google Calendar, Apple Calendar e Outlook
 */
export function generateICalendarFeed(tasks: Task[], calendarName = 'Planner Semanal'): string {
  const now = new Date();
  const dtStamp = formatUtcDateTime(now);

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Planner Semanal//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeICalText(calendarName)}`,
    'X-WR-TIMEZONE:America/Sao_Paulo',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H'
  ];

  // Filtra apenas tarefas ativas e com data agendada ou prazo
  const activeScheduledTasks = tasks.filter(t => !t.deletedAt && (t.scheduledDate || t.dueDate));

  for (const task of activeScheduledTasks) {
    const targetDate = task.scheduledDate || task.dueDate;
    if (!targetDate) continue;

    // Normaliza a data (YYYY-MM-DD)
    const cleanDate = targetDate.replace(/-/g, '');
    const uid = `${task.id}@planner-semanal.app`;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${dtStamp}`);
    lines.push(`SUMMARY:${escapeICalText(task.title)}`);

    // Descrição detalhada incluindo notas e checklist
    let description = task.description || '';
    if (task.notes) {
      description += (description ? '\n\n' : '') + `Notas:\n${task.notes}`;
    }
    if (task.checklist && task.checklist.length > 0) {
      const checklistStr = task.checklist.map(c => `[${c.done ? 'X' : ' '}] ${c.text}`).join('\n');
      description += (description ? '\n\n' : '') + `Checklist:\n${checklistStr}`;
    }
    if (task.urgency) {
      description += (description ? '\n\n' : '') + `Prioridade: ${task.urgency}`;
    }

    if (description) {
      lines.push(`DESCRIPTION:${escapeICalText(description)}`);
    }

    // Prioridade iCal: 1 (Alta) a 9 (Baixa)
    if (task.urgency === Urgency.CRITICAL) lines.push('PRIORITY:1');
    else if (task.urgency === Urgency.HIGH) lines.push('PRIORITY:2');
    else if (task.urgency === Urgency.MEDIUM) lines.push('PRIORITY:5');
    else if (task.urgency === Urgency.LOW) lines.push('PRIORITY:9');

    // Status da tarefa
    if (task.isCompleted) {
      lines.push('STATUS:COMPLETED');
    } else {
      lines.push('STATUS:CONFIRMED');
    }

    // Horário ou Dia Inteiro
    if (task.scheduledTime && /^\d{2}:\d{2}$/.test(task.scheduledTime)) {
      const [hourStr, minStr] = task.scheduledTime.split(':');
      const startDateTimeStr = `${cleanDate}T${hourStr}${minStr}00`;
      
      // Duração estimada: 1 hora
      const startObj = new Date(`${targetDate}T${task.scheduledTime}:00`);
      const endObj = new Date(startObj.getTime() + 60 * 60 * 1000);
      const endHour = String(endObj.getHours()).padStart(2, '0');
      const endMin = String(endObj.getMinutes()).padStart(2, '0');
      const endYear = endObj.getFullYear();
      const endMonth = String(endObj.getMonth() + 1).padStart(2, '0');
      const endDay = String(endObj.getDate()).padStart(2, '0');
      const endDateTimeStr = `${endYear}${endMonth}${endDay}T${endHour}${endMin}00`;

      lines.push(`DTSTART:${startDateTimeStr}`);
      lines.push(`DTEND:${endDateTimeStr}`);
    } else {
      // Evento de dia inteiro
      lines.push(`DTSTART;VALUE=DATE:${cleanDate}`);
      
      // No iCal, DTEND de dia inteiro é exclusivo (dia seguinte)
      const nextDay = getNextDayISO(targetDate).replace(/-/g, '');
      lines.push(`DTEND;VALUE=DATE:${nextDay}`);
    }

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function escapeICalText(text: string): string {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n');
}

function formatUtcDateTime(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  const s = String(date.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${d}T${h}${min}${s}Z`;
}

function getNextDayISO(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split('T')[0];
}

/**
 * Faz download do arquivo .ics diretamente no navegador
 */
export function downloadICalFile(tasks: Task[], filename = 'planner-compromissos.ics') {
  const content = generateICalendarFeed(tasks);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
