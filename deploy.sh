#!/bin/bash
set -e

# Konfiguration (einmalig anpassen)
MANITU_USER="YOUR_FTP_USER"
MANITU_HOST="YOUR_FTP_HOST"
MANITU_PATH="YOUR_FTP_PATH"
MANITU_PASS="YOUR_FTP_PASS"   # optional: Passwort in Env-Variable, sonst Prompt

echo "→ Build..."
npm run build

# dist/ + proxy.php in ein temporäres Verzeichnis zusammenlegen
UPLOAD_DIR=$(mktemp -d)
cp -r dist/. "$UPLOAD_DIR/"
cp proxy.php "$UPLOAD_DIR/"

echo "→ Deploy via FTP zu $MANITU_HOST$MANITU_PATH..."
lftp -c "
  set ftp:ssl-allow yes
  set ssl:verify-certificate yes
  open ftp://$MANITU_USER${MANITU_PASS:+:$MANITU_PASS}@$MANITU_HOST
  mirror --reverse --delete --verbose \
    $UPLOAD_DIR/ \
    $MANITU_PATH/
  bye
"

rm -rf "$UPLOAD_DIR"
echo "✓ Fertig"
