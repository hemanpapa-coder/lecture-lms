type ResumableUploadResult = {
  id?: string
  webViewLink?: string
  webContentLink?: string
}

const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024

function shortErrorBody(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 180)
}

async function readResponseBody(res: Response): Promise<string> {
  return await res.text().catch(() => '')
}

async function parseFinalResponse(res: Response): Promise<ResumableUploadResult> {
  const body = await readResponseBody(res)
  if (!body.trim()) return {}
  try {
    return JSON.parse(body) as ResumableUploadResult
  } catch {
    return {}
  }
}

export async function uploadFileResumableToDrive(
  uploadUrl: string,
  file: File,
  mimeType = file.type || 'application/octet-stream',
  chunkSize = DEFAULT_CHUNK_SIZE,
): Promise<ResumableUploadResult> {
  if (!uploadUrl) throw new Error('업로드 URL이 유효하지 않습니다.')
  if (!file || file.size <= 0) throw new Error('업로드할 파일이 비어 있습니다.')

  let offset = 0

  while (offset < file.size) {
    const end = Math.min(offset + chunkSize, file.size) - 1
    const chunk = file.slice(offset, end + 1, mimeType)

    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': mimeType,
        'Content-Range': `bytes ${offset}-${end}/${file.size}`,
      },
      body: chunk,
    })

    if (res.status === 308) {
      const range = res.headers.get('Range')
      const uploadedEnd = range?.match(/bytes=\d+-(\d+)/)?.[1]
      offset = uploadedEnd ? Number(uploadedEnd) + 1 : end + 1
      continue
    }

    if (res.ok) return parseFinalResponse(res)

    const body = shortErrorBody(await readResponseBody(res))
    const reason = body || `HTTP ${res.status}`
    throw new Error(`파일 전송 실패 (${reason})`)
  }

  return {}
}
