import type { Entry, Category, Tag, Qualifier } from '../types'

const EMOJI_PRESETS: Record<string, string[]> = {
  mood:   ['😢', '😕', '😐', '🙂', '😄'],
  health: ['🤒', '🤧', '😐', '😊', '💪'],
  sleep:  ['😫', '😪', '😑', '😌', '🌟'],
  energy: ['🪫', '😩', '🌀', '⚡', '🚀'],
  pain:   ['😖', '😣', '😬', '😌', '✅'],
  stress: ['🤯', '😤', '😬', '😌', '🧘'],
}

function emojiForPreset(preset: string, value: number): string {
  return EMOJI_PRESETS[preset]?.[value - 1] ?? '•'
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

interface Props {
  entry: Entry
  categories: Category[]
  tags: Tag[]
  qualifiers: Qualifier[]
  qualifierValues: Record<number, number>
  search: string
  onClick: () => void
}

function highlight(text: string, search: string): React.ReactNode {
  if (!search) return text
  const parts = text.split(new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
  return parts.map((p, i) =>
    p.toLowerCase() === search.toLowerCase()
      ? <mark key={i} style={{ background: '#C9A84C33', color: '#C9A84C', borderRadius: 2 }}>{p}</mark>
      : p
  )
}

export default function EntryCard({ entry, categories, tags, qualifiers, qualifierValues, search, onClick }: Props) {
  const preview = entry.text.length > 200 ? entry.text.slice(0, 200) + '…' : entry.text
  const activeQualifiers = qualifiers.filter(q => qualifierValues[q.id] != null)

  return (
    <div style={styles.card} onClick={onClick}>
      <div style={styles.header}>
        <span style={styles.date}>{formatDate(entry.timestamp)}</span>
        <div style={styles.emojis}>
          {activeQualifiers.map(q => (
            <span key={q.id} title={q.name}>{emojiForPreset(q.emoji_preset, qualifierValues[q.id])}</span>
          ))}
        </div>
      </div>

      <p style={styles.text}>{highlight(preview, search)}</p>

      {entry.location_name && (
        <div style={styles.location}>📍 {entry.location_name}</div>
      )}

      <div style={styles.footer}>
        {categories.map(c => (
          <span key={c.id} style={{ ...styles.badge, background: c.color ? c.color + '33' : '#C9A84C22', color: c.color ?? '#C9A84C', borderColor: c.color ?? '#C9A84C' }}>
            {c.name}
          </span>
        ))}
        {tags.map(t => (
          <span key={t.id} style={styles.tag}>#{t.name}</span>
        ))}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: { background: 'var(--surface)', borderRadius: 10, padding: '14px 16px', cursor: 'pointer', transition: 'background 0.15s', marginBottom: 10 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  date: { color: 'var(--text2)', fontSize: 13 },
  emojis: { display: 'flex', gap: 4, fontSize: 18 },
  text: { color: 'var(--text)', fontSize: 15, lineHeight: 1.5, margin: '0 0 8px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  location: { color: 'var(--text2)', fontSize: 12, marginBottom: 8 },
  footer: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  badge: { fontSize: 12, padding: '2px 8px', borderRadius: 20, border: '1px solid', fontWeight: 600 },
  tag: { color: 'var(--text2)', fontSize: 12 },
}
