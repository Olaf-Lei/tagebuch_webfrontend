import { useState } from 'react'
import type { WebDAVConfig } from '../types'

interface Props {
  onConnect: (config: WebDAVConfig) => void
  error?: string
}

const STORAGE_KEY = 'tagebuch_webdav_config'

export function loadSavedConfig(): WebDAVConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const cfg = JSON.parse(raw)
    if (!cfg.dir && cfg.path) cfg.dir = cfg.path
    if (!cfg.davUser) cfg.davUser = ''
    return cfg
  } catch { return null }
}

function saveConfig(config: WebDAVConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

export function clearConfig() {
  localStorage.removeItem(STORAGE_KEY)
}

export default function AuthScreen({ onConnect, error }: Props) {
  const saved = loadSavedConfig()
  const [showFull, setShowFull] = useState(!saved?.davUser)
  const [url, setUrl] = useState(saved?.url ?? '')
  const [username, setUsername] = useState(saved?.username ?? '')
  const [davUser, setDavUser] = useState(saved?.davUser ?? '')
  const [password, setPassword] = useState(saved?.password ?? '')
  const [dir, setDir] = useState(saved?.dir ?? '/Tagebuch')
  const [encKey, setEncKey] = useState(saved?.encKey ?? '')

  function handleQuickConnect() {
    onConnect(saved!)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (encKey && !/^[0-9a-fA-F]{64}$/.test(encKey.trim())) {
      alert('AES-Key muss ein 64-Zeichen langer Hex-String sein.')
      return
    }
    const config: WebDAVConfig = {
      url: url.trim(),
      username: username.trim(),
      davUser: davUser.trim() || username.trim(),
      password,
      dir: dir.trim() || '/Tagebuch',
      encKey: encKey.trim().toLowerCase() || undefined,
    }
    saveConfig(config)
    onConnect(config)
  }

  return (
    <div style={s.container}>
      <div style={s.card}>
        <h1 style={s.title}>📔 Tagebuch</h1>

        {saved?.davUser && !showFull ? (
          <>
            <p style={s.savedInfo}>{saved.username} · {saved.url.replace(/https?:\/\//, '')}</p>
            {error && <p style={s.error}>{error}</p>}
            <button style={s.button} onClick={handleQuickConnect}>Verbinden</button>
            <button style={s.linkBtn} onClick={() => setShowFull(true)}>Andere Zugangsdaten</button>
          </>
        ) : (
          <form onSubmit={handleSubmit} style={s.form}>
            <label style={s.label}>Nextcloud-URL</label>
            <input style={s.input} type="url" value={url} onChange={e => setUrl(e.target.value)}
              placeholder="https://cloud.example.com" required />

            <label style={s.label}>Benutzername (Login)</label>
            <input style={s.input} type="text" value={username} onChange={e => setUsername(e.target.value)}
              placeholder="olaf@example.com" required />

            <label style={s.label}>Kontoname (Nextcloud → Profil)</label>
            <input style={s.input} type="text" value={davUser} onChange={e => setDavUser(e.target.value)}
              placeholder="olaf  (leer = gleich wie Benutzername)" />

            <label style={s.label}>Passwort</label>
            <input style={s.input} type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required />

            <label style={s.label}>Verzeichnis</label>
            <input style={s.input} type="text" value={dir} onChange={e => setDir(e.target.value)}
              placeholder="/Eigene/Persönlich" required />

            <label style={s.label}>AES-Key (nur bei Verschlüsselung)</label>
            <input style={s.input} type="text" value={encKey} onChange={e => setEncKey(e.target.value)}
              placeholder="64-stelliger Hex-String, leer wenn keine Verschlüsselung" autoComplete="off" />

            {error && <p style={s.error}>{error}</p>}
            <button type="submit" style={s.button}>Verbinden</button>
            {saved?.davUser && <button type="button" style={s.linkBtn} onClick={() => setShowFull(false)}>Zurück</button>}
          </form>
        )}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  container: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 16 },
  card: { background: 'var(--surface)', borderRadius: 12, padding: 32, width: '100%', maxWidth: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' },
  title: { color: 'var(--accent)', margin: '0 0 20px', fontSize: 28, fontWeight: 700, textAlign: 'center' },
  savedInfo: { color: 'var(--text2)', textAlign: 'center', fontSize: 14, margin: '0 0 20px' },
  form: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { color: 'var(--text2)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 6 },
  input: { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', color: 'var(--text)', fontSize: 15, outline: 'none', marginBottom: 2, width: '100%', boxSizing: 'border-box' },
  error: { color: 'var(--error)', fontSize: 13, margin: '8px 0' },
  button: { marginTop: 12, background: 'var(--accent)', color: '#0F1B2D', border: 'none', borderRadius: 8, padding: '13px 0', fontSize: 16, fontWeight: 700, cursor: 'pointer', width: '100%' },
  linkBtn: { marginTop: 10, background: 'none', border: 'none', color: 'var(--text2)', fontSize: 13, cursor: 'pointer', textDecoration: 'underline', width: '100%' },
}
