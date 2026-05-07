import { useState, useEffect, useRef, useCallback } from 'react'
import { BrowserQRCodeReader } from '@zxing/browser'
import { DecodeHintType } from '@zxing/library'
import type { WebDAVConfig } from '../types'

interface Props {
  onConnect: (config: WebDAVConfig) => void
  onGoogleAuth: () => void
  onConnectDrive: (encKey?: string) => void
  driveEmail: string | null
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

export function clearConfig() {
  localStorage.removeItem(STORAGE_KEY)
}

interface QRPayload {
  v: number
  nc?: { url: string; user: string; pass: string; path: string }
  encKey?: string
}

type View = 'main' | 'manual'

const QR_HINTS = new Map<DecodeHintType, unknown>([
  [DecodeHintType.TRY_HARDER, true],
])

const QR_OPTIONS = { delayBetweenScanAttempts: 0, delayBetweenScanSuccess: 200 }

export default function AuthScreen({ onConnect, onGoogleAuth, onConnectDrive, driveEmail, error }: Props) {
  const saved = loadSavedConfig()
  const [view, setView] = useState<View>('main')
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [cameraIdx, setCameraIdx] = useState(0)

  const [relayInput, setRelayInput] = useState('')
  const [relayLoading, setRelayLoading] = useState(false)
  const [relayError, setRelayError] = useState('')

  const [showFull, setShowFull] = useState(!saved?.davUser)
  const [url, setUrl] = useState(saved?.url ?? '')
  const [username, setUsername] = useState(saved?.username ?? '')
  const [davUser, setDavUser] = useState(saved?.davUser ?? '')
  const [password, setPassword] = useState(saved?.password ?? '')
  const [dir, setDir] = useState(saved?.dir ?? '/Tagebuch')
  const [encKey, setEncKey] = useState(saved?.encKey ?? '')
  const [driveEncKey, setDriveEncKey] = useState(localStorage.getItem('gdrive_enc_key') ?? '')

  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)

  const stopScan = useCallback(() => {
    controlsRef.current?.stop()
    controlsRef.current = null
    setScanning(false)
    setCameras([])
    setCameraIdx(0)
  }, [])

  useEffect(() => { return stopScan }, [stopScan])

  // Scanner-Effect: startet neu bei Kamerawechsel (cameraIdx)
  // Kameraliste wird NACH Permission-Grant befüllt (dann haben deviceId/label echte Werte)
  useEffect(() => {
    if (!scanning || !videoRef.current) return

    let stopped = false
    let localControls: { stop: () => void } | null = null

    // Beim ersten Start (cameras noch leer): undefined → ZXing wählt Standardkamera
    // Nach Switch: echter deviceId aus der post-permission Enumeration
    const deviceId = cameras[cameraIdx]?.deviceId || undefined
    const isFront = cameras[cameraIdx]
      ? !/back|rear|environment/i.test(cameras[cameraIdx].label)
      : false
    videoRef.current.style.transform = isFront ? 'scaleX(-1)' : 'none'

    const reader = new BrowserQRCodeReader(QR_HINTS, QR_OPTIONS)

    ;(async () => {
      try {
        localControls = await reader.decodeFromVideoDevice(deviceId, videoRef.current!, (result) => {
          if (!result || stopped) return
          try {
            const payload: QRPayload = JSON.parse(result.getText())
            if (payload.v === 1) {
              stopped = true
              localControls?.stop()
              controlsRef.current = null
              setScanning(false)
              setCameras([])
              setCameraIdx(0)
              if (payload.encKey) localStorage.setItem('gdrive_enc_key', payload.encKey)
              if (payload.nc) {
                const config: WebDAVConfig = {
                  url: payload.nc.url, username: payload.nc.user,
                  davUser: '', password: payload.nc.pass, dir: payload.nc.path,
                  encKey: payload.encKey?.trim().toLowerCase() || undefined,
                }
                localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
                onConnect(config)
                return
              }
              if (payload.encKey && driveEmail) { onConnectDrive(payload.encKey); return }
              setScanError('QR-Code erkannt — keine Verbindungsdaten gefunden.')
            }
          } catch { /* kein gültiger Payload */ }
        })

        if (stopped) { localControls.stop(); return }
        controlsRef.current = localControls

        // Jetzt Permission erteilt → Kameras mit echten Labels/IDs abrufen
        if (cameras.length === 0 && !stopped) {
          const devs = await navigator.mediaDevices.enumerateDevices()
          const cams = devs.filter(d => d.kind === 'videoinput' && d.deviceId)
          if (cams.length > 1) setCameras(cams)
        }
      } catch (e) {
        if (!stopped) {
          const msg = String(e).toLowerCase()
          setScanError(msg.includes('permission') || msg.includes('denied') || msg.includes('notallowed')
            ? 'Kamera-Zugriff verweigert.' : 'Kamera konnte nicht gestartet werden.')
          setScanning(false)
        }
      }
    })()

    return () => {
      stopped = true
      localControls?.stop()
      controlsRef.current = null
    }
  }, [scanning, cameraIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRelayConnect() {
    const code = relayInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (code.length !== 6) { setRelayError('Bitte genau 6 Zeichen eingeben.'); return }
    setRelayError(''); setRelayLoading(true)
    try {
      const res = await fetch(`./proxy.php?action=fetch_code&code=${code}`)
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`)
      const payload = json as { v: number; nc?: { url: string; user: string; pass: string; path: string }; encKey?: string }
      if (payload.v !== 1) throw new Error('Ungültiges Format.')
      if (payload.encKey) localStorage.setItem('gdrive_enc_key', payload.encKey)
      if (payload.nc) {
        const config: WebDAVConfig = {
          url: payload.nc.url, username: payload.nc.user,
          davUser: '', password: payload.nc.pass, dir: payload.nc.path,
          encKey: payload.encKey?.trim().toLowerCase() || undefined,
        }
        localStorage.setItem('tagebuch_webdav_config', JSON.stringify(config))
        onConnect(config)
        return
      }
      if (payload.encKey && driveEmail) { onConnectDrive(payload.encKey); return }
      setRelayError('Code erkannt, aber keine Verbindungsdaten gefunden.')
    } catch (e) {
      setRelayError(String(e).replace('Error: ', ''))
    } finally {
      setRelayLoading(false)
    }
  }

  function startScan() {
    setScanError('')
    setScanning(true)
  }

  function switchCamera() {
    if (cameras.length < 2) return
    setCameraIdx(i => (i + 1) % cameras.length)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (encKey && !/^[0-9a-fA-F]{64}$/.test(encKey.trim())) {
      alert('AES-Key muss ein 64-Zeichen langer Hex-String sein.')
      return
    }
    const config: WebDAVConfig = {
      url: url.trim(), username: username.trim(),
      davUser: davUser.trim() || username.trim(),
      password,
      dir: dir.trim() || '/Tagebuch',
      encKey: encKey.trim().toLowerCase() || undefined,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    onConnect(config)
  }

  function handleDriveConnect() {
    const key = driveEncKey.trim().toLowerCase() || undefined
    if (key) localStorage.setItem('gdrive_enc_key', key)
    onConnectDrive(key)
  }

  const currentCamLabel = cameras[cameraIdx]?.label || ''
  const shortLabel = currentCamLabel.length > 24 ? currentCamLabel.slice(0, 24) + '…' : currentCamLabel

  return (
    <div style={s.container}>
      {scanning && (
        <div style={s.scanOverlay}>
          <div style={s.scanVideoWrap}>
            <video ref={videoRef} style={s.scanVideo} playsInline muted />
            <div style={s.scanFrame} />
          </div>
          <div style={s.scanControls}>
            <p style={s.scanHint}>QR-Code aus der Android-App scannen</p>
            {cameras.length > 1 && (
              <button style={s.switchBtn} onClick={switchCamera}>
                🔄 {shortLabel || `Kamera ${cameraIdx + 1} / ${cameras.length}`}
              </button>
            )}
          </div>
          {scanError && <p style={s.scanErr}>{scanError}</p>}
          <button style={s.scanClose} onClick={stopScan}>✕ Abbrechen</button>
        </div>
      )}

      <div style={s.card}>
        <h1 style={s.title}>📔 Tagebuch</h1>

        {view === 'main' ? (
          <>
            <button style={s.qrBtnLarge} onClick={startScan}>
              <span style={{ fontSize: 40, lineHeight: 1 }}>📷</span>
              <span style={{ fontSize: 16, fontWeight: 700 }}>Mit QR-Code anmelden</span>
              <span style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 400 }}>QR-Code aus der App scannen</span>
            </button>
            {scanError && <p style={s.error}>{scanError}</p>}
            {error && <p style={s.error}>{error}</p>}
            <div style={s.divider}><span style={s.dividerLabel}>oder Code eingeben</span></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                style={{ ...s.input, flex: 1, textAlign: 'center', fontSize: 20, fontWeight: 700, letterSpacing: 4, textTransform: 'uppercase' }}
                placeholder="A3F7KQ"
                maxLength={6}
                value={relayInput}
                onChange={e => { setRelayInput(e.target.value.toUpperCase()); setRelayError('') }}
                onKeyDown={e => e.key === 'Enter' && handleRelayConnect()}
              />
              <button style={{ ...s.button, marginTop: 0, padding: '0 18px', minWidth: 80, width: 'auto', flexShrink: 0 }} onClick={handleRelayConnect} disabled={relayLoading}>
                {relayLoading ? '…' : '→'}
              </button>
            </div>
            {relayError && <p style={s.error}>{relayError}</p>}
            <button style={s.linkBtn} onClick={() => setView('manual')}>Manueller Login →</button>
          </>
        ) : (
          <>
            <button style={{ ...s.linkBtn, marginBottom: 20, textAlign: 'left' as const }} onClick={() => setView('main')}>
              ← Zurück
            </button>

            {driveEmail ? (
              <div style={s.driveSection}>
                <div style={s.driveStatus}>
                  <span style={{ fontSize: 20 }}>🔵</span>
                  <span style={{ fontWeight: 600, color: 'var(--text)', flex: 1 }}>{driveEmail}</span>
                </div>
                <label style={s.label}>AES-Key (nur bei Verschlüsselung)</label>
                <input style={s.input} type="text" value={driveEncKey} onChange={e => setDriveEncKey(e.target.value)}
                  placeholder="64-stelliger Hex-String" autoComplete="off" />
                {error && <p style={s.error}>{error}</p>}
                <button style={s.driveBtn} onClick={handleDriveConnect}>Mit Google Drive verbinden</button>
                <button style={s.linkBtn} onClick={onGoogleAuth}>Anderes Konto verwenden</button>
              </div>
            ) : (
              <button style={s.driveBtn} onClick={onGoogleAuth}>Mit Google Drive anmelden</button>
            )}

            <div style={s.divider}><span style={s.dividerLabel}>oder Nextcloud</span></div>

            {saved?.davUser && !showFull ? (
              <>
                <p style={s.savedInfo}>{saved.username} · {saved.url.replace(/https?:\/\//, '')}</p>
                {!driveEmail && error && <p style={s.error}>{error}</p>}
                <button style={s.button} onClick={() => onConnect(saved!)}>Mit Nextcloud verbinden</button>
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
                  placeholder="64-stelliger Hex-String" autoComplete="off" />
                {!driveEmail && error && <p style={s.error}>{error}</p>}
                <button type="submit" style={s.button}>Verbinden</button>
                {saved?.davUser && <button type="button" style={s.linkBtn} onClick={() => setShowFull(false)}>Zurück</button>}
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  container: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 16 },
  card: { background: 'var(--surface)', borderRadius: 12, padding: 32, width: '100%', maxWidth: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' },
  title: { color: 'var(--accent)', margin: '0 0 24px', fontSize: 28, fontWeight: 700, textAlign: 'center' },
  qrBtnLarge: {
    width: '100%', background: 'var(--accent)', color: '#0F1B2D', border: 'none',
    borderRadius: 12, padding: '20px 16px', cursor: 'pointer',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 12,
  },
  driveSection: { display: 'flex', flexDirection: 'column', gap: 4 },
  driveStatus: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 4 },
  driveBtn: { width: '100%', background: '#4285F4', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 0', fontSize: 15, fontWeight: 700, cursor: 'pointer' },
  divider: { display: 'flex', alignItems: 'center', margin: '18px 0 14px', gap: 10 },
  dividerLabel: { color: 'var(--text2)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap', padding: '0 4px', background: 'var(--surface)' },
  savedInfo: { color: 'var(--text2)', textAlign: 'center', fontSize: 14, margin: '0 0 12px' },
  form: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { color: 'var(--text2)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 6 },
  input: { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', color: 'var(--text)', fontSize: 15, outline: 'none', width: '100%', boxSizing: 'border-box' },
  error: { color: 'var(--error)', fontSize: 13, margin: '8px 0' },
  button: { marginTop: 12, background: 'var(--accent)', color: '#0F1B2D', border: 'none', borderRadius: 8, padding: '13px 0', fontSize: 16, fontWeight: 700, cursor: 'pointer', width: '100%' },
  linkBtn: { marginTop: 8, background: 'none', border: 'none', color: 'var(--text2)', fontSize: 13, cursor: 'pointer', textDecoration: 'underline', width: '100%', textAlign: 'center' },
  scanOverlay: { position: 'fixed', inset: 0, background: '#000', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  scanVideoWrap: { position: 'relative', width: '100%', maxWidth: 480 },
  scanVideo: { width: '100%', display: 'block', borderRadius: 8 },
  scanFrame: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 220, height: 220, border: '3px solid #C9A84C', borderRadius: 16, pointerEvents: 'none' },
  scanControls: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginTop: 16 },
  scanHint: { color: '#fff', fontSize: 14, textAlign: 'center', padding: '0 24px', margin: 0 },
  switchBtn: { background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 20, color: '#fff', padding: '6px 16px', fontSize: 13, cursor: 'pointer' },
  scanErr: { color: '#ff6b6b', fontSize: 13, marginTop: 8 },
  scanClose: { marginTop: 24, background: 'none', border: '1px solid #555', borderRadius: 8, color: '#fff', padding: '10px 28px', fontSize: 15, cursor: 'pointer' },
}
