import { useState, useEffect } from 'react'
import type { WebDAVConfig, Category, Tag, Qualifier } from './types'
import { initSql, loadDatabase, exportDatabase, getCategories, getTags, getQualifiers, createEntry, updateEntry, deleteEntry } from './db/database'
import { downloadAuto, uploadEncrypted, uploadPlain } from './sync/webdav'
import { decryptDb, encryptDb } from './crypto'
import AuthScreen, { loadSavedConfig } from './components/AuthScreen'
import EntryList from './components/EntryList'

type Phase = 'auth' | 'loading' | 'ready'

function formatSyncTime(date: Date | null): string {
  if (!date) return ''
  return 'Sync ' + date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('auth')
  const [config, setConfig] = useState<WebDAVConfig | null>(null)
  const [isEnc, setIsEnc] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [qualifiers, setQualifiers] = useState<Qualifier[]>([])
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [isDark, setIsDark] = useState<boolean>(() =>
    localStorage.getItem('tagebuch_theme') !== 'light'
  )

  useEffect(() => {
    document.documentElement.classList.toggle('light', !isDark)
    localStorage.setItem('tagebuch_theme', isDark ? 'dark' : 'light')
  }, [isDark])

  useEffect(() => {
    initSql().then(() => {
      const saved = loadSavedConfig()
      if (saved?.davUser) connect(saved)
    })
  }, [])

  function refreshMeta() {
    setCategories(getCategories())
    setTags(getTags())
    setQualifiers(getQualifiers())
    setLastSync(new Date())
  }

  async function connect(cfg: WebDAVConfig) {
    setConfig(cfg)
    setPhase('loading')
    setErrorMsg('')
    try {
      await initSql()
      const { data, isEnc: enc } = await downloadAuto(cfg)
      if (enc) {
        if (!cfg.encKey) throw new Error('Datei ist verschlüsselt — bitte AES-Key eintragen.')
        loadDatabase(decryptDb(data as string, cfg.encKey))
      } else {
        loadDatabase(data as ArrayBuffer)
      }
      setIsEnc(enc)
      refreshMeta()
      setPhase('ready')
    } catch (e) {
      setErrorMsg(String(e))
      setPhase('auth')
    }
  }

  async function sync() {
    if (!config || syncing) return
    setSyncing(true)
    try {
      const { data, isEnc: enc } = await downloadAuto(config)
      if (enc) {
        if (!config.encKey) throw new Error('Datei ist verschlüsselt — bitte AES-Key eintragen.')
        loadDatabase(decryptDb(data as string, config.encKey))
      } else {
        loadDatabase(data as ArrayBuffer)
      }
      refreshMeta()
    } catch (e) {
      alert('Sync fehlgeschlagen: ' + String(e))
    } finally {
      setSyncing(false)
    }
  }

  async function handleSave(
    entryId: number | null, text: string, timestamp: number,
    categoryIds: number[], tagNames: string[], qualifierValues: Record<number, number>
  ) {
    if (!config) return
    setSaving(true)
    try {
      if (entryId == null) createEntry(text, timestamp, categoryIds, tagNames, qualifierValues)
      else updateEntry(entryId, text, timestamp, categoryIds, tagNames, qualifierValues)
      const data = exportDatabase()
      if (isEnc) {
        if (!config.encKey) throw new Error('Kein AES-Key konfiguriert.')
        await uploadEncrypted(config, encryptDb(data, config.encKey))
      } else {
        await uploadPlain(config, data)
      }
      setLastSync(new Date())
    } catch (e) {
      alert('Speichern fehlgeschlagen: ' + String(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    if (!config) return
    setSaving(true)
    try {
      deleteEntry(id)
      const data = exportDatabase()
      if (isEnc) {
        if (!config.encKey) throw new Error('Kein AES-Key konfiguriert.')
        await uploadEncrypted(config, encryptDb(data, config.encKey))
      } else {
        await uploadPlain(config, data)
      }
      setLastSync(new Date())
    } catch (e) {
      alert('Löschen fehlgeschlagen: ' + String(e))
    } finally {
      setSaving(false)
    }
  }

  function logout() {
    localStorage.removeItem('tagebuch_webdav_config')
    setPhase('auth')
    setConfig(null)
  }

  if (phase === 'auth') {
    return <AuthScreen onConnect={connect} error={errorMsg || undefined} />
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
    <EntryList
      categories={categories}
      tags={tags}
      qualifiers={qualifiers}
      onSave={handleSave}
      onDelete={handleDelete}
      onSync={sync}
      onLogout={logout}
      saving={saving}
      syncing={syncing}
      lastSync={formatSyncTime(lastSync)}
      isDark={isDark}
      onToggleTheme={() => setIsDark(d => !d)}
    />
  )
}
