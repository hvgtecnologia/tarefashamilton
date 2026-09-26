import * as tus from 'tus-js-client';
import { supabase, isSupabaseConfigured, getCurrentUser } from './supabase';
import { DriveFolder, DriveFile } from '../types';

export const DRIVE_BUCKET = 'drive';

function sanitizeFileName(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function formatBytes(n: number): string {
    if (!n) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
    return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// Opções fixas de validade oferecidas na tela. null = sem validade (nunca apaga sozinho).
export const EXPIRY_OPTIONS: { label: string; hours: number | null }[] = [
    { label: '1 hora', hours: 1 },
    { label: '6 horas', hours: 6 },
    { label: '24 horas', hours: 24 },
    { label: '3 dias', hours: 72 },
    { label: '7 dias', hours: 24 * 7 },
    { label: '30 dias', hours: 24 * 30 },
    { label: 'Sem validade', hours: null },
];

// Validade da PASTA: o pedido é que toda pasta tenha prazo, então o padrão é 30 dias
// e "sem validade" fica por último, como exceção consciente.
export const FOLDER_EXPIRY_OPTIONS: { label: string; hours: number | null }[] = [
    { label: '7 dias', hours: 24 * 7 },
    { label: '15 dias', hours: 24 * 15 },
    { label: '30 dias', hours: 24 * 30 },
    { label: '60 dias', hours: 24 * 60 },
    { label: '90 dias', hours: 24 * 90 },
    { label: 'Sem validade', hours: null },
];

export const DEFAULT_FOLDER_EXPIRY_HOURS = 24 * 30;

export function expiresAtFromHours(hours: number | null): string | null {
    if (hours === null) return null;
    return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

export interface SharedDriveFileEntry {
    name: string;
    size_bytes: number;
    mime_type: string;
    subfolder: string;
    // null quando a assinatura falhou. Antes o arquivo era omitido da lista em silêncio e a pasta
    // parecia incompleta; agora aparece marcado como indisponível.
    url: string | null;
    // Link sem download forçado, para assistir/ver na própria página. Só vem para vídeo, áudio,
    // imagem e PDF.
    inline_url?: string | null;
    // Conteúdo já embutido, para nota de texto. Vem pronto no payload em vez de a página buscar o
    // arquivo: evita depender de CORS no Storage e o texto aparece sem um segundo pedido.
    text_content?: string | null;
}

export interface SharedDrivePayload {
    folder?: string;
    file?: string;
    size_bytes?: number;
    mime_type?: string;
    url?: string;
    inline_url?: string;
    expires_at?: string | null;
    // Quanto tempo os links assinados deste payload valem. A página usa isso para buscar links
    // novos antes de vencerem, em vez de mandar o visitante num link morto.
    ttl_seconds?: number;
    text_content?: string | null;
    files?: SharedDriveFileEntry[];
}

// Nota de texto: orientação escrita direto no app e guardada como arquivo na pasta, para quem
// recebe o link ler e copiar.
export const TEXT_MIME = 'text/plain';
// Teto do que a Edge Function embute no payload do link. Nota é texto curto; acima disso o visitante
// baixa o arquivo como qualquer outro.
export const TEXT_INLINE_LIMIT_BYTES = 128 * 1024;

export function isTextFile(mimeType?: string | null, name?: string | null): boolean {
    if (mimeType && mimeType.startsWith('text/')) return true;
    return !!name && /\.(txt|md|markdown|csv|log)$/i.test(name);
}

// Garante que a nota tenha extensão de texto, senão o navegador de quem baixa não sabe o que fazer
// com ela. Só aceita uma extensão de texto conhecida: um nome como "Processo v1.2" tem um ponto no
// fim mas "2" não é extensão nenhuma, e sem isso o arquivo saía como tipo desconhecido.
const TEXT_EXTENSION_RE = /\.(txt|md|markdown|csv|log)$/i;

export function normalizeTextFileName(name: string): string {
    const trimmed = name.trim() || 'Orientações';
    return TEXT_EXTENSION_RE.test(trimmed) ? trimmed : `${trimmed}.txt`;
}

export async function createDriveTextFile(
    name: string,
    content: string,
    folderId: string | null,
    expiryHours: number | null,
): Promise<DriveFile> {
    const fileName = normalizeTextFileName(name);
    const file = new File([content], fileName, { type: TEXT_MIME });
    return uploadDriveFile(file, folderId, expiryHours);
}

// Lê a nota para o dono editar. O bucket é privado, mas o supabase-js já vai autenticado.
export async function readDriveText(file: DriveFile): Promise<string> {
    const { data, error } = await supabase.storage.from(DRIVE_BUCKET).download(file.storagePath);
    if (error || !data) throw new Error('Não foi possível abrir a nota.');
    return await data.text();
}

// Sobrescreve a nota no mesmo caminho, então o link já compartilhado continua valendo e passa a
// mostrar o texto novo.
export async function saveDriveText(file: DriveFile, content: string): Promise<void> {
    const blob = new Blob([content], { type: TEXT_MIME });
    const { error: uploadError } = await supabase.storage
        .from(DRIVE_BUCKET)
        .upload(file.storagePath, blob, { contentType: TEXT_MIME, upsert: true });
    if (uploadError) throw new Error(`Não foi possível salvar: ${uploadError.message}`);

    const { error } = await supabase
        .from('drive_files')
        .update({ size_bytes: blob.size })
        .eq('id', file.id);
    if (error) throw new Error(error.message);
}

export async function renameDriveFile(id: string, name: string): Promise<void> {
    const { error } = await supabase.from('drive_files').update({ name: normalizeTextFileName(name) }).eq('id', id);
    if (error) throw new Error(error.message);
}

// Quando buscar links novos. Os links assinados morrem na hora marcada, e quem recebe o link
// costuma deixar a página aberta e clicar bem depois — então renovamos a 80% do prazo, com um
// piso de 1 minuto para nunca virar um laço apertado.
export function refreshDelayMs(ttlSeconds?: number | null): number {
    const ttl = ttlSeconds && ttlSeconds > 120 ? ttlSeconds : 600;
    return Math.max(60_000, Math.round(ttl * 0.8 * 1000));
}

// Rota pública dentro do próprio app (ex: https://seuapp.com/#/s/<token>).
// Fica no domínio do app de propósito: o Supabase força text/plain em HTML servido por Edge
// Function, então uma página hospedada lá não renderiza. Além disso, um link no seu domínio passa
// muito mais confiança para quem recebe do que um endereço supabase.co.
export const SHARE_ROUTE_PREFIX = '#/s/';

export function getShareUrl(shareToken: string): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/${SHARE_ROUTE_PREFIX}${shareToken}`;
}

// Extrai o token de um endereço como ".../#/s/abc123" (null quando não é um link de compartilhamento)
export function parseShareToken(hash: string): string | null {
    const i = hash.indexOf(SHARE_ROUTE_PREFIX);
    if (i === -1) return null;
    const token = hash.slice(i + SHARE_ROUTE_PREFIX.length).split(/[?&/]/)[0].trim();
    return /^[a-zA-Z0-9_-]{8,128}$/.test(token) ? token : null;
}

// Quem serve o conteúdo é a Edge Function: ela confere a validade e assina os downloads.
export async function fetchSharedDrive(token: string): Promise<SharedDrivePayload> {
    const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
    const projectRef = supabaseUrl.replace('https://', '').split('.')[0];
    const res = await fetch(`https://${projectRef}.functions.supabase.co/drive-share?t=${encodeURIComponent(token)}&format=json`);
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload || payload.error) {
        throw new Error(payload?.error || 'Esse link expirou ou não existe mais.');
    }
    return payload as SharedDrivePayload;
}

// Link temporário para o DONO abrir/baixar o próprio arquivo dentro do app (bucket é privado)
export async function getOwnerFileUrl(file: DriveFile): Promise<string> {
    const { data, error } = await supabase.storage.from(DRIVE_BUCKET).createSignedUrl(file.storagePath, 60 * 60);
    if (error || !data?.signedUrl) throw new Error('Não foi possível abrir o arquivo.');
    return data.signedUrl;
}

function mapFolder(row: any): DriveFolder {
    return {
        id: row.id,
        name: row.name,
        parentId: row.parent_id,
        shareToken: row.share_token,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
    };
}

function mapFile(row: any): DriveFile {
    return {
        id: row.id,
        folderId: row.folder_id,
        name: row.name,
        storagePath: row.storage_path,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
        shareToken: row.share_token,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
    };
}

export async function listFolders(parentId: string | null): Promise<DriveFolder[]> {
    if (!isSupabaseConfigured()) return [];
    let query = supabase.from('drive_folders').select('*').order('name');
    query = parentId ? query.eq('parent_id', parentId) : query.is('parent_id', null);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []).map(mapFolder);
}

export async function listFiles(folderId: string | null): Promise<DriveFile[]> {
    if (!isSupabaseConfigured()) return [];
    let query = supabase.from('drive_files').select('*').order('created_at', { ascending: false });
    query = folderId ? query.eq('folder_id', folderId) : query.is('folder_id', null);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []).map(mapFile);
}

export async function createFolder(name: string, parentId: string | null, expiryHours: number | null): Promise<DriveFolder> {
    const userId = (await getCurrentUser())?.id;
    if (!userId) throw new Error('Sessão expirada. Entre novamente.');
    const { data, error } = await supabase
        .from('drive_folders')
        .insert({ user_id: userId, name, parent_id: parentId, expires_at: expiresAtFromHours(expiryHours) })
        .select('*')
        .single();
    if (error) throw new Error(error.message);
    return mapFolder(data);
}

export async function updateFolderExpiry(id: string, expiryHours: number | null): Promise<void> {
    const { error } = await supabase
        .from('drive_folders')
        .update({ expires_at: expiresAtFromHours(expiryHours) })
        .eq('id', id);
    if (error) throw new Error(error.message);
}

// Espaço ocupado pelo drive inteiro, para você acompanhar o consumo
export async function getDriveUsage(): Promise<{ files: number; bytes: number }> {
    if (!isSupabaseConfigured()) return { files: 0, bytes: 0 };
    const { data, error } = await supabase.from('drive_files').select('size_bytes');
    if (error) throw new Error(error.message);
    return {
        files: (data || []).length,
        bytes: (data || []).reduce((sum, r: any) => sum + (Number(r.size_bytes) || 0), 0),
    };
}

export async function renameFolder(id: string, name: string): Promise<void> {
    const { error } = await supabase.from('drive_folders').update({ name }).eq('id', id);
    if (error) throw new Error(error.message);
}

// Junta todos os arquivos de uma pasta e de tudo que está dentro dela (recursivo), pra poder
// apagar do Storage antes de apagar a pasta (o cascade do banco apaga as linhas, não os objetos).
async function collectFilesRecursive(folderId: string): Promise<DriveFile[]> {
    const [files, subfolders] = await Promise.all([listFiles(folderId), listFolders(folderId)]);
    const nested = await Promise.all(subfolders.map((f) => collectFilesRecursive(f.id)));
    return [...files, ...nested.flat()];
}

export async function deleteFolder(id: string): Promise<void> {
    const files = await collectFilesRecursive(id);
    if (files.length > 0) {
        const paths = files.map((f) => f.storagePath);
        for (let i = 0; i < paths.length; i += 100) {
            await supabase.storage.from(DRIVE_BUCKET).remove(paths.slice(i, i + 100));
        }
    }
    const { error } = await supabase.from('drive_folders').delete().eq('id', id);
    if (error) throw new Error(error.message);
}

// Acima disto o envio vai por upload resumível (protocolo TUS), que sobe em pedaços de 6 MB e
// retoma de onde parou se a conexão oscilar. Um vídeo grande num POST único morria no meio e
// recomeçava do zero — na prática, não subia nunca.
const RESUMABLE_THRESHOLD_BYTES = 6 * 1024 * 1024;
// O Supabase exige exatamente 6 MB por pedaço no endpoint resumável.
const TUS_CHUNK_SIZE = 6 * 1024 * 1024;

export type UploadProgress = (sentBytes: number, totalBytes: number) => void;

// O Storage recusa com 413 quando o arquivo passa do limite do projeto (o padrão é 50 MB e fica no
// painel, não no código). A mensagem crua não diz nada a quem está enviando, então traduzimos.
function friendlyUploadError(file: File, raw: string): Error {
    if (/exceeded the maximum allowed size|payload too large|413/i.test(raw)) {
        return new Error(
            `"${file.name}" (${formatBytes(file.size)}) passou do limite de tamanho do seu Supabase. ` +
            `Aumente em Storage → Settings → "Upload file size limit" no painel do Supabase e tente de novo.`,
        );
    }
    if (/jwt|token|unauthorized|401/i.test(raw)) {
        return new Error('Sua sessão expirou durante o envio. Entre novamente e repita.');
    }
    return new Error(`Não foi possível enviar "${file.name}": ${raw}`);
}

// Envio resumível via TUS. Usa o token da sessão porque o bucket é privado e as policies do Storage
// checam o dono pelo auth.uid().
async function uploadResumable(file: File, path: string, onProgress?: UploadProgress): Promise<void> {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) throw new Error('Sessão expirada. Entre novamente.');

    const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';

    await new Promise<void>((resolve, reject) => {
        const upload = new tus.Upload(file, {
            endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
            retryDelays: [0, 2000, 5000, 10000, 20000],
            headers: {
                authorization: `Bearer ${accessToken}`,
                'x-upsert': 'true',
            },
            uploadDataDuringCreation: true,
            removeFingerprintOnSuccess: true,
            chunkSize: TUS_CHUNK_SIZE,
            metadata: {
                bucketName: DRIVE_BUCKET,
                objectName: path,
                contentType: file.type || 'application/octet-stream',
                cacheControl: '3600',
            },
            onProgress: (sent, total) => onProgress?.(sent, total),
            onError: (err) => reject(friendlyUploadError(file, (err as Error).message || String(err))),
            onSuccess: () => resolve(),
        });
        upload.start();
    });
}

export async function uploadDriveFile(
    file: File,
    folderId: string | null,
    expiryHours: number | null,
    onProgress?: UploadProgress,
): Promise<DriveFile> {
    if (!isSupabaseConfigured()) throw new Error('Supabase não configurado.');
    const userId = (await getCurrentUser())?.id;
    if (!userId) throw new Error('Sessão expirada. Entre novamente.');

    const id = crypto.randomUUID();
    const path = `${userId}/${id}-${sanitizeFileName(file.name)}`;

    if (file.size > RESUMABLE_THRESHOLD_BYTES) {
        await uploadResumable(file, path, onProgress);
    } else {
        onProgress?.(0, file.size);
        const { error: uploadError } = await supabase.storage
            .from(DRIVE_BUCKET)
            .upload(path, file, { contentType: file.type || 'application/octet-stream' });
        if (uploadError) throw friendlyUploadError(file, uploadError.message);
        onProgress?.(file.size, file.size);
    }

    const { data, error } = await supabase
        .from('drive_files')
        .insert({
            id,
            user_id: userId,
            folder_id: folderId,
            name: file.name,
            storage_path: path,
            mime_type: file.type || 'application/octet-stream',
            size_bytes: file.size,
            expires_at: expiresAtFromHours(expiryHours),
        })
        .select('*')
        .single();

    if (error) {
        // Sobe deu certo mas o registro falhou: não deixa órfão no Storage.
        await supabase.storage.from(DRIVE_BUCKET).remove([path]);
        throw new Error(error.message);
    }
    return mapFile(data);
}

export async function updateFileExpiry(id: string, expiryHours: number | null): Promise<void> {
    const { error } = await supabase.from('drive_files').update({ expires_at: expiresAtFromHours(expiryHours) }).eq('id', id);
    if (error) throw new Error(error.message);
}

export async function deleteDriveFile(file: DriveFile): Promise<void> {
    await supabase.storage.from(DRIVE_BUCKET).remove([file.storagePath]);
    const { error } = await supabase.from('drive_files').delete().eq('id', file.id);
    if (error) throw new Error(error.message);
}
