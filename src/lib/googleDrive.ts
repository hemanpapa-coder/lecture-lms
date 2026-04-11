/**
 * Google Drive 데이터 레이어 (Service Account 기반)
 * ───────────────────────────────────────────────────
 * Firebase Auth로 인증 후, 모든 데이터 읽기/쓰기는
 * 이 파일을 통해 Google Drive JSON 파일로 처리됩니다.
 */

import { google, drive_v3 } from 'googleapis';

// ─── Drive 클라이언트 (Service Account) ──────────────────────────────
let _drive: drive_v3.Drive | null = null;

export function getDriveClient(): drive_v3.Drive {
  if (_drive) return _drive;

  const auth = new google.auth.GoogleAuth({
    credentials: {
      type: 'service_account',
      project_id: process.env.FIREBASE_ADMIN_PROJECT_ID,
      private_key: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    },
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  _drive = google.drive({ version: 'v3', auth });
  return _drive;
}

// ─── 폴더 ID 모음 ────────────────────────────────────────────────────
export const DRIVE_FOLDERS = {
  ROOT:        () => process.env.GOOGLE_DRIVE_LMS_ROOT_ID!,
  ASSIGNMENTS: () => process.env.GOOGLE_DRIVE_ASSIGNMENTS_ID!,
  WORKSPACE:   () => process.env.GOOGLE_DRIVE_WORKSPACE_ID!,
  TTS:         () => process.env.GOOGLE_DRIVE_TTS_ID!,
  AI_IMAGES:   () => process.env.GOOGLE_DRIVE_AI_IMAGES_ID!,
  ARCHIVE:     () => process.env.GOOGLE_DRIVE_ARCHIVE_ID!,
  BOARD:       () => process.env.GOOGLE_DRIVE_BOARD_ID!,
  EDITOR:      () => process.env.GOOGLE_DRIVE_EDITOR_ID!,
  ERRORS:      () => process.env.GOOGLE_DRIVE_ERRORS_ID!,
  EXAMS:       () => process.env.GOOGLE_DRIVE_EXAMS_ID!,
  SYSTEM:      () => process.env.GOOGLE_DRIVE_SYSTEM_ID!,
} as const;

// ─── 하위 폴더 생성 또는 조회 ────────────────────────────────────────
export async function findOrCreateFolder(
  drive: drive_v3.Drive,
  folderName: string,
  parentId: string
): Promise<string> {
  const res = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and '${parentId}' in parents and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id!;
  }

  const folder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });

  return folder.data.id!;
}

// ─── JSON 파일 읽기 ──────────────────────────────────────────────────
export async function readJsonFile<T>(fileId: string): Promise<T | null> {
  const drive = getDriveClient();
  try {
    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    return new Promise((resolve, reject) => {
      let data = '';
      (res.data as NodeJS.ReadableStream).on('data', (chunk: any) => { data += chunk; });
      (res.data as NodeJS.ReadableStream).on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
      (res.data as NodeJS.ReadableStream).on('error', reject);
    });
  } catch (err: any) {
    if (err?.code === 404 || err?.status === 404) return null;
    throw err;
  }
}

// ─── JSON 파일 쓰기 (생성 또는 업데이트) ─────────────────────────────
export async function writeJsonFile(
  parentFolderId: string,
  fileName: string,
  data: unknown,
  existingFileId?: string
): Promise<string> {
  const drive = getDriveClient();
  const body = JSON.stringify(data, null, 2);
  const media = {
    mimeType: 'application/json',
    body,
  };

  if (existingFileId) {
    // 업데이트
    const res = await drive.files.update({
      fileId: existingFileId,
      media,
      fields: 'id',
    });
    return res.data.id!;
  } else {
    // 신규 생성
    const res = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: 'application/json',
        parents: [parentFolderId],
      },
      media,
      fields: 'id',
    });
    return res.data.id!;
  }
}

// ─── 폴더에서 파일 ID 찾기 (이름으로) ──────────────────────────────
export async function findFileByName(
  parentFolderId: string,
  fileName: string
): Promise<{ id: string; name: string } | null> {
  const drive = getDriveClient();
  const res = await drive.files.list({
    q: `name='${fileName}' and '${parentFolderId}' in parents and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  if (res.data.files && res.data.files.length > 0) {
    return { id: res.data.files[0].id!, name: res.data.files[0].name! };
  }
  return null;
}

// ─── 폴더의 파일 목록 가져오기 ─────────────────────────────────────
export async function listFiles(
  parentFolderId: string,
  options?: { mimeType?: string; nameContains?: string }
): Promise<drive_v3.Schema$File[]> {
  const drive = getDriveClient();
  let q = `'${parentFolderId}' in parents and trashed=false`;
  if (options?.mimeType) q += ` and mimeType='${options.mimeType}'`;
  if (options?.nameContains) q += ` and name contains '${options.nameContains}'`;

  const res = await drive.files.list({
    q,
    fields: 'files(id, name, size, createdTime, modifiedTime, mimeType, webViewLink)',
    spaces: 'drive',
    orderBy: 'createdTime desc',
  });

  return res.data.files || [];
}

// ─── JSON 파일 읽기 (이름으로 조회 후 읽기) ─────────────────────────
export async function readJsonByName<T>(
  parentFolderId: string,
  fileName: string
): Promise<{ data: T; fileId: string } | null> {
  const file = await findFileByName(parentFolderId, fileName);
  if (!file) return null;

  const data = await readJsonFile<T>(file.id);
  if (data === null) return null;

  return { data, fileId: file.id };
}

// ─── JSON 파일 쓰기 (이름으로 upsert) ───────────────────────────────
export async function upsertJsonByName(
  parentFolderId: string,
  fileName: string,
  data: unknown
): Promise<string> {
  const existing = await findFileByName(parentFolderId, fileName);
  return writeJsonFile(parentFolderId, fileName, data, existing?.id);
}

// ─── 파일 삭제 ───────────────────────────────────────────────────────
export async function deleteFile(fileId: string): Promise<void> {
  const drive = getDriveClient();
  await drive.files.delete({ fileId });
}

// ─── 파일을 휴지통으로 이동 ──────────────────────────────────────────
export async function trashFile(fileId: string): Promise<void> {
  const drive = getDriveClient();
  await drive.files.update({ fileId, requestBody: { trashed: true } });
}

// ─── 토큰 발급 (Raw Fetch API 호출용) ──────────────────────────────────
export async function getDriveToken(): Promise<string> {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      type: 'service_account',
      project_id: process.env.FIREBASE_ADMIN_PROJECT_ID,
      private_key: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    },
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  const client = await auth.getClient();
  const tokenRecord = await client.getAccessToken();
  if (!tokenRecord.token) throw new Error("Could not retrieve Drive access token");
  return tokenRecord.token;
}
