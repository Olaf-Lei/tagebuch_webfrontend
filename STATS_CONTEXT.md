# Tagebuch Web-Client – Kontext für Auswertungs-Arbeit

Dieses Dokument beschreibt Architektur, Datenmodell und alle relevanten Export-Funktionen
des Web-Clients, damit Claude in einer neuen Session direkt mit der Statistik-Komponente
arbeiten kann — ohne den restlichen Code lesen zu müssen.

---

## Was ist das?

Eine persönliche Tagebuch-App. Android-App + Web-Client. Der Web-Client läuft unter
`https://olovenet.de/tagebuch/` und liest/schreibt dieselbe SQLite-Datenbank wie die
Android-App (Sync via Nextcloud WebDAV oder Google Drive).

**Stack Web-Client:** React 19 + Vite + TypeScript, sql.js (SQLite-WASM im Browser),
kein externes Chart-Framework — alle Diagramme sind reines SVG oder Div-basiert.
Farbschema: Navy `#0F1B2D` (Hintergrund), Gold `#C9A84C` (Akzent). CSS-Variablen für
Dark/Light-Mode (`var(--bg)`, `var(--surface)`, `var(--text)`, `var(--text2)`,
`var(--accent)`, `var(--border)`, `var(--error)`).

---

## Datenmodell (SQLite)

```sql
entries (
  id          INTEGER PRIMARY KEY,
  timestamp   INTEGER NOT NULL,   -- Unix-Millisekunden (Date.now()), vom User editierbar
  text        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,   -- ms, gesetzt beim Anlegen, immutable
  updated_at  INTEGER NOT NULL,   -- ms
  latitude    REAL,               -- NULL wenn kein GPS
  longitude   REAL,
  location_name TEXT
)

categories (id, name TEXT, color TEXT)   -- color: Hex-String z.B. "#e07e7e"

tags (id, name TEXT)

entry_categories (entry_id, category_id)   -- n:m
entry_tags       (entry_id, tag_id)        -- n:m

qualifiers (
  id           INTEGER PRIMARY KEY,
  name         TEXT,              -- z.B. "Stimmung", "Schlaf", "Schmerz"
  emoji_preset TEXT,              -- Schlüssel: mood|health|sleep|energy|pain|stress
  position     INTEGER,
  active       INTEGER,           -- 1 = aktiv, 0 = inaktiv
  deleted      INTEGER            -- 1 = soft-deleted
)

entry_qualifiers (
  entry_id     INTEGER,
  qualifier_id INTEGER,
  value        INTEGER            -- 1–5
)

category_qualifiers (category_id, qualifier_id)   -- Qualifier → Kategorie-Bindung
```

**Wichtig:** `timestamp`, `created_at`, `updated_at` sind alle in **Millisekunden**.
`date(e.timestamp / 1000, 'unixepoch')` für SQL-Datumsoperationen notwendig.

---

## Emoji-Presets (1 = schlecht, 5 = gut)

```typescript
const EMOJI_PRESETS: Record<string, string[]> = {
  mood:   ['😢','😕','😐','🙂','😄'],
  health: ['🤒','🤧','😐','😊','💪'],
  sleep:  ['😫','😪','😑','😌','🌟'],
  energy: ['🪫','😩','🌀','⚡','🚀'],
  pain:   ['😖','😣','😬','😌','✅'],
  stress: ['🤯','😤','😬','😌','🧘'],
}
```

---

## Export-Definitionen: `src/db/database.ts`

Alle Funktionen für Auswertungen. Keine Seiteneffekte außer DB-Lesen.

### Typen

```typescript
interface Entry {
  id: number
  timestamp: number        // ms
  text: string
  created_at: number       // ms
  updated_at: number       // ms
  latitude?: number
  longitude?: number
  location_name?: string
}

interface EntryDetail extends Entry {
  categories: Category[]
  tags: Tag[]
  qualifierValues: Record<number, number>   // qualifier_id → 1..5
}

interface Category { id: number; name: string; color?: string }
interface Tag      { id: number; name: string }
interface Qualifier {
  id: number; name: string; emoji_preset: string
  position: number; active: number
}

interface StatsPeriod { from: number; to: number }   // beide ms

interface QualifierTrendPoint {
  day: string           // "YYYY-MM-DD"
  qualifierId: number
  qualifierName: string
  emojiPreset: string
  avg: number           // Durchschnitt 1.0–5.0 für diesen Tag
}

interface NameCount { name: string; color?: string; count: number }
```

### Lesende Funktionen

```typescript
// Alle Einträge, optional gefiltert
getEntries(search?: string, categoryIds?: number[], tagIds?: number[]): Entry[]

// Einzelner Eintrag mit Kategorien, Tags, Qualifier-Werten
getEntry(id: number): EntryDetail | null

// Stammdaten
getCategories(): Category[]
getTags(): Tag[]
getQualifiers(): Qualifier[]   // nur active=1, deleted=0, sortiert nach position

// Kategorie→Qualifier-Bindungen (für Sichtbarkeitslogik)
getQualifierCategoryLinks(): Record<number, number[]>  // qualifier_id → category_id[]

// Einträge mit GPS-Koordinaten im Zeitraum
getEntriesWithLocation(p: StatsPeriod): Entry[]

// Statistik-Übersicht
getStatsOverview(p: StatsPeriod): { total: number; inPeriod: number }

// Qualifier-Trend: Tages-Durchschnittswerte pro Qualifier im Zeitraum
getQualifierTrend(p: StatsPeriod): QualifierTrendPoint[]

// Top-10 Kategorien nach Nutzung im Zeitraum
getCategoryStats(p: StatsPeriod): NameCount[]

// Top-15 Tags nach Nutzung im Zeitraum
getTagStats(p: StatsPeriod): NameCount[]
```

### Schreibende Funktionen (nur für Vollständigkeit, für Stats irrelevant)

```typescript
createEntry(text, timestamp, categoryIds, tagNames, qualifierValues): number
updateEntry(id, text, timestamp, categoryIds, tagNames, qualifierValues): void
deleteEntry(id): void
```

---

## Aktuelle Stats-Komponente: `src/components/Stats.tsx`

Eingebunden als Tab in `EntryList.tsx` → `{tab === 'stats' && <Stats />}`.
Kein Props-Interface — liest direkt aus der DB.

### Was bereits vorhanden ist

- **Zeitfilter-Buttons**: 7 Tage / 30 Tage / 365 Tage / Gesamt
- **2 Kennzahl-Karten**: Einträge im Zeitraum + Einträge gesamt
- **TrendChart** (SVG, 560×160px viewBox): Linienchart pro Qualifier, Tagesdurchschnitt,
  Y-Achse 1–5, Rasterlinie bei jedem Level, Datenpunkte als Circles mit Tooltip,
  Legende mit Farbstreifen + Preset-Icon + Name
- **BarChart** (Div-basiert): Kategorien-Rang (Top 10) + Tag-Rang (Top 15)

### Was fehlt / Ideen für Erweiterungen

- Eintrags-Heatmap (Frequenz pro Tag / Woche über das Jahr)
- Wochentags-Analyse (an welchen Wochentagen schreibt der User am meisten/wenigsten)
- Tageszeit-Analyse (Uhrzeit-Verteilung der Einträge)
- Qualifier-Korrelationen (z.B. Schlaf vs. Energie)
- Streak-Anzeige (Tage in Folge mit Einträgen)
- Durchschnittliche Einträge pro Tag/Woche im Zeitraum
- Wortanzahl-Statistik (Textlänge-Trend)
- Vorperioden-Vergleich (z.B. diese Woche vs. letzte Woche)
- Monatliche Zusammenfassung

---

## Perioden-Funktion (Muster für alle Stats-Komponenten)

```typescript
type Period = 'week' | 'month' | 'year' | 'all'

function periodRange(p: Period): { from: number; to: number } {
  const now = Date.now()
  const day = 86400_000
  if (p === 'week')  return { from: now - 7 * day, to: now }
  if (p === 'month') return { from: now - 30 * day, to: now }
  if (p === 'year')  return { from: now - 365 * day, to: now }
  return { from: 0, to: Number.MAX_SAFE_INTEGER }
}
```

---

## Style-Konventionen

Alle Styles als `Record<string, React.CSSProperties>` am Ende der Datei.
Keine CSS-Dateien, keine Klassen — nur Inline-Styles mit CSS-Variablen.
Farb-Palette für Qualifier-Linien: `['#C9A84C','#5B9CF6','#7EC97E','#E07E7E','#B57EE0','#7EC9C9']`

## Neue DB-Funktionen hinzufügen

Neue Abfragen kommen in `src/db/database.ts`. Muster:

```typescript
export function getMeineStat(p: StatsPeriod): MeinTyp[] {
  const d = getDb()
  const stmt = d.prepare(`
    SELECT date(e.timestamp / 1000, 'unixepoch') as day, ...
    FROM entries e
    WHERE e.timestamp >= ? AND e.timestamp <= ?
    ...`)
  stmt.bind([p.from, p.to])
  const rows: MeinTyp[] = []
  while (stmt.step()) {
    const r = stmt.getAsObject() as Record<string, unknown>
    rows.push({ day: r.day as string, ... })
  }
  stmt.free()
  return rows
}
```

Nach Änderungen: `cd web && bash deploy.sh` (baut + deployt via FTP nach Manitu).

---

## Android-App Export-Formate (`utils/export.ts`)

### JSON (`tagebuch_export.json`)

Array von Objekten, ein Eintrag pro Element:

```json
[
  {
    "id": 42,
    "timestamp": 1746000000000,
    "timestamp_readable": "30.04.2026, 14:00",
    "text": "Eintrag-Text",
    "categories": ["Arbeit", "Sport"],
    "tags": ["wichtig", "idee"],
    "created_at": 1746000000000
  }
]
```

- `timestamp` / `created_at`: Unix-Millisekunden (wie in der DB)
- `timestamp_readable`: lokalisiertes Format `de-DE`, z.B. `"30.04.2026, 14:00"`
- `categories` / `tags`: flache String-Arrays (nur Namen, keine IDs)
- Qualifier-Werte sind **nicht** enthalten

### CSV (`tagebuch_export.csv`)

Semikolon-getrennt, UTF-8, kein BOM:

```
ID;Datum;Text;Kategorien;Tags
42;30.04.2026, 14:00;"Eintrag-Text";Arbeit|Sport;wichtig|idee
```

- Trennzeichen: `;`
- `Text`: doppelt-gequotet, innere `"` verdoppelt (`""`)
- `Kategorien` / `Tags`: pipe-getrennt (`|`), leer wenn keine vorhanden
- `Datum`: identisches `de-DE`-Format wie JSON `timestamp_readable`
- Qualifier-Werte sind **nicht** enthalten
