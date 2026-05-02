export interface WebDAVConfig {
  url: string        // Nextcloud-Basis-URL, z.B. https://cloud.example.com
  username: string   // Login (E-Mail oder Username)
  davUser: string    // Kontoname im WebDAV-Pfad (Nextcloud → Profil → Kontoname)
  password: string
  dir: string        // Verzeichnis in Nextcloud, z.B. /Eigene/Persönlich
  encKey?: string
}

export interface Entry {
  id: number
  timestamp: number
  text: string
  created_at: number
  updated_at: number
  latitude?: number
  longitude?: number
  location_name?: string
}

export interface Category {
  id: number
  name: string
  color?: string
}

export interface Tag {
  id: number
  name: string
}

export interface Qualifier {
  id: number
  name: string
  emoji_preset: string
  position: number
  active: number
}

export interface EntryDetail extends Entry {
  categories: Category[]
  tags: Tag[]
  qualifierValues: Record<number, number>
}
