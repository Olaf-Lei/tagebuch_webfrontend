import { useState, useMemo } from 'react'
import { getStatsOverview, getQualifierTrend, getCategoryStats, getTagStats } from '../db/database'

const EMOJI_PRESETS: Record<string, string[]> = {
  mood:   ['😢','😕','😐','🙂','😄'],
  health: ['🤒','🤧','😐','😊','💪'],
  sleep:  ['😫','😪','😑','😌','🌟'],
  energy: ['🪫','😩','🌀','⚡','🚀'],
  pain:   ['😖','😣','😬','😌','✅'],
  stress: ['🤯','😤','😬','😌','🧘'],
}

const PRESET_ICONS: Record<string, string> = {
  mood:'🌤️', health:'💪', sleep:'💤', energy:'⚡', pain:'🩹', stress:'🧘'
}

const QUAL_COLORS = ['#C9A84C','#5B9CF6','#7EC97E','#E07E7E','#B57EE0','#7EC9C9']

type Period = 'week' | 'month' | 'year' | 'all'

function periodRange(p: Period): { from: number; to: number } {
  const now = Math.floor(Date.now() / 1000)
  const day = 86400
  if (p === 'week')  return { from: now - 7 * day, to: now }
  if (p === 'month') return { from: now - 30 * day, to: now }
  if (p === 'year')  return { from: now - 365 * day, to: now }
  return { from: 0, to: Number.MAX_SAFE_INTEGER }
}

function LinePath({ points, color }: { points: { x: number; y: number }[]; color: string }) {
  if (points.length < 2) return null
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  return <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
}

function TrendChart({ period }: { period: Period }) {
  const range = periodRange(period)
  const raw = useMemo(() => getQualifierTrend(range), [period])

  if (!raw.length) return (
    <p style={s.hint}>
      Keine Bewertungs-Daten. Synchronisiere die App zuerst und lade die Seite dann neu (🔄).
    </p>
  )

  const days = [...new Set(raw.map(r => r.day))].sort()
  const qualIds = [...new Set(raw.map(r => r.qualifierId))]
  const qualInfo = qualIds.map(id => {
    const row = raw.find(r => r.qualifierId === id)!
    return { id, name: row.qualifierName, emojiPreset: row.emojiPreset }
  })

  const W = 560, H = 160, PX = 8, PY = 12
  const innerW = W - 2 * PX, innerH = H - 2 * PY
  const xOf = (day: string) => PX + (days.indexOf(day) / Math.max(days.length - 1, 1)) * innerW
  const yOf = (val: number) => PY + (1 - (val - 1) / 4) * innerH

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, display: 'block' }}>
        {[1,2,3,4,5].map(v => (
          <line key={v} x1={PX} y1={yOf(v)} x2={W - PX} y2={yOf(v)}
            stroke="var(--border)" strokeWidth={1} strokeDasharray={v === 3 ? '4,3' : '2,4'} />
        ))}
        {qualInfo.map((q, i) => {
          const color = QUAL_COLORS[i % QUAL_COLORS.length]
          const pts = days.map(day => {
            const row = raw.find(r => r.day === day && r.qualifierId === q.id)
            return row ? { x: xOf(day), y: yOf(row.avg) } : null
          }).filter(Boolean) as { x: number; y: number }[]
          return <LinePath key={q.id} points={pts} color={color} />
        })}
        {qualInfo.map((q, i) => {
          const color = QUAL_COLORS[i % QUAL_COLORS.length]
          const pts = days.map(day => {
            const row = raw.find(r => r.day === day && r.qualifierId === q.id)
            return row ? { x: xOf(day), y: yOf(row.avg), v: row.avg } : null
          }).filter(Boolean) as { x: number; y: number; v: number }[]
          return pts.map((p, j) => (
            <circle key={`${q.id}-${j}`} cx={p.x} cy={p.y} r={3} fill={color}>
              <title>{q.name}: {p.v.toFixed(1)} — {(EMOJI_PRESETS[q.emojiPreset] ?? EMOJI_PRESETS.mood)[Math.round(p.v) - 1]}</title>
            </circle>
          ))
        })}
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
        {qualInfo.map((q, i) => (
          <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text2)' }}>
            <div style={{ width: 16, height: 3, background: QUAL_COLORS[i % QUAL_COLORS.length], borderRadius: 2 }} />
            {PRESET_ICONS[q.emojiPreset] ?? '•'} {q.name}
          </div>
        ))}
      </div>
    </div>
  )
}

function BarChart({ data, max }: { data: { name: string; color?: string; count: number }[]; max: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {data.filter(d => d.count > 0).map(d => (
        <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 100, textAlign: 'right', color: 'var(--text2)', fontSize: 13, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
          <div style={{ flex: 1, background: 'var(--bg)', borderRadius: 4, height: 20, position: 'relative' }}>
            <div style={{ width: `${(d.count / max) * 100}%`, background: d.color ?? 'var(--accent)', borderRadius: 4, height: '100%', minWidth: 4 }} />
          </div>
          <div style={{ color: 'var(--text)', fontSize: 13, width: 28, textAlign: 'right', flexShrink: 0 }}>{d.count}</div>
        </div>
      ))}
    </div>
  )
}

export default function Stats() {
  const [period, setPeriod] = useState<Period>('all')
  const range = useMemo(() => periodRange(period), [period])
  const overview = useMemo(() => getStatsOverview(range), [range])
  const catStats = useMemo(() => getCategoryStats(range), [range])
  const tagStats = useMemo(() => getTagStats(range), [range])

  const periodLabel: Record<Period, string> = { week: '7 Tage', month: '30 Tage', year: '365 Tage', all: 'Gesamt' }

  return (
    <div style={s.container}>
      <div style={s.filters}>
        {(['week','month','year','all'] as Period[]).map(p => (
          <button key={p} style={{ ...s.filterBtn, background: period === p ? 'var(--accent)' : 'transparent', color: period === p ? '#0F1B2D' : 'var(--text2)' }}
            onClick={() => setPeriod(p)}>{periodLabel[p]}</button>
        ))}
      </div>

      <div style={s.statRow}>
        <div style={s.statCard}>
          <div style={s.statNum}>{overview.inPeriod}</div>
          <div style={s.statLabel}>Einträge ({periodLabel[period]})</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statNum}>{overview.total}</div>
          <div style={s.statLabel}>Einträge gesamt</div>
        </div>
      </div>

      <div style={s.section}>
        <h3 style={s.sectionTitle}>Bewertungs-Verlauf</h3>
        <TrendChart period={period} />
      </div>

      {catStats.length > 0 && (
        <div style={s.section}>
          <h3 style={s.sectionTitle}>Kategorien</h3>
          <BarChart data={catStats} max={catStats[0]?.count || 1} />
        </div>
      )}

      {tagStats.length > 0 && (
        <div style={s.section}>
          <h3 style={s.sectionTitle}>Tags</h3>
          <BarChart data={tagStats} max={tagStats[0]?.count || 1} />
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  container: { padding: '16px', maxWidth: 800, margin: '0 auto', paddingBottom: 80 },
  filters: { display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' },
  filterBtn: { border: '1px solid var(--accent)', borderRadius: 20, padding: '6px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  statRow: { display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' },
  statCard: { flex: 1, minWidth: 120, background: 'var(--surface)', borderRadius: 10, padding: '16px 20px' },
  statNum: { color: 'var(--accent)', fontSize: 36, fontWeight: 700 },
  statLabel: { color: 'var(--text2)', fontSize: 13, marginTop: 4 },
  section: { background: 'var(--surface)', borderRadius: 10, padding: 16, marginBottom: 16 },
  sectionTitle: { color: 'var(--text)', fontSize: 15, fontWeight: 700, margin: '0 0 14px' },
  hint: { color: 'var(--text2)', fontSize: 13, padding: '12px 0', fontStyle: 'italic' },
}
