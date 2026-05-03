import { useState, useEffect } from 'react'
import type { WebDAVConfig, Category, Tag, Qualifier } from './types'
import { initSql, loadDatabase, exportDatabase, getCategories, getTags, getQualifiers, createEntry, updateEntry, deleteEntry } from './db/database'
import { downloadAuto, uploadEncrypted, uploadPlain } from './sync/webdav'
import { startAuth, completeAuth, isConnected as driveIsConnected, getConnectedEmail, downloadLatest as driveDownload, uploadLatest as driveUpload, signOut as driveSignOut } from './sync/googledrive'
import { decryptDb, encryptDb } from './crypto'
import AuthScreen, { loadSavedConfig, clearConfig } from './components/AuthScreen'
import EntryList from './components/EntryList'
import SyncSettings from './components/SyncSettings'

type Phase = 'auth' | 'loading' | 'ready'


export default function App() {
  const [phase, setPhase] = useState<Phase>('auth')
  const [config, setConfig] = useState<WebDAVConfig | null>(null)
  const [isEnc, setIsEnc] = useState(false)
  const [encKey, setEncKey] = useState<string | undefined>()
  const [errorMsg, setErrorMsg] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [qualifiers, setQualifiers] = useState<Qualifier[]>([])
  const [saving, setSaving] = useState(false)
  const [ncSyncing, setNcSyncing] = useState(false)
  const [driveSyncing, setDriveSyncing] = useState(false)
  const [ncLastSync, setNcLastSync] = useState<Date | null>(null)
  const [driveLastSync, setDriveLastSync] = useState<Date | null>(null)
  const [ncError, setNcError] = useState('')
  const [driveError, setDriveError] = useState('')
  const [pushing, setPushing] = useState(false)
  const [pushError, setPushError] = useState('')
  const [showSyncSettings, setShowSyncSettings] = useState(false)
  const [isDark, setIsDark] = useState<boolean>(() =>
    localStorage.getItem('tagebuch_theme') !== 'light'
  )

  useEffect(() => {
    document.documentElement.classList.toggle('light', !isDark)
    localStorage.setItem('tagebuch_theme', isDark ? 'dark' : 'light')
  }, [isDark])

  useEffect(() => {
    initSql().then(async () => {
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      if (code) {
        try {
          await completeAuth(code)
          window.history.replaceState({}, '', window.location.pathname)
        } catch (e) {
          setErrorMsg('Google-Anmeldung fehlgeschlagen: ' + String(e))
          return
        }
      }
      const savedWebdav = loadSavedConfig()
      const hasDrive = driveIsConnected()
      if (!savedWebdav && !hasDrive) return
      setPhase('loading')
      const ek = savedWebdav?.encKey ?? localStorage.getItem('gdrive_enc_key') ?? undefined
      if (savedWebdav) {
        try { await _loadFrom(savedWebdav, ek); setConfig(savedWebdav); return }
        catch (e) { if (!hasDrive) { setErrorMsg(String(e)); setPhase('auth'); return } }
      }
      if (hasDrive) {
        try { await _loadFromDrive(ek); if (savedWebdav) setConfig(savedWebdav); return }
        catch (e) { setErrorMsg(String(e)); setPhase('auth') }
      }
    })
  }, [])

  async function _loadFrom(cfg: WebDAVConfig, ek?: string) {
    const { data, isEnc: enc } = await downloadAuto(cfg)
    if (enc) {
      if (!ek) throw new Error('Datei ist verschlüsselt — bitte AES-Key eintragen.')
      loadDatabase(decryptDb(data as string, ek))
    } else {
      loadDatabase(data as ArrayBuffer)
    }
    setIsEnc(enc)
    setEncKey(ek)
    refreshMeta()
    setNcLastSync(new Date())
    setPhase('ready')
    setShowSyncSettings(false)
  }

  async function _loadFromDrive(ek?: string) {
    const { data, isEnc: enc } = await driveDownload()
    if (enc) {
      if (!ek) throw new Error('Datei ist verschlüsselt — bitte AES-Key eingeben.')
      loadDatabase(decryptDb(data as string, ek))
    } else {
      loadDatabase(data as ArrayBuffer)
    }
    setIsEnc(enc)
    setEncKey(ek)
    if (ek) localStorage.setItem('gdrive_enc_key', ek)
    refreshMeta()
    setDriveLastSync(new Date())
    setPhase('ready')
    setShowSyncSettings(false)
  }

  function refreshMeta() {
    setCategories(getCategories())
    setTags(getTags())
    setQualifiers(getQualifiers())
  }

  async function connect(cfg: WebDAVConfig) {
    setConfig(cfg)
    setPhase('loading')
    setErrorMsg('')
    try { await _loadFrom(cfg, cfg.encKey) }
    catch (e) { setErrorMsg(String(e)); setPhase('auth') }
  }

  async function connectDrive(ek?: string) {
    setPhase('loading')
    setErrorMsg('')
    try { await _loadFromDrive(ek) }
    catch (e) { setErrorMsg(String(e)); setPhase('auth') }
  }

  // Upload to ALL configured backends in parallel
  async function _uploadDb() {
    const data = exportDatabase()
    const jobs: Promise<void>[] = []

    if (config) {
      jobs.push(isEnc && encKey
        ? uploadEncrypted(config, encryptDb(data, encKey))
        : uploadPlain(config, data))
    }

    if (driveIsConnected()) {
      jobs.push(isEnc && encKey
        ? driveUpload(encryptDb(data, encKey), true)
        : driveUpload(data, false))
    }

    const results = await Promise.allSettled(jobs)
    const failed = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map(r => String(r.reason))
    if (failed.length) throw new Error(failed.join('\n'))
  }

  async function syncNC() {
    if (ncSyncing || !config) return
    setNcError(''); setNcSyncing(true)
    try {
      const { data, isEnc: enc } = await downloadAuto(config)
      enc ? loadDatabase(decryptDb(data as string, encKey!)) : loadDatabase(data as ArrayBuffer)
      refreshMeta()
      setNcLastSync(new Date())
    } catch (e) {
      setNcError(String(e))
    } finally {
      setNcSyncing(false)
    }
  }

  async function syncDriveOnly() {
    if (driveSyncing || !driveIsConnected()) return
    setDriveError(''); setDriveSyncing(true)
    try {
      const { data, isEnc: enc } = await driveDownload()
      enc ? loadDatabase(decryptDb(data as string, encKey!)) : loadDatabase(data as ArrayBuffer)
      refreshMeta()
      setDriveLastSync(new Date())
    } catch (e) {
      setDriveError(String(e))
    } finally {
      setDriveSyncing(false)
    }
  }

  async function syncAll() {
    await Promise.allSettled([
      config ? syncNC() : Promise.resolve(),
      driveIsConnected() ? syncDriveOnly() : Promise.resolve(),
    ])
  }

  async function pushLocalToRemote() {
    if (pushing) return
    setPushError(''); setPushing(true)
    try {
      await _uploadDb()
      if (config) setNcLastSync(new Date())
      if (driveIsConnected()) setDriveLastSync(new Date())
    } catch (e) {
      setPushError(String(e))
    } finally {
      setPushing(false)
    }
  }

  async function handleSave(
    entryId: number | null, text: string, timestamp: number,
    categoryIds: number[], tagNames: string[], qualifierValues: Record<number, number>
  ) {
    setSaving(true)
    try {
      if (entryId == null) createEntry(text, timestamp, categoryIds, tagNames, qualifierValues)
      else updateEntry(entryId, text, timestamp, categoryIds, tagNames, qualifierValues)
      await _uploadDb()
      if (config) setNcLastSync(new Date())
      if (driveIsConnected()) setDriveLastSync(new Date())
    } catch (e) {
      alert('Speichern fehlgeschlagen: ' + String(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    setSaving(true)
    try {
      deleteEntry(id)
      await _uploadDb()
      if (config) setNcLastSync(new Date())
      if (driveIsConnected()) setDriveLastSync(new Date())
    } catch (e) {
      alert('Löschen fehlgeschlagen: ' + String(e))
    } finally {
      setSaving(false)
    }
  }

  function logout() {
    driveSignOut()
    clearConfig()
    setPhase('auth')
    setConfig(null)
    setShowSyncSettings(false)
  }

  if (phase === 'auth') {
    return (
      <AuthScreen
        onConnect={connect}
        onGoogleAuth={() => startAuth()}
        onConnectDrive={connectDrive}
        driveEmail={getConnectedEmail()}
        error={errorMsg || undefined}
      />
    )
  }

  if (phase === 'loading') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📔</div>
          <p style={{ color: 'var(--text2)', fontSize: 16 }}>Datenbank wird geladen…</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <EntryList
        categories={categories}
        tags={tags}
        qualifiers={qualifiers}
        onSave={handleSave}
        onDelete={handleDelete}
        onLogout={logout}
        onOpenSyncSettings={() => setShowSyncSettings(true)}
        saving={saving}
        isDark={isDark}
        onToggleTheme={() => setIsDark(d => !d)}
        ncConnected={!!config}
        ncLastSync={ncLastSync}
        ncSyncing={ncSyncing}
        ncError={ncError}
        driveConnected={driveIsConnected()}
        driveLastSync={driveLastSync}
        driveSyncing={driveSyncing}
        driveError={driveError}
        onSyncNC={syncNC}
        onSyncDrive={syncDriveOnly}
        onSyncAll={syncAll}
        pushing={pushing}
        pushError={pushError}
        onPushLocal={pushLocalToRemote}
      />
      {showSyncSettings && (
        <SyncSettings
          webdavConfig={config}
          driveConnected={driveIsConnected()}
          driveEmail={getConnectedEmail()}
          encKey={encKey}
          onConnectWebDAV={connect}
          onConnectDrive={connectDrive}
          onDisconnectWebDAV={() => { clearConfig(); setConfig(null) }}
          onDisconnectDrive={() => driveSignOut()}
          onClose={() => setShowSyncSettings(false)}
        />
      )}
    </>
  )
}
