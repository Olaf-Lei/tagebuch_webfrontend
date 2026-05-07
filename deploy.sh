#!/bin/bash
set -e

# Konfiguration – einmalig anpassen oder als Umgebungsvariablen setzen:
#   export FTP_USER="..." FTP_HOST="..." FTP_PATH="..." FTP_PASS="..."
FTP_USER="${FTP_USER:-}"
FTP_HOST="${FTP_HOST:-}"
FTP_PATH="${FTP_PATH:-}"
FTP_PASS="${FTP_PASS:-}"   # optional, sonst Prompt

if [[ -z "$FTP_USER" || -z "$FTP_HOST" || -z "$FTP_PATH" ]]; then
  echo "Fehler: FTP_USER, FTP_HOST und FTP_PATH müssen gesetzt sein." >&2
  exit 1
fi

echo "→ Build..."
npm run build

UPLOAD_DIR=$(mktemp -d)
cp -r dist/. "$UPLOAD_DIR/"
cp proxy.php "$UPLOAD_DIR/"

echo "→ Deploy via FTP zu $FTP_HOST$FTP_PATH..."
lftp -c "
  set ftp:ssl-allow yes
  set ssl:verify-certificate yes
  open ftp://$FTP_USER${FTP_PASS:+:$FTP_PASS}@$FTP_HOST
  mirror --reverse --delete --verbose \
    $UPLOAD_DIR/ \
    $FTP_PATH/
  bye
"

rm -rf "$UPLOAD_DIR"
echo "✓ Fertig"
