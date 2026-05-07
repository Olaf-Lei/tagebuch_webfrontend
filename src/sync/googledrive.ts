import { GDRIVE_CLIENT_ID as CLIENT_ID, GDRIVE_REDIRECT_URI as REDIRECT_URI } from './googledriveConfig'
const SCOPE = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.email'

const LS = {
  ACCESS_TOKEN:  'gdrive_access_token',
  REFRESH_TOKEN: 'gdrive_refresh_token',
  TOKEN_EXPIRY:  'gdrive_token_expiry',
  FILE_ID_DB:    'gdrive_file_id_db',
  FILE_ID_ENC:   'gdrive_file_id_enc',
  EMAIL:         'gdrive_email',
  FOLDER_ID:     'gdrive_folder_id',
}

function _b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function _generateVerifier(): string {
  const buf = new Uint8Array(32)
  crypto.getRandomValues(buf)
  return _b64url(buf)
}

async function _generateChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return _b64url(new Uint8Array(digest))
}

export async function startAuth(): Promise<void> {
  const verifier = _generateVerifier()
  sessionStorage.setItem('gdrive_pkce_verifier', verifier)
  const params = new URLSearchParams({
    client_id: CLIENT_ID, redirect_uri: REDIRECT_URI,
    response_type: 'code', scope: SCOPE,
    code_challenge: await _generateChallenge(verifier),
    code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent',
  })
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export async function completeAuth(code: string): Promise<void> {
  const verifier = sessionStorage.getItem('gdrive_pkce_verifier') ?? ''
  if (!verifier) throw new Error('PKCE-Verifier fehlt — bitte den Anmelde-Vorgang neu starten.')
  const res = await fetch('./proxy.php?action=google_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: verifier, redirect_uri: REDIRECT_URI }),
  })
  const tokens = await res.json()
  if (!res.ok || tokens.error) throw new Error(tokens.error_description ?? tokens.error ?? `HTTP ${res.status}`)
  localStorage.setItem(LS.ACCESS_TOKEN, tokens.access_token)
  if (tokens.refresh_token) localStorage.setItem(LS.REFRESH_TOKEN, tokens.refresh_token)
  localStorage.setItem(LS.TOKEN_EXPIRY, String(Date.now() + tokens.expires_in * 1000))
  sessionStorage.removeItem('gdrive_pkce_verifier')
  try {
    const ui = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    if (ui.ok) { const info = await ui.json(); if (info.email) localStorage.setItem(LS.EMAIL, info.email) }
  } catch {}
}

export function isConnected(): boolean {
  return !!localStorage.getItem(LS.REFRESH_TOKEN)
}

export function getConnectedEmail(): string | null {
  return localStorage.getItem(LS.EMAIL)
}

async function _refreshToken(): Promise<string> {
  const refreshToken = localStorage.getItem(LS.REFRESH_TOKEN)
  if (!refreshToken) throw new Error('Nicht mit Google Drive verbunden.')
  const res = await fetch('./proxy.php?action=google_refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
  const tokens = await res.json()
  if (!res.ok || tokens.error) throw new Error(tokens.error_description ?? tokens.error ?? 'Token-Refresh fehlgeschlagen')
  localStorage.setItem(LS.ACCESS_TOKEN, tokens.access_token)
  localStorage.setItem(LS.TOKEN_EXPIRY, String(Date.now() + tokens.expires_in * 1000))
  return tokens.access_token
}

async function _getToken(): Promise<string> {
  const token = localStorage.getItem(LS.ACCESS_TOKEN) ?? ''
  const expiry = Number(localStorage.getItem(LS.TOKEN_EXPIRY) ?? '0')
  if (token && Date.now() < expiry - 60_000) return token
  return _refreshToken()
}

export function getSelectedFolderId(): string | null {
  return localStorage.getItem(LS.FOLDER_ID)
}

export function setSelectedFolderId(id: string | null): void {
  if (id) localStorage.setItem(LS.FOLDER_ID, id)
  else localStorage.removeItem(LS.FOLDER_ID)
  // Clear cached file IDs so next sync searches in the new folder
  localStorage.removeItem(LS.FILE_ID_DB)
  localStorage.removeItem(LS.FILE_ID_ENC)
}

export async function listDriveFolders(parentId: string = 'root'): Promise<{ id: string; name: string }[]> {
  const token = await _getToken()
  const q = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`)
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&orderBy=name&pageSize=100`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) return []
  const data = await res.json()
  return (data.files ?? []) as { id: string; name: string }[]
}

async function _findFile(name: string, token: string): Promise<string | null> {
  const folderId = getSelectedFolderId()
  const folderClause = folderId ? ` and '${folderId}' in parents` : ''
  const q = encodeURIComponent(`name='${name}' and trashed=false${folderClause}`)
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) return null
  const data = await res.json()
  return (data.files?.[0]?.id as string) ?? null
}

async function _downloadById(fileId: string, token: string): Promise<ArrayBuffer> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) throw new Error(`Drive-Download fehlgeschlagen: ${res.status}`)
  return res.arrayBuffer()
}

async function _upload(
  content: Uint8Array | string,
  filename: string,
  fileIdKey: string,
  token: string,
): Promise<void> {
  const raw = typeof content === 'string' ? new TextEncoder().encode(content) : content
  const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer
  const existingId = localStorage.getItem(fileIdKey)

  if (existingId) {
    const res = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=media`,
      { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' }, body: buf }
    )
    if (res.status === 404) { localStorage.removeItem(fileIdKey); return _upload(content, filename, fileIdKey, token) }
    if (!res.ok) throw new Error(`Drive-Upload fehlgeschlagen: ${res.status}`)
    return
  }

  const boundary = 'tagebuch_' + Math.random().toString(36).slice(2)
  const folderId = getSelectedFolderId()
  const metaObj: Record<string, unknown> = { name: filename, mimeType: 'application/octet-stream' }
  if (folderId) metaObj.parents = [folderId]
  const meta = JSON.stringify(metaObj)
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
    `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
    buf,
    `\r\n--${boundary}--`,
  ])
  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` }, body }
  )
  if (!res.ok) throw new Error(`Drive-Upload fehlgeschlagen: ${res.status}`)
  const result = await res.json()
  localStorage.setItem(fileIdKey, result.id)
}

export async function downloadLatest(): Promise<{ data: ArrayBuffer | string; isEnc: boolean }> {
  const token = await _getToken()
  let fileId = localStorage.getItem(LS.FILE_ID_ENC) ?? await _findFile('tagebuch.db.enc', token)
  if (fileId) {
    localStorage.setItem(LS.FILE_ID_ENC, fileId)
    return { data: new TextDecoder().decode(await _downloadById(fileId, token)), isEnc: true }
  }
  fileId = localStorage.getItem(LS.FILE_ID_DB) ?? await _findFile('tagebuch.db', token)
  if (fileId) {
    localStorage.setItem(LS.FILE_ID_DB, fileId)
    return { data: await _downloadById(fileId, token), isEnc: false }
  }
  throw new Error('Keine Tagebuch-Datenbank in Google Drive gefunden. Bitte zuerst mit der Android-App synchronisieren.')
}

export async function uploadLatest(content: Uint8Array | string, isEnc: boolean): Promise<void> {
  const token = await _getToken()
  await _upload(content, isEnc ? 'tagebuch.db.enc' : 'tagebuch.db', isEnc ? LS.FILE_ID_ENC : LS.FILE_ID_DB, token)
}

export function signOut(): void {
  Object.values(LS).forEach(k => localStorage.removeItem(k))
  localStorage.removeItem('gdrive_enc_key')
}
