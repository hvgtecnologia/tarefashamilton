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
    url: string;
}

export interface SharedDrivePayload {
    folder?: string;
    file?: string;
    size_bytes?: number;
    mime_type?: string;
    url?: string;
    inline_url?: string;
    expires_at?: string | null;
    files?: SharedDriveFileEntry[];
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

export async function uploadDriveFile(file: File, folderId: string | null, expiryHours: number | null): Promise<DriveFile> {
    if (!isSupabaseConfigured()) throw new Error('Supabase não configurado.');
    const userId = (await getCurrentUser())?.id;
    if (!userId) throw new Error('Sessão expirada. Entre novamente.');

    const id = crypto.randomUUID();
    const path = `${userId}/${id}-${sanitizeFileName(file.name)}`;
    const { error: uploadError } = await supabase.storage
        .from(DRIVE_BUCKET)
        .upload(path, file, { contentType: file.type || 'application/octet-stream' });
    if (uploadError) throw new Error(`Não foi possível enviar "${file.name}": ${uploadError.message}`);

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
