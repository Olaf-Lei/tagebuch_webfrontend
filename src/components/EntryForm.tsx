import { useState, useEffect, useRef } from 'react'
import type { EntryDetail, Category, Tag, Qualifier } from '../types'
import { getQualifierCategoryLinks } from '../db/database'

const EMOJI_PRESETS: Record<string, string[]> = {
  mood:   ['😢', '😕', '😐', '🙂', '😄'],
  health: ['🤒', '🤧', '😐', '😊', '💪'],
  sleep:  ['😫', '😪', '😑', '😌', '🌟'],
  energy: ['🪫', '😩', '🌀', '⚡', '🚀'],
  pain:   ['😖', '😣', '😬', '😌', '✅'],
  stress: ['🤯', '😤', '😬', '😌', '🧘'],
}

function toDatetimeLocal(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromDatetimeLocal(s: string): number {
  return new Date(s).getTime()
}

interface Props {
  entry?: EntryDetail
  categories: Category[]
  tags: Tag[]
  qualifiers: Qualifier[]
  saving: boolean
  onSave: (text: string, timestamp: number, categoryIds: number[], tagNames: string[], qualifierValues: Record<number, number>) => void
  onDelete?: () => void
  onCancel: () => void
}

export default function EntryForm({ entry, categories, tags, qualifiers, saving, onSave, onDelete, onCancel }: Props) {
  const [text, setText] = useState(entry?.text ?? '')
  const [timestampStr, setTimestampStr] = useState(toDatetimeLocal(entry?.timestamp ?? Date.now()))
  const [selectedCats, setSelectedCats] = useState<number[]>(entry?.categories.map(c => c.id) ?? [])
  const [tagInput, setTagInput] = useState(entry?.tags.map(t => t.name).join(', ') ?? '')
  const [qualValues, setQualValues] = useState<Record<number, number>>(entry?.qualifierValues ?? {})
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [tagSuggestions, setTagSuggestions] = useState<Tag[]>([])
  const [qualCatLinks, setQualCatLinks] = useState<Record<number, number[]>>({})
  const textRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { textRef.current?.focus() }, [])
  useEffect(() => {
    try { setQualCatLinks(getQualifierCategoryLinks()) } catch {}
  }, [])

  // Qualifiers sichtbar wenn global (kein Kategorie-Link) ODER Kategorie ausgewählt
  const visibleQualifiers = qualifiers.filter(q => {
    const linked = qualCatLinks[q.id]
    if (!linked || linked.length === 0) return true
    return linked.some(cid => selectedCats.includes(cid))
  })

  function toggleCat(id: number) {
    setSelectedCats(prev => {
      if (prev.includes(id)) {
        const next = prev.filter(x => x !== id)
        // Qualifier-Werte löschen für Qualifier die jetzt nicht mehr sichtbar sind
        setQualValues(qv => {
          const updated = { ...qv }
          for (const q of qualifiers) {
            const linked = qualCatLinks[q.id] ?? []
            if (linked.length > 0 && !linked.some(cid => next.includes(cid))) {
              delete updated[q.id]
            }
          }
          return updated
        })
        return next
      }
      return [...prev, id]
    })
  }

  function setQual(id: number, val: number) {
    setQualValues(prev => {
      if (prev[id] === val) { const n = { ...prev }; delete n[id]; return n }
      return { ...prev, [id]: val }
    })
  }

  const INDULGENCE_CHIPS = [
    { emoji: '🍺', name: 'alkohol' },
    { emoji: '🍫', name: 'süßes' },
    { emoji: '🚬', name: 'tabak' },
    { emoji: '🌿', name: 'cannabis' },
  ] as const

  function currentTagNames(): string[] {
    return tagInput.split(',').map(s => s.trim()).filter(Boolean)
  }

  function toggleIndulgence(name: string) {
    const names = currentTagNames()
    if (names.includes(name)) {
      setTagInput(names.filter(n => n !== name).join(', '))
    } else {
      setTagInput([...names, name].join(', '))
    }
    setTagSuggestions([])
  }

  function handleTagInput(val: string) {
    setTagInput(val)
    const last = val.split(',').pop()?.trim() ?? ''
    if (last.length > 1) {
      setTagSuggestions(tags.filter(t => t.name.toLowerCase().startsWith(last.toLowerCase())))
    } else {
      setTagSuggestions([])
    }
  }

  function applySuggestion(name: string) {
    const parts = tagInput.split(',').map(s => s.trim()).filter(Boolean)
    parts[parts.length - 1] = name
    setTagInput(parts.join(', ') + ', ')
    setTagSuggestions([])
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const tagNames = tagInput.split(',').map(s => s.trim()).filter(Boolean)
    onSave(text, fromDatetimeLocal(timestampStr), selectedCats, tagNames, qualValues)
  }

  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.panel} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <button style={styles.cancelBtn} onClick={onCancel}>✕ Abbrechen</button>
          <h2 style={styles.title}>{entry ? 'Eintrag bearbeiten' : 'Neuer Eintrag'}</h2>
          <button style={{ ...styles.saveBtn, opacity: saving ? 0.6 : 1 }} onClick={handleSubmit} disabled={saving}>
            {saving ? '…' : 'Speichern'}
          </button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>Zeitstempel</label>
          <input style={styles.input} type="datetime-local" value={timestampStr}
            onChange={e => setTimestampStr(e.target.value)} />

          <label style={styles.label}>Text</label>
          <textarea ref={textRef} style={styles.textarea} value={text}
            onChange={e => setText(e.target.value)} rows={8} required />

          {categories.length > 0 && (
            <>
              <label style={styles.label}>Kategorien</label>
              <div style={styles.chips}>
                {categories.map(c => (
                  <button key={c.id} type="button"
                    style={{ ...styles.chip, background: selectedCats.includes(c.id) ? (c.color ?? '#C9A84C') + '33' : 'transparent', borderColor: c.color ?? 'var(--accent)', color: c.color ?? 'var(--accent)' }}
                    onClick={() => toggleCat(c.id)}>
                    {c.name}
                  </button>
                ))}
              </div>
            </>
          )}

          {visibleQualifiers.length > 0 && (
            <>
              <label style={styles.label}>Bewertungen</label>
              {visibleQualifiers.map(q => (
                <div key={q.id} style={styles.qualRow}>
                  <span style={styles.qualName}>{q.name}</span>
                  <div style={styles.emojiRow}>
                    {(EMOJI_PRESETS[q.emoji_preset] ?? EMOJI_PRESETS.mood).map((emoji, i) => (
                      <button key={i} type="button"
                        style={{ ...styles.emojiBtn, background: qualValues[q.id] === i + 1 ? '#C9A84C33' : 'transparent', border: qualValues[q.id] === i + 1 ? '1px solid var(--accent)' : '1px solid transparent' }}
                        onClick={() => setQual(q.id, i + 1)}>
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}

          <label style={styles.label}>Tags (kommagetrennt)</label>
          <div style={{ position: 'relative' }}>
            <input style={styles.input} type="text" value={tagInput}
              onChange={e => handleTagInput(e.target.value)}
              placeholder="sport, lesen, arbeit" />
            {tagSuggestions.length > 0 && (
              <div style={styles.suggestions}>
                {tagSuggestions.map(t => (
                  <div key={t.id} style={styles.suggestion} onClick={() => applySuggestion(t.name)}>{t.name}</div>
                ))}
              </div>
            )}
          </div>

          <label style={styles.label}>Genussmittel</label>
          <div style={styles.chips}>
            {INDULGENCE_CHIPS.map(({ emoji, name }) => {
              const active = currentTagNames().includes(name)
              return (
                <button key={name} type="button"
                  style={{ ...styles.chip, background: active ? '#C9A84C33' : 'transparent', borderColor: active ? 'var(--accent)' : 'var(--border)', color: active ? 'var(--accent)' : 'var(--text2)' }}
                  onClick={() => toggleIndulgence(name)}>
                  {emoji} #{name}
                </button>
              )
            })}
          </div>

          {onDelete && !showDeleteConfirm && (
            <button type="button" style={styles.deleteBtn} onClick={() => setShowDeleteConfirm(true)}>
              Eintrag löschen
            </button>
          )}
          {showDeleteConfirm && (
            <div style={styles.confirmRow}>
              <span style={{ color: 'var(--text2)', fontSize: 14 }}>Wirklich löschen?</span>
              <button type="button" style={styles.confirmDelete} onClick={onDelete}>Ja, löschen</button>
              <button type="button" style={styles.cancelBtn} onClick={() => setShowDeleteConfirm(false)}>Nein</button>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100 },
  panel: { background: 'var(--surface)', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 640, maxHeight: '92vh', overflowY: 'auto', padding: '0 0 32px' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', position: 'sticky', top: 0, background: 'var(--surface)', borderBottom: '1px solid var(--border)', zIndex: 1 },
  title: { color: 'var(--text)', fontSize: 17, fontWeight: 700, margin: 0 },
  cancelBtn: { background: 'none', border: 'none', color: 'var(--text2)', fontSize: 14, cursor: 'pointer', padding: '8px 12px' },
  saveBtn: { background: 'var(--accent)', color: '#0F1B2D', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 15, fontWeight: 700, cursor: 'pointer' },
  form: { display: 'flex', flexDirection: 'column', gap: 6, padding: '20px' },
  label: { color: 'var(--text2)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginTop: 8 },
  input: { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', color: 'var(--text)', fontSize: 15, outline: 'none', width: '100%', boxSizing: 'border-box' as const },
  textarea: { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', color: 'var(--text)', fontSize: 15, outline: 'none', resize: 'vertical' as const, width: '100%', boxSizing: 'border-box' as const, lineHeight: 1.5 },
  qualRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 },
  qualName: { color: 'var(--text2)', fontSize: 14, minWidth: 80 },
  emojiRow: { display: 'flex', gap: 4 },
  emojiBtn: { fontSize: 22, cursor: 'pointer', borderRadius: 8, padding: '4px 6px' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip: { border: '1px solid', borderRadius: 20, padding: '4px 12px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  suggestions: { position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, zIndex: 10 },
  suggestion: { padding: '8px 14px', color: 'var(--text)', cursor: 'pointer', fontSize: 14 },
  deleteBtn: { marginTop: 16, background: 'none', border: '1px solid var(--error)', borderRadius: 8, color: 'var(--error)', padding: '10px 0', cursor: 'pointer', fontSize: 14 },
  confirmRow: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 },
  confirmDelete: { background: 'var(--error)', border: 'none', borderRadius: 8, color: '#fff', padding: '8px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 700 },
}
