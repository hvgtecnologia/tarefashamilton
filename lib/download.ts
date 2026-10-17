import { TaskAttachment } from '../types';

// ---------- Nome do arquivo ----------

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
  'application/pdf': 'pdf',
};

// O anexo pode ter sido salvo com o nome sem extensão (print colado, por exemplo). Sem extensão o
// arquivo baixa sem tipo e o sistema não sabe abrir, então completamos pelo tipo do conteúdo.
export function downloadName(att: Pick<TaskAttachment, 'name' | 'type'>, mime?: string): string {
  const name = (att.name || 'anexo').trim().replace(/[\\/:*?"<>|]/g, '_') || 'anexo';
  if (/\.[a-z0-9]{2,5}$/i.test(name)) return name;
  const ext = (mime && EXT_BY_MIME[mime]) || (att.type === 'pdf' ? 'pdf' : att.type === 'image' ? 'png' : '');
  return ext ? `${name}.${ext}` : name;
}

// Dois anexos com o mesmo nome (comum com "image.png") não podem se sobrescrever dentro do zip.
export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const key = name.toLowerCase();
    const count = (seen.get(key) || 0) + 1;
    seen.set(key, count);
    if (count === 1) return name;
    const dot = name.lastIndexOf('.');
    return dot > 0 ? `${name.slice(0, dot)} (${count})${name.slice(dot)}` : `${name} (${count})`;
  });
}

// ---------- ZIP (sem compressão) ----------
// Imagem e PDF já vêm comprimidos, então guardar sem compressão não custa espaço e dispensa uma
// biblioteca inteira só para isto.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: (((d.getFullYear() - 1980) & 0x7f) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export function buildZip(files: { name: string; data: Uint8Array }[], now: Date = new Date()): Uint8Array {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(now);
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // bit 11: nome em UTF-8 (acentos)
    lv.setUint16(8, 0, true);      // sem compressão
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);

    const entry = new Uint8Array(46 + name.length);
    const ev = new DataView(entry.buffer);
    ev.setUint32(0, 0x02014b50, true);
    ev.setUint16(4, 20, true);
    ev.setUint16(6, 20, true);
    ev.setUint16(8, 0x0800, true);
    ev.setUint16(10, 0, true);
    ev.setUint16(12, time, true);
    ev.setUint16(14, date, true);
    ev.setUint32(16, crc, true);
    ev.setUint32(20, size, true);
    ev.setUint32(24, size, true);
    ev.setUint16(28, name.length, true);
    ev.setUint32(42, offset, true);
    entry.set(name, 46);

    chunks.push(local, file.data);
    central.push(entry);
    offset += local.length + size;
  }

  const centralSize = central.reduce((sum, e) => sum + e.length, 0);
  const end = new Uint8Array(22);
  const dv = new DataView(end.buffer);
  dv.setUint32(0, 0x06054b50, true);
  dv.setUint16(8, files.length, true);
  dv.setUint16(10, files.length, true);
  dv.setUint32(12, centralSize, true);
  dv.setUint32(16, offset, true);

  const all = [...chunks, ...central, end];
  const out = new Uint8Array(all.reduce((sum, c) => sum + c.length, 0));
  let pos = 0;
  for (const c of all) { out.set(c, pos); pos += c.length; }
  return out;
}

// ---------- Baixar no navegador ----------

function saveBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revogar na hora cancela downloads grandes em alguns navegadores.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}

async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.blob();
}

// O atributo "download" do HTML é ignorado quando o arquivo está em outro domínio (é o caso do
// Storage do Supabase): o navegador apenas abriria a imagem numa aba. Buscando o conteúdo e
// entregando como arquivo local, ele cai direto na pasta Downloads.
export async function downloadAttachment(att: TaskAttachment): Promise<void> {
  try {
    const blob = await fetchBlob(att.url);
    saveBlob(blob, downloadName(att, blob.type));
  } catch {
    // Sem permissão de leitura entre domínios: melhor abrir o arquivo do que não fazer nada.
    window.open(att.url, '_blank', 'noopener');
    throw new Error(`Não consegui baixar "${att.name}" direto; abri em outra aba.`);
  }
}

export async function downloadAllAttachments(atts: TaskAttachment[], zipName = 'anexos'): Promise<void> {
  if (atts.length === 0) return;
  if (atts.length === 1) return downloadAttachment(atts[0]);

  const failed: string[] = [];
  const loaded: { name: string; data: Uint8Array }[] = [];
  const names = uniqueNames(atts.map((a) => downloadName(a)));

  await Promise.all(atts.map(async (att, i) => {
    try {
      const blob = await fetchBlob(att.url);
      const name = names[i] === downloadName(att) ? downloadName(att, blob.type) : names[i];
      loaded[i] = { name, data: new Uint8Array(await blob.arrayBuffer()) };
    } catch {
      failed.push(att.name);
    }
  }));

  const files = loaded.filter(Boolean);
  if (files.length === 0) throw new Error('Não consegui baixar nenhum anexo.');

  const safeZip = (zipName.trim() || 'anexos').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
  saveBlob(new Blob([buildZip(files)], { type: 'application/zip' }), `${safeZip}.zip`);

  if (failed.length > 0) {
    throw new Error(`Baixei ${files.length} de ${atts.length}. Não consegui: ${failed.join(', ')}.`);
  }
}
