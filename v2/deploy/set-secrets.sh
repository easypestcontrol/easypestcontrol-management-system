#!/usr/bin/env bash
# =============================================================================
#  Put the production secrets on this machine — and nowhere else.
#
#  Run it ON THE VPS, over SSH, as the user that owns /opt/pestops:
#
#      cd /opt/pestops/deploy && bash set-secrets.sh
#
#  It prompts for each value, never echoes it, writes .env with 0600 and keeps
#  a backup of whatever was there before. Nothing is printed, logged or sent
#  anywhere: a secret that only ever exists between your keyboard and this file
#  is a secret that cannot leak from a chat window, a ticket or a screen share.
#
#  DB_PASSWORD and JWT_SECRET are generated here by default. There is no reason
#  for a human to ever see them, let alone type them somewhere else.
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")"
ENV_FILE=".env"

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }
ask_secret() {                      # ask_secret VAR "prompt" [default-generator]
  local var="$1" prompt="$2" gen="${3:-}" value=""
  if [ -n "$gen" ]; then
    read -r -p "$prompt [enter to generate]: " -s value; echo
    [ -z "$value" ] && value="$(eval "$gen")" && echo "  generated."
  else
    read -r -p "$prompt: " -s value; echo
  fi
  printf '%s\n' "$value"
}

if [ -f "$ENV_FILE" ]; then
  backup="$ENV_FILE.$(date +%Y%m%d-%H%M%S).bak"
  cp "$ENV_FILE" "$backup"
  chmod 600 "$backup"
  say "Existing .env backed up to $backup"
fi

say "Database and session secrets"
echo "  Press enter to generate each — nobody needs to read these."
DB_PASSWORD="$(ask_secret DB_PASSWORD '  DB_PASSWORD' 'openssl rand -base64 36 | tr -d "/+=" | cut -c1-40')"
JWT_SECRET="$(ask_secret JWT_SECRET '  JWT_SECRET' 'openssl rand -base64 48 | tr -d "/+=" | cut -c1-56')"

say "Cloudflare R2 (leave blank to skip — photos stay in the database)"
echo "  From Cloudflare → R2 → Manage API Tokens. The account id is in the URL."
read -r -p "  R2_ACCOUNT_ID: " R2_ACCOUNT_ID
read -r -p "  R2_BUCKET: " R2_BUCKET
read -r -p "  R2_ACCESS_KEY_ID: " R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY=""
[ -n "$R2_ACCESS_KEY_ID" ] && R2_SECRET_ACCESS_KEY="$(ask_secret R2_SECRET '  R2_SECRET_ACCESS_KEY')"

say "Public URLs"
read -r -p "  APP_DOMAIN   (e.g. app.easypestcontrol.in): " APP_DOMAIN
read -r -p "  API_DOMAIN   (e.g. api.easypestcontrol.in): " API_DOMAIN

umask 077
cat > "$ENV_FILE" <<EOF
# Written by set-secrets.sh on $(date -Iseconds). Mode 0600, never committed.
DB_PASSWORD=$DB_PASSWORD
JWT_SECRET=$JWT_SECRET

# Cloudflare R2. Blank means photos keep living in PostgreSQL.
R2_ACCOUNT_ID=$R2_ACCOUNT_ID
R2_BUCKET=$R2_BUCKET
R2_ACCESS_KEY_ID=$R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY=$R2_SECRET_ACCESS_KEY

APP_DOMAIN=$APP_DOMAIN
API_DOMAIN=$API_DOMAIN
EOF
chmod 600 "$ENV_FILE"

say "Done."
cat <<EOF
  $ENV_FILE written, mode 0600, owner $(whoami).

  Two keys deliberately do NOT live here:

    Ola Maps        Settings → Integrations, in the running app
    Razorpay        Settings → Integrations, in the running app

  Those are entered through the UI and stored in the database, because they can
  be rotated without a redeploy and the app writes them in without ever reading
  them back.

  Next:  docker compose up -d --build
EOF
