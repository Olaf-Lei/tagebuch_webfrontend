import initSqlJs, { type Database } from 'sql.js'
import type { Entry, Category, Tag, Qualifier, EntryDetail } from '../types'

let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null
let db: Database | null = null

export async function initSql() {
  if (!SQL) {
    SQL = await initSqlJs({ locateFile: () => import.meta.env.BASE_URL + 'sql-wasm.wasm' })
  }
}

export function loadDatabase(buffer: ArrayBuffer) {
  if (db) db.close()
  db = new SQL!.Database(new Uint8Array(buffer))
}

export function exportDatabase(): Uint8Array {
  if (!db) throw new Error('Keine Datenbank geladen')
  return db.export()
}

function getDb(): Database {
  if (!db) throw new Error('Keine Datenbank geladen')
  return db
}

function now() { return Math.floor(Date.now() / 1000) }

export function getEntries(search = '', categoryIds: number[] = [], tagIds: number[] = []): Entry[] {
  const d = getDb()
  let sql = `SELECT DISTINCT e.* FROM entries e`
  const params: (string | number)[] = []

  if (categoryIds.length > 0) {
    sql += ` JOIN entry_categories ec ON ec.entry_id = e.id AND ec.category_id IN (${categoryIds.map(() => '?').join(',')})`
    params.push(...categoryIds)
  }
  if (tagIds.length > 0) {
    sql += ` JOIN entry_tags et ON et.entry_id = e.id AND et.tag_id IN (${tagIds.map(() => '?').join(',')})`
    params.push(...tagIds)
  }

  const conditions: string[] = []
  if (search) {
    conditions.push(`e.text LIKE ?`)
    params.push(`%${search}%`)
  }
  if (conditions.length > 0) sql += ` WHERE ` + conditions.join(' AND ')
  sql += ` ORDER BY e.timestamp DESC`

  const stmt = d.prepare(sql)
  stmt.bind(params)
  const rows: Entry[] = []
  while (stmt.step()) {
    const r = stmt.getAsObject() as Record<string, unknown>
    rows.push({
      id: r.id as number,
      timestamp: r.timestamp as number,
      text: r.text as string,
      created_at: r.created_at as number,
      updated_at: r.updated_at as number,
      latitude: r.latitude as number | undefined,
      longitude: r.longitude as number | undefined,
      location_name: r.location_name as string | undefined,
    })
  }
  stmt.free()
  return rows
}

export function getEntry(id: number): EntryDetail | null {
  const d = getDb()

  const stmt = d.prepare(`SELECT * FROM entries WHERE id = ?`)
  stmt.bind([id])
  if (!stmt.step()) { stmt.free(); return null }
  const r = stmt.getAsObject() as Record<string, unknown>
  stmt.free()

  const entry: Entry = {
    id: r.id as number,
    timestamp: r.timestamp as number,
    text: r.text as string,
    created_at: r.created_at as number,
    updated_at: r.updated_at as number,
    latitude: r.latitude as number | undefined,
    longitude: r.longitude as number | undefined,
    location_name: r.location_name as string | undefined,
  }

  const catStmt = d.prepare(`SELECT c.* FROM categories c JOIN entry_categories ec ON ec.category_id = c.id WHERE ec.entry_id = ?`)
  catStmt.bind([id])
  const categories: Category[] = []
  while (catStmt.step()) {
    const c = catStmt.getAsObject() as Record<string, unknown>
    categories.push({ id: c.id as number, name: c.name as string, color: c.color as string | undefined })
  }
  catStmt.free()

  const tagStmt = d.prepare(`SELECT t.* FROM tags t JOIN entry_tags et ON et.tag_id = t.id WHERE et.entry_id = ?`)
  tagStmt.bind([id])
  const tags: Tag[] = []
  while (tagStmt.step()) {
    const t = tagStmt.getAsObject() as Record<string, unknown>
    tags.push({ id: t.id as number, name: t.name as string })
  }
  tagStmt.free()

  const qStmt = d.prepare(`SELECT qualifier_id, value FROM entry_qualifiers WHERE entry_id = ?`)
  qStmt.bind([id])
  const qualifierValues: Record<number, number> = {}
  while (qStmt.step()) {
    const q = qStmt.getAsObject() as Record<string, unknown>
    qualifierValues[q.qualifier_id as number] = q.value as number
  }
  qStmt.free()

  return { ...entry, categories, tags, qualifierValues }
}

export function getCategories(): Category[] {
  const d = getDb()
  const stmt = d.prepare(`SELECT * FROM categories ORDER BY name`)
  const rows: Category[] = []
  while (stmt.step()) {
    const r = stmt.getAsObject() as Record<string, unknown>
    rows.push({ id: r.id as number, name: r.name as string, color: r.color as string | undefined })
  }
  stmt.free()
  return rows
}

export function getTags(): Tag[] {
  const d = getDb()
  const stmt = d.prepare(`SELECT * FROM tags ORDER BY name`)
  const rows: Tag[] = []
  while (stmt.step()) {
    const r = stmt.getAsObject() as Record<string, unknown>
    rows.push({ id: r.id as number, name: r.name as string })
  }
  stmt.free()
  return rows
}

export function getQualifiers(): Qualifier[] {
  const d = getDb()
  const stmt = d.prepare(`SELECT * FROM qualifiers WHERE active = 1 AND deleted = 0 ORDER BY position`)
  const rows: Qualifier[] = []
  while (stmt.step()) {
    const r = stmt.getAsObject() as Record<string, unknown>
    rows.push({
      id: r.id as number,
      name: r.name as string,
      emoji_preset: r.emoji_preset as string,
      position: r.position as number,
      active: r.active as number,
    })
  }
  stmt.free()
  return rows
}

function upsertTag(d: Database, name: string): number {
  d.run(`INSERT OR IGNORE INTO tags (name) VALUES (?)`, [name])
  const stmt = d.prepare(`SELECT id FROM tags WHERE name = ?`)
  stmt.bind([name])
  stmt.step()
  const id = (stmt.getAsObject() as Record<string, unknown>).id as number
  stmt.free()
  return id
}

export function createEntry(
  text: string,
  timestamp: number,
  categoryIds: number[],
  tagNames: string[],
  qualifierValues: Record<number, number>
): number {
  const d = getDb()
  const ts = now()
  d.run(
    `INSERT INTO entries (timestamp, text, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    [timestamp, text, ts, ts]
  )
  const idStmt = d.prepare(`SELECT last_insert_rowid() as id`)
  idStmt.step()
  const id = (idStmt.getAsObject() as Record<string, unknown>).id as number
  idStmt.free()

  for (const cid of categoryIds) {
    d.run(`INSERT OR IGNORE INTO entry_categories (entry_id, category_id) VALUES (?, ?)`, [id, cid])
  }
  for (const name of tagNames) {
    const tid = upsertTag(d, name.trim())
    d.run(`INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (?, ?)`, [id, tid])
  }
  for (const [qid, val] of Object.entries(qualifierValues)) {
    d.run(`INSERT OR REPLACE INTO entry_qualifiers (entry_id, qualifier_id, value) VALUES (?, ?, ?)`, [id, Number(qid), val])
  }
  return id
}

export function updateEntry(
  id: number,
  text: string,
  timestamp: number,
  categoryIds: number[],
  tagNames: string[],
  qualifierValues: Record<number, number>
) {
  const d = getDb()
  d.run(`UPDATE entries SET text = ?, timestamp = ?, updated_at = ? WHERE id = ?`, [text, timestamp, now(), id])
  d.run(`DELETE FROM entry_categories WHERE entry_id = ?`, [id])
  d.run(`DELETE FROM entry_tags WHERE entry_id = ?`, [id])
  d.run(`DELETE FROM entry_qualifiers WHERE entry_id = ?`, [id])
  for (const cid of categoryIds) {
    d.run(`INSERT OR IGNORE INTO entry_categories (entry_id, category_id) VALUES (?, ?)`, [id, cid])
  }
  for (const name of tagNames) {
    const tid = upsertTag(d, name.trim())
    d.run(`INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (?, ?)`, [id, tid])
  }
  for (const [qid, val] of Object.entries(qualifierValues)) {
    d.run(`INSERT OR REPLACE INTO entry_qualifiers (entry_id, qualifier_id, value) VALUES (?, ?, ?)`, [id, Number(qid), val])
  }
}

export function deleteEntry(id: number) {
  getDb().run(`DELETE FROM entries WHERE id = ?`, [id])
}

export interface StatsPeriod { from: number; to: number }

export function getStatsOverview(p: StatsPeriod) {
  const d = getDb()

  const s1 = d.prepare('SELECT COUNT(*) as n FROM entries')
  s1.step()
  const total = ((s1.getAsObject() as Record<string, unknown>).n as number) ?? 0
  s1.free()

  // Debug: zeige min/max timestamps in Browser-Konsole (F12)
  const sd = d.prepare('SELECT MIN(timestamp) as mn, MAX(timestamp) as mx FROM entries')
  sd.step()
  const dbg = sd.getAsObject() as Record<string, unknown>
  sd.free()
  console.log('[Tagebuch] Timestamps in DB — min:', dbg.mn, 'max:', dbg.mx, '| Filter from:', p.from, 'to:', p.to)

  const s2 = d.prepare('SELECT COUNT(*) as n FROM entries WHERE timestamp >= ? AND timestamp <= ?')
  s2.bind([p.from, p.to])
  s2.step()
  const inPeriod = ((s2.getAsObject() as Record<string, unknown>).n as number) ?? 0
  s2.free()

  return { total, inPeriod }
}

export function getQualifierCategoryLinks(): Record<number, number[]> {
  const d = getDb()
  try {
    const stmt = d.prepare('SELECT qualifier_id, category_id FROM category_qualifiers')
    const links: Record<number, number[]> = {}
    while (stmt.step()) {
      const r = stmt.getAsObject() as { qualifier_id: number; category_id: number }
      if (!links[r.qualifier_id]) links[r.qualifier_id] = []
      links[r.qualifier_id].push(r.category_id)
    }
    stmt.free()
    return links
  } catch { return {} }
}

export function getEntriesWithLocation(p: StatsPeriod): Entry[] {
  const d = getDb()
  const stmt = d.prepare(`
    SELECT * FROM entries
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
      AND timestamp >= ? AND timestamp <= ?
    ORDER BY timestamp DESC`)
  stmt.bind([p.from, p.to])
  const rows: Entry[] = []
  while (stmt.step()) {
    const r = stmt.getAsObject() as Record<string, unknown>
    rows.push({
      id: r.id as number,
      timestamp: r.timestamp as number,
      text: r.text as string,
      created_at: r.created_at as number,
      updated_at: r.updated_at as number,
      latitude: r.latitude as number,
      longitude: r.longitude as number,
      location_name: r.location_name as string | undefined,
    })
  }
  stmt.free()
  return rows
}

export interface QualifierTrendPoint {
  day: string
  qualifierId: number
  qualifierName: string
  emojiPreset: string
  avg: number
}

export function getQualifierTrend(p: StatsPeriod): QualifierTrendPoint[] {
  const d = getDb()
  const stmt = d.prepare(`
    SELECT date(e.timestamp, 'unixepoch') as day,
           q.id as qualifierId,
           q.name as qualifierName,
           COALESCE(q.emoji_preset, 'mood') as emojiPreset,
           AVG(eq.value) as avg
    FROM entry_qualifiers eq
    JOIN entries e ON e.id = eq.entry_id
    JOIN qualifiers q ON q.id = eq.qualifier_id
    WHERE e.timestamp >= ? AND e.timestamp <= ?
    GROUP BY day, q.id
    ORDER BY day`)
  stmt.bind([p.from, p.to])
  const rows: QualifierTrendPoint[] = []
  while (stmt.step()) {
    const r = stmt.getAsObject() as Record<string, unknown>
    rows.push({
      day: r.day as string,
      qualifierId: r.qualifierId as number,
      qualifierName: r.qualifierName as string,
      emojiPreset: r.emojiPreset as string,
      avg: r.avg as number,
    })
  }
  stmt.free()
  return rows
}

export interface NameCount { name: string; color?: string; count: number }

export function getCategoryStats(p: StatsPeriod): NameCount[] {
  const d = getDb()
  const stmt = d.prepare(`
    SELECT c.name, c.color, COUNT(fec.entry_id) as cnt
    FROM categories c
    LEFT JOIN (
      SELECT ec.entry_id, ec.category_id
      FROM entry_categories ec
      JOIN entries e ON e.id = ec.entry_id AND e.timestamp >= ? AND e.timestamp <= ?
    ) fec ON fec.category_id = c.id
    GROUP BY c.id ORDER BY cnt DESC LIMIT 10`)
  stmt.bind([p.from, p.to])
  const rows: NameCount[] = []
  while (stmt.step()) {
    const r = stmt.getAsObject() as Record<string, unknown>
    rows.push({ name: r.name as string, color: r.color as string | undefined, count: r.cnt as number })
  }
  stmt.free()
  return rows
}

export function getTagStats(p: StatsPeriod): NameCount[] {
  const d = getDb()
  const stmt = d.prepare(`
    SELECT t.name, COUNT(fet.entry_id) as cnt
    FROM tags t
    LEFT JOIN (
      SELECT et.entry_id, et.tag_id
      FROM entry_tags et
      JOIN entries e ON e.id = et.entry_id AND e.timestamp >= ? AND e.timestamp <= ?
    ) fet ON fet.tag_id = t.id
    GROUP BY t.id ORDER BY cnt DESC LIMIT 15`)
  stmt.bind([p.from, p.to])
  const rows: NameCount[] = []
  while (stmt.step()) {
    const r = stmt.getAsObject() as Record<string, unknown>
    rows.push({ name: r.name as string, count: r.cnt as number })
  }
  stmt.free()
  return rows
}

