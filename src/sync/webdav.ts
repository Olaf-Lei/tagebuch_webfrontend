import type { WebDAVConfig } from '../types'

function buildUrl(config: WebDAVConfig, filename: string): string {
  const base = config.url.replace(/\/$/, '')
  const user = encodeURIComponent((config.davUser || config.username).trim())
  const encodedDir = config.dir
    .split('/')
    .map(seg => seg ? encodeURIComponent(seg) : '')
    .join('/')
  return `${base}/remote.php/dav/files/${user}${encodedDir}/${encodeURIComponent(filename)}`
}

function credHeaders(config: WebDAVConfig): Record<string, string> {
  return {
    'X-Webdav-Target': '',   // placeholder, overwritten per call
    'X-Webdav-User': config.username,
    'X-Webdav-Pass': config.password,
  }
}

async function proxyGet(targetUrl: string, config: WebDAVConfig): Promise<Response> {
  return fetch('./proxy.php', {
    method: 'GET',
    headers: { ...credHeaders(config), 'X-Webdav-Target': targetUrl },
  })
}

async function proxyPut(targetUrl: string, config: WebDAVConfig, body: string | ArrayBuffer, contentType: string): Promise<Response> {
  return fetch('./proxy.php', {
    method: 'PUT',
    headers: { ...credHeaders(config), 'X-Webdav-Target': targetUrl, 'Content-Type': contentType },
    body,
  })
}

// Versucht zuerst .db.enc, dann .db. Gibt { text, isEnc } zurück.
export async function downloadAuto(config: WebDAVConfig): Promise<{ data: ArrayBuffer | string; isEnc: boolean }> {
  const encUrl = buildUrl(config, 'tagebuch.db.enc')
  const encRes = await proxyGet(encUrl, config)
  if (encRes.ok) return { data: await encRes.text(), isEnc: true }

  const dbUrl = buildUrl(config, 'tagebuch.db')
  const dbRes = await proxyGet(dbUrl, config)
  if (dbRes.ok) return { data: await dbRes.arrayBuffer(), isEnc: false }

  throw new Error(`Datei nicht gefunden (${encUrl} → ${encRes.status}, ${dbUrl} → ${dbRes.status})`)
}

export async function uploadEncrypted(config: WebDAVConfig, text: string): Promise<void> {
  const url = buildUrl(config, 'tagebuch.db.enc')
  const res = await proxyPut(url, config, text, 'text/plain; charset=utf-8')
  if (!res.ok) throw new Error(`Upload fehlgeschlagen: HTTP ${res.status}`)
}

export async function uploadPlain(config: WebDAVConfig, data: Uint8Array): Promise<void> {
  const url = buildUrl(config, 'tagebuch.db')
  const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
  const res = await proxyPut(url, config, buf, 'application/octet-stream')
  if (!res.ok) throw new Error(`Upload fehlgeschlagen: HTTP ${res.status}`)
}
