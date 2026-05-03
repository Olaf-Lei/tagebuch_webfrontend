import { useState, useEffect } from 'react'
import type { WebDAVConfig } from '../types'
import { startAuth, signOut as driveSignOut, listDriveFolders, getSelectedFolderId, setSelectedFolderId } from '../sync/googledrive'

interface Props {
  webdavConfig: WebDAVConfig | null
  driveConnected: boolean
  driveEmail: string | null
  encKey: string | undefined
  onConnectWebDAV: (config: WebDAVConfig) => void
  onConnectDrive: (encKey?: string) => void
  onDisconnectWebDAV: () => void
  onDisconnectDrive: () => void
  onClose: () => void
}

export default function SyncSettings({ webdavConfig, driveConnected, driveEmail, encKey: currentEncKey, onConnectWebDAV, onConnectDrive, onDisconnectWebDAV, onDisconnectDrive, onClose }: Props) {
  const [tab, setTab] = useState<'webdav' | 'gdrive'>('webdav')
  const [url, setUrl] = useState(webdavConfig?.url ?? '')
  const [username, setUsername] = useState(webdavConfig?.username ?? '')
  const [browserStack, setBrowserStack] = useState<{ id: string; name: string }[]>([])
  const [browserFolders, setBrowserFolders] = useState<{ id: string; name: string }[]>([])
  const [browserLoading, setBrowserLoading] = useState(false)
  const [selectedFolderName, setSelectedFolderName] = useState<string>('')
  const [selectedFolderId, setFolderIdState] = useState<string>(getSelectedFolderId() ?? '')

  useEffect(() => {
    if (!driveConnected || tab !== 'gdrive') return
    setBrowserLoading(true)
    listDriveFolders('root').then(f => { setBrowserFolders(f); setBrowserLoading(false) }).catch(() => setBrowserLoading(false))
  }, [driveConnected, tab])

  function browserNavigate(folder: { id: string; name: string }) {
    setBrowserStack(s => [...s, folder])
    setBrowserLoading(true)
    listDriveFolders(folder.id).then(f => { setBrowserFolders(f); setBrowserLoading(false) }).catch(() => setBrowserLoading(false))
  }

  function browserUp() {
    const newStack = browserStack.slice(0, -1)
    const parentId = newStack.length > 0 ? newStack[newStack.length - 1].id : 'root'
    setBrowserStack(newStack)
    setBrowserLoading(true)
    listDriveFolders(parentId).then(f => { setBrowserFolders(f); setBrowserLoading(false) }).catch(() => setBrowserLoading(false))
  }

  function handleSelectFolder(id: string, name: string) {
    setFolderIdState(id)
    setSelectedFolderName(name)
    setSelectedFolderId(id || null)
  }

  const currentBreadcrumb = ['Meine Ablage', ...browserStack.map(f => f.name)].join(' › ')
  const [davUser, setDavUser] = useState(webdavConfig?.davUser ?? '')
  const [password, setPassword] = useState(webdavConfig?.password ?? '')
  const [dir, setDir] = useState(webdavConfig?.dir ?? '/Tagebuch')
  const [encKey, setEncKey] = useState(currentEncKey ?? '')

  function handleWebDAV(e: React.FormEvent) {
    e.preventDefault()
    if (encKey && !/^[0-9a-fA-F]{64}$/.test(encKey.trim())) {
      alert('AES-Key muss ein 64-Zeichen langer Hex-String sein.')
      return
    }
    const cfg: WebDAVConfig = {
      url: url.trim(), username: username.trim(),
      davUser: davUser.trim() || username.trim(),
      password, dir: dir.trim() || '/Tagebuch',
      encKey: encKey.trim().toLowerCase() || undefined,
    }
    localStorage.setItem('tagebuch_webdav_config', JSON.stringify(cfg))
    onConnectWebDAV(cfg)
  }

  function handleDriveConnect() {
    if (encKey && !/^[0-9a-fA-F]{64}$/.test(encKey.trim())) {
      alert('AES-Key muss ein 64-Zeichen langer Hex-String sein.')
      return
    }
    const key = encKey.trim().toLowerCase() || undefined
    if (key) localStorage.setItem('gdrive_enc_key', key)
    else localStorage.removeItem('gdrive_enc_key')
    onConnectDrive(key)
  }

  return (
    <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={s.panel}>
        <div style={s.header}>
          <span style={s.title}>Sync-Einstellungen</span>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={s.tabs}>
          {(['webdav', 'gdrive'] as const).map(t => (
            <button key={t} style={{ ...s.tab, borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent', color: tab === t ? 'var(--accent)' : 'var(--text2)' }}
              onClick={() => setTab(t)}>
              <span>{t === 'webdav' ? '☁️ Nextcloud' : '🔵 Google Drive'}</span>
              <span style={{ ...s.badge, background: (t === 'webdav' ? !!webdavConfig : driveConnected) ? '#2a7a2a' : 'var(--border)', color: (t === 'webdav' ? !!webdavConfig : driveConnected) ? '#fff' : 'var(--text2)' }}>
                {(t === 'webdav' ? !!webdavConfig : driveConnected) ? 'aktiv' : 'inaktiv'}
              </span>
            </button>
          ))}
        </div>

        <div style={s.body}>
          {tab === 'webdav' && (
            <form onSubmit={handleWebDAV} style={s.form}>
              {webdavConfig && (
                <div style={s.statusRow}>
                  <span>✅ {webdavConfig.url.replace(/https?:\/\//, '')}</span>
                </div>
              )}
              <label style={s.label}>Nextcloud-URL</label>
              <input style={s.input} type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://cloud.example.com" required />
              <label style={s.label}>Benutzername (Login)</label>
              <input style={s.input} type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="olaf@example.com" required />
              <label style={s.label}>Kontoname (Nextcloud → Profil)</label>
              <input style={s.input} type="text" value={davUser} onChange={e => setDavUser(e.target.value)} placeholder="leer = gleich wie Benutzername" />
              <label style={s.label}>Passwort</label>
              <input style={s.input} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
              <label style={s.label}>Verzeichnis</label>
              <input style={s.input} type="text" value={dir} onChange={e => setDir(e.target.value)} placeholder="/Eigene/Persönlich" required />
              <label style={s.label}>AES-Key (nur bei Verschlüsselung)</label>
              <input style={s.input} type="text" value={encKey} onChange={e => setEncKey(e.target.value)} placeholder="64-stelliger Hex-String" autoComplete="off" />
              <button type="submit" style={s.primaryBtn}>
                {webdavConfig ? 'Aktualisieren' : 'Verbinden'}
              </button>
              {webdavConfig && (
                <button type="button" style={s.dangerBtn} onClick={() => { onDisconnectWebDAV(); onClose() }}>
                  Nextcloud trennen
                </button>
              )}
            </form>
          )}

          {tab === 'gdrive' && (
            <div style={s.form}>
              {driveConnected ? (
                <>
                  <div style={s.statusRow}>
                    <span style={{ fontSize: 20 }}>✅</span>
                    <div>
                      <div style={{ fontWeight: 600 }}>Verbunden</div>
                      <div style={{ fontSize: 13, color: 'var(--text2)' }}>{driveEmail}</div>
                    </div>
                  </div>
                  <label style={s.label}>Ordner in Google Drive</label>
                  {selectedFolderId && (
                    <div style={{ ...s.statusRow, marginBottom: 6, fontSize: 13 }}>
                      <span>📁</span>
                      <span style={{ flex: 1 }}>{selectedFolderName || selectedFolderId}</span>
                      <button style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: 12 }}
                        onClick={() => { handleSelectFolder('', ''); }}>✕</button>
                    </div>
                  )}
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 4 }}>
                    <div style={{ background: 'var(--bg)', padding: '6px 10px', fontSize: 12, color: 'var(--text2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {browserStack.length > 0 && (
                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 14, padding: '0 4px 0 0' }} onClick={browserUp}>‹</button>
                      )}
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentBreadcrumb}</span>
                      <button style={{ background: 'var(--accent)', border: 'none', borderRadius: 6, color: '#0F1B2D', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: '3px 8px', whiteSpace: 'nowrap' }}
                        onClick={() => {
                          const id = browserStack.length > 0 ? browserStack[browserStack.length - 1].id : ''
                          const name = browserStack.length > 0 ? browserStack[browserStack.length - 1].name : 'Meine Ablage'
                          handleSelectFolder(id, name)
                        }}>
                        Hier wählen
                      </button>
                    </div>
                    <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                      {browserLoading && <div style={{ padding: '10px 14px', color: 'var(--text2)', fontSize: 13 }}>Lade…</div>}
                      {!browserLoading && browserFolders.length === 0 && (
                        <div style={{ padding: '10px 14px', color: 'var(--text2)', fontSize: 13 }}>Keine Unterordner</div>
                      )}
                      {!browserLoading && browserFolders.map(f => (
                        <div key={f.id} style={{ display: 'flex', alignItems: 'center', padding: '8px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: 14, color: 'var(--text)' }}
                          onClick={() => browserNavigate(f)}>
                          <span style={{ marginRight: 8 }}>📁</span>
                          <span style={{ flex: 1 }}>{f.name}</span>
                          <span style={{ color: 'var(--text2)', fontSize: 16 }}>›</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <label style={s.label}>AES-Key (nur bei Verschlüsselung)</label>
                  <input style={s.input} type="text" value={encKey} onChange={e => setEncKey(e.target.value)} placeholder="64-stelliger Hex-String" autoComplete="off" />
                  <button style={s.primaryBtn} onClick={handleDriveConnect}>AES-Key aktualisieren</button>
                  <button style={s.linkBtn} onClick={() => { driveSignOut(); startAuth() }}>Anderes Konto</button>
                  <button style={s.dangerBtn} onClick={() => { onDisconnectDrive(); onClose() }}>Google Drive trennen</button>
                </>
              ) : (
                <>
                  <p style={s.hint}>Verbinde Google Drive als zweites Sync-Ziel. Jede Speicherung geht dann an beide Backends gleichzeitig.</p>
                  <label style={s.label}>AES-Key (nur bei Verschlüsselung)</label>
                  <input style={s.input} type="text" value={encKey} onChange={e => setEncKey(e.target.value)} placeholder="64-stelliger Hex-String" autoComplete="off" />
                  <button style={s.driveBtn} onClick={() => {
                    if (encKey) localStorage.setItem('gdrive_enc_key', encKey.trim().toLowerCase())
                    startAuth()
                  }}>
                    Mit Google anmelden →
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' },
  panel: { background: 'var(--surface)', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 480, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 0', flexShrink: 0 },
  title: { fontWeight: 700, fontSize: 17, color: 'var(--text)' },
  closeBtn: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text2)', padding: '4px 8px' },
  tabs: { display: 'flex', borderBottom: '1px solid var(--border)', marginTop: 12, flexShrink: 0 },
  tab: { flex: 1, background: 'none', border: 'none', padding: '10px 8px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 },
  badge: { borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 700 },
  body: { overflowY: 'auto', padding: '16px 20px 32px', flex: 1 },
  form: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { color: 'var(--text2)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8 },
  input: { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', color: 'var(--text)', fontSize: 15, outline: 'none', width: '100%', boxSizing: 'border-box' },
  statusRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 6, color: 'var(--text)', fontSize: 14 },
  primaryBtn: { marginTop: 14, background: 'var(--accent)', color: '#0F1B2D', border: 'none', borderRadius: 8, padding: '12px 0', fontSize: 15, fontWeight: 700, cursor: 'pointer', width: '100%' },
  driveBtn: { marginTop: 14, background: '#4285F4', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 0', fontSize: 15, fontWeight: 700, cursor: 'pointer', width: '100%' },
  dangerBtn: { marginTop: 8, background: 'none', border: '1px solid var(--error)', borderRadius: 8, padding: '10px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: 'var(--error)', width: '100%' },
  linkBtn: { marginTop: 8, background: 'none', border: 'none', color: 'var(--text2)', fontSize: 13, cursor: 'pointer', textDecoration: 'underline', width: '100%' },
  hint: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.5, margin: '0 0 8px' },
}
