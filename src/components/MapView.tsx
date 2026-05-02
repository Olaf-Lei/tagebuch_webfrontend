import { useEffect, useRef, useMemo, useState } from 'react'
import L from 'leaflet'
import type { Entry } from '../types'
import { getEntriesWithLocation } from '../db/database'

type Period = 'week' | 'month' | 'year' | 'all'

function periodRange(p: Period) {
  const now = Math.floor(Date.now() / 1000)
  const day = 86400
  if (p === 'week')  return { from: now - 7 * day, to: now }
  if (p === 'month') return { from: now - 30 * day, to: now }
  if (p === 'year')  return { from: now - 365 * day, to: now }
  return { from: 0, to: Number.MAX_SAFE_INTEGER }
}

const periodLabel: Record<Period, string> = { week: '7 Tage', month: '30 Tage', year: '365 Tage', all: 'Gesamt' }

export default function MapView({ onOpenEntry }: { onOpenEntry: (id: number) => void }) {
  const [period, setPeriod] = useState<Period>('all')
  const range = useMemo(() => periodRange(period), [period])
  const entries = useMemo(() => getEntriesWithLocation(range), [range])
  const mapDiv = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<L.CircleMarker[]>([])

  // Map einmalig initialisieren
  useEffect(() => {
    if (!mapDiv.current) return
    const map = L.map(mapDiv.current, { zoomControl: true }).setView([51.3, 10.5], 6)
    mapRef.current = map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map)
    return () => { map.remove(); mapRef.current = null }
  }, [])

  // Marker bei Periodenänderung aktualisieren
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    const bounds: [number, number][] = []

    entries.forEach((entry: Entry) => {
      if (entry.latitude == null || entry.longitude == null) return
      const lat = entry.latitude, lon = entry.longitude
      bounds.push([lat, lon])

      const date = new Date(entry.timestamp * 1000).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
      const preview = entry.text.length > 100 ? entry.text.slice(0, 100) + '…' : entry.text
      const loc = entry.location_name ? `<br><small style="color:#8A9BB0">📍 ${entry.location_name}</small>` : ''

      const marker = L.circleMarker([lat, lon], {
        radius: 9, fillColor: '#C9A84C', color: '#0F1B2D', weight: 2, fillOpacity: 0.9
      })
        .addTo(map)
        .bindPopup(
          `<div style="max-width:220px;font-family:inherit">` +
          `<div style="font-size:12px;color:#8A9BB0;margin-bottom:4px">${date}${loc}</div>` +
          `<div style="font-size:14px;line-height:1.4">${preview}</div>` +
          `<button onclick="window.__tagebuchOpenEntry(${entry.id})" style="margin-top:8px;background:#C9A84C;border:none;border-radius:6px;padding:4px 12px;cursor:pointer;font-size:13px;font-weight:700">Öffnen</button>` +
          `</div>`,
          { maxWidth: 240 }
        )

      markersRef.current.push(marker)
    })

    if (bounds.length > 1) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 14 })
    } else if (bounds.length === 1) {
      map.setView(bounds[0], 13)
    }
  }, [entries])

  // Globaler Handler für Popup-Button (Leaflet-Popups sind kein React)
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__tagebuchOpenEntry = (id: number) => {
      onOpenEntry(id)
      mapRef.current?.closePopup()
    }
    return () => { delete (window as unknown as Record<string, unknown>).__tagebuchOpenEntry }
  }, [onOpenEntry])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)' }}>
      <div style={{ display: 'flex', gap: 8, padding: '10px 16px', flexWrap: 'wrap', background: 'var(--bg)', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
        {(['week','month','year','all'] as Period[]).map(p => (
          <button key={p}
            style={{ border: '1px solid var(--accent)', borderRadius: 20, padding: '5px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                     background: period === p ? 'var(--accent)' : 'transparent', color: period === p ? '#0F1B2D' : 'var(--text2)' }}
            onClick={() => setPeriod(p)}>
            {periodLabel[p]}
          </button>
        ))}
        <span style={{ color: 'var(--text2)', fontSize: 13, marginLeft: 4 }}>
          {entries.length} Standort{entries.length !== 1 ? 'e' : ''}
        </span>
      </div>
      {entries.length === 0 && (
        <p style={{ color: 'var(--text2)', textAlign: 'center', marginTop: 60, fontSize: 14, position: 'absolute', width: '100%', pointerEvents: 'none' }}>
          Keine Einträge mit Standort im gewählten Zeitraum.
        </p>
      )}
      <div ref={mapDiv} style={{ flex: 1 }} />
    </div>
  )
}
