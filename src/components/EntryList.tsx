import { useState, useMemo } from 'react'
import type { Category, Tag, Qualifier } from '../types'
import { getEntries, getEntry } from '../db/database'
import EntryCard from './EntryCard'
import EntryForm from './EntryForm'
import Stats from './Stats'
import MapView from './MapView'

interface Props {
  categories: Category[]
  tags: Tag[]
  qualifiers: Qualifier[]
  onSave: (
    entryId: number | null,
    text: string, timestamp: number,
    categoryIds: number[], tagNames: string[],
    qualifierValues: Record<number, number>
  ) => Promise<void>
  onDelete: (id: number) => Promise<void>
  onSync: () => void
  onLogout: () => void
  saving: boolean
  syncing: boolean
  lastSync: string
  isDark: boolean
  onToggleTheme: () => void
}

type Tab = 'entries' | 'stats' | 'map'
type FormMode = { mode: 'new' } | { mode: 'edit'; entryId: number } | null

export default function EntryList({ categories, tags, qualifiers, onSave, onDelete, onSync, onLogout, saving, syncing, lastSync, isDark, onToggleTheme }: Props) {
  const [tab, setTab] = useState<Tab>('entries')
  const [search, setSearch] = useState('')
  const [filterCats, setFilterCats] = useState<number[]>([])
  const [filterTags, setFilterTags] = useState<number[]>([])
  const [formMode, setFormMode] = useState<FormMode>(null)
  const [refresh, setRefresh] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)

  const entries = useMemo(() => getEntries(search, filterCats, filterTags), [search, filterCats, filterTags, refresh])
  const entryDetails = useMemo(() => entries.map(e => getEntry(e.id)!), [entries])

  function toggleFilterCat(id: number) {
    setFilterCats(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  function toggleFilterTag(id: number) {
    setFilterTags(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleSave(text: string, timestamp: number, categoryIds: number[], tagNames: string[], qualifierValues: Record<number, number>) {
    const entryId = formMode?.mode === 'edit' ? formMode.entryId : null
    await onSave(entryId, text, timestamp, categoryIds, tagNames, qualifierValues)
    setFormMode(null)
    setRefresh(r => r + 1)
  }

  async function handleDelete(id: number) {
    await onDelete(id)
    setFormMode(null)
    setRefresh(r => r + 1)
  }

  const editEntry = formMode?.mode === 'edit' ? getEntry(formMode.entryId) ?? undefined : undefined

  const tabs: { key: Tab; label: string }[] = [
    { key: 'entries', label: 'Einträge' },
    { key: 'stats', label: 'Statistiken' },
    { key: 'map', label: 'Karte' },
  ]

  return (
    <div style={s.container}>
      <div style={s.topbar}>
        <span style={s.logo}>📔 Tagebuch</span>
        <div style={s.tabs}>
          {tabs.map(t => (
            <button key={t.key}
              style={{ ...s.tab, borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent', color: tab === t.key ? 'var(--accent)' : 'var(--text2)' }}
              onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>
        <div style={s.actions}>
          <button style={s.iconBtn} onClick={onSync} disabled={syncing} title={syncing ? 'Synchronisierung läuft…' : 'Jetzt synchronisieren'}>
            {syncing ? '⏳' : '🔄'}
          </button>
          <div style={{ position: 'relative' }}>
            <button style={s.iconBtn} onClick={() => setMenuOpen(m => !m)} title="Menü">☰</button>
            {menuOpen && (
              <>
                <div style={s.menuOverlay} onClick={() => setMenuOpen(false)} />
                <div style={s.menu}>
                  {lastSync && <div style={s.menuInfo}>{lastSync}</div>}
                  <button style={s.menuItem} onClick={() => { onToggleTheme(); setMenuOpen(false) }}>
                    {isDark ? '☀️ Tagmodus' : '🌙 Nachtmodus'}
                  </button>
                  <div style={s.menuDivider} />
                  <button style={{ ...s.menuItem, color: 'var(--error)' }} onClick={() => { onLogout(); setMenuOpen(false) }}>
                    Abmelden
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {tab === 'entries' && (
        <>
          <div style={s.toolbar}>
            <input style={s.searchInput} type="search" value={search}
              onChange={e => setSearch(e.target.value)} placeholder="Suchen…" />
            <button style={s.newBtn} onClick={() => setFormMode({ mode: 'new' })} title="Neuen Eintrag erstellen">
              + Neu
            </button>
          </div>

          {categories.length > 0 && (
            <div style={s.filterRow}>
              {categories.map(c => (
                <button key={c.id} title={`Nur „${c.name}" anzeigen`}
                  style={{ ...s.filterChip, background: filterCats.includes(c.id) ? (c.color ?? '#C9A84C') + '33' : 'transparent', borderColor: c.color ?? 'var(--accent)', color: c.color ?? 'var(--accent)' }}
                  onClick={() => toggleFilterCat(c.id)}>{c.name}</button>
              ))}
              {tags.map(t => (
                <button key={t.id} title={`Nur #${t.name} anzeigen`}
                  style={{ ...s.filterChip, borderColor: 'var(--border)', color: filterTags.includes(t.id) ? 'var(--accent)' : 'var(--text2)' }}
                  onClick={() => toggleFilterTag(t.id)}>#{t.name}</button>
              ))}
            </div>
          )}

          <div style={s.list}>
            {entryDetails.length === 0 && (
              <p style={s.empty}>Keine Einträge gefunden.</p>
            )}
            {entryDetails.map(detail => (
              <EntryCard key={detail.id} entry={detail} categories={detail.categories} tags={detail.tags}
                qualifiers={qualifiers} qualifierValues={detail.qualifierValues} search={search}
                onClick={() => setFormMode({ mode: 'edit', entryId: detail.id })} />
            ))}
          </div>
        </>
      )}

      {tab === 'stats' && <Stats />}

      {tab === 'map' && <MapView onOpenEntry={id => setFormMode({ mode: 'edit', entryId: id })} />}

      {formMode && (
        <EntryForm
          entry={editEntry}
          categories={categories}
          tags={tags}
          qualifiers={qualifiers}
          saving={saving}
          onSave={handleSave}
          onDelete={formMode.mode === 'edit' ? () => handleDelete(formMode.entryId) : undefined}
          onCancel={() => setFormMode(null)}
        />
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  container: { minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' },
  topbar: { display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 10, height: 60 },
  logo: { color: 'var(--accent)', fontSize: 18, fontWeight: 700, flexShrink: 0 },
  tabs: { display: 'flex', gap: 0, flex: 1, justifyContent: 'center' },
  tab: { background: 'none', border: 'none', borderBottom: '2px solid transparent', padding: '0 16px', height: 60, fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'color 0.15s' },
  actions: { display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 },
  iconBtn: { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: '6px 8px', borderRadius: 8, color: 'var(--text2)' },
  menuOverlay: { position: 'fixed', inset: 0, zIndex: 19 },
  menu: { position: 'absolute', top: '100%', right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, minWidth: 180, boxShadow: '0 4px 20px rgba(0,0,0,0.3)', zIndex: 20, overflow: 'hidden' },
  menuInfo: { color: 'var(--text2)', fontSize: 12, padding: '10px 16px', borderBottom: '1px solid var(--border)' },
  menuItem: { display: 'block', width: '100%', background: 'none', border: 'none', textAlign: 'left', padding: '12px 16px', fontSize: 14, cursor: 'pointer', color: 'var(--text)', fontWeight: 600 },
  menuDivider: { height: 1, background: 'var(--border)' },
  toolbar: { display: 'flex', gap: 10, padding: '12px 16px', maxWidth: 800, margin: '0 auto' },
  searchInput: { flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', color: 'var(--text)', fontSize: 15, outline: 'none' },
  newBtn: { background: 'var(--accent)', color: '#0F1B2D', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 15, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  filterRow: { display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 16px 10px', maxWidth: 800, margin: '0 auto' },
  filterChip: { border: '1px solid', borderRadius: 20, padding: '4px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600 },
  list: { padding: '8px 16px 80px', maxWidth: 800, margin: '0 auto' },
  empty: { color: 'var(--text2)', textAlign: 'center', marginTop: 60 },
}
