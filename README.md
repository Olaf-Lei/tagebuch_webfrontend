# Tagebuch – Web Client

Browser-basierter Client für die [Tagebuch Android-App](https://play.google.com/store/apps/details?id=com.tagebuch.app). Liest und schreibt dieselbe SQLite-Datenbank wie die App – via Nextcloud/WebDAV oder Google Drive.

## Features

- Einträge lesen, erstellen, bearbeiten, löschen
- Kategorien, Tags, Qualifiers (Bewertungsskalen)
- Statistiken: Qualifier-Trend, Kategorie- und Tag-Ranking
- Kartenansicht (Leaflet) mit Zeitfilter
- Dark- / Light-Modus
- Export: JSON, CSV, Markdown
- **QR-Code- und Relay-Code-Login** – Zugangsdaten direkt aus der Android-App übertragen
- Sync mit Nextcloud (WebDAV) und/oder Google Drive (gleichzeitig)

## Voraussetzungen

| Anforderung | Details |
|---|---|
| PHP | ≥ 7.4, `curl`-Extension aktiviert |
| Schreibrechte | `sys_get_temp_dir()` (für Relay-Codes, typisch `/tmp`) |
| HTTPS | Pflicht – Browser blockiert Mixed Content und Kamera-Zugriff ohne TLS |
| Google Drive (optional) | Eigene OAuth 2.0 App im Google Cloud Console |

## Setup

### 1. Bauen

```bash
npm install
npm run build        # erzeugt dist/
```

### 2. Dateien hochladen

`dist/` und `proxy.php` in dasselbe Verzeichnis auf deinem Webserver hochladen:

```
deine-domain.de/tagebuch/
├── index.html        # aus dist/
├── assets/           # aus dist/
└── proxy.php
```

### 3. Proxy konfigurieren

```bash
cp proxy.config.example.php proxy.config.php
```

`proxy.config.php` bearbeiten:

```php
$googleClientId     = 'DEINE_CLIENT_ID.apps.googleusercontent.com';
$googleClientSecret = 'DEIN_CLIENT_SECRET';
```

> **Ohne Google Drive** kann `proxy.config.php` leer bleiben oder die Platzhalter stehen lassen – Nextcloud/WebDAV-Sync und Relay-Code-Login funktionieren ohne Google-Credentials.

### 4. Google OAuth einrichten (nur für Google Drive)

1. [Google Cloud Console](https://console.cloud.google.com/) → neues Projekt oder bestehendes wählen
2. APIs & Dienste → OAuth 2.0-Client-IDs → Typ: **Webanwendung**
3. Autorisierte JavaScript-Ursprünge: `https://deine-domain.de`
4. Autorisierte Weiterleitungs-URIs: `https://deine-domain.de/tagebuch/`
5. Client-ID und Secret in `proxy.config.php` eintragen
6. API-Bibliothek: **Google Drive API** aktivieren

### 5. Android-App verbinden

In der Tagebuch-App:

**Einstellungen → Sync & Backup → Web-Frontend URL**

```
https://deine-domain.de/tagebuch
```

Danach kann die App QR-Codes und 6-stellige Relay-Codes generieren, die automatisch die Zugangsdaten an den Web-Client übertragen.

## Tech Stack

- React 19 + Vite + TypeScript
- [sql.js](https://github.com/sql-js/sql.js) – SQLite im Browser (WASM)
- [Leaflet](https://leafletjs.com/) – Kartenansicht
- PHP `proxy.php` – CORS-freier WebDAV-Proxy + Google OAuth Token-Exchange + Relay-Code-Login

## Sicherheitshinweise

- `proxy.config.php` enthält dein Google Client Secret – **nie committen** (steht in `.gitignore`)
- Der WebDAV-Proxy leitet nur `https://`-URLs weiter
- Relay-Codes sind 5 Minuten gültig und werden nach Abruf sofort gelöscht
- Die Datenbank wird vor dem Upload AES-verschlüsselt, wenn in der Android-App aktiviert

## Lizenz

GNU General Public License v3.0 – siehe [LICENSE](LICENSE)
