#!/usr/bin/env bash
# =============================================================================
#  Connect Cloudflare R2, in one command, on the machine that needs it.
#
#      cd /opt/pestops/v2/deploy && bash set-r2.sh
#
#  Prompts for the four values, proves they work by writing and reading a test
#  object, and only then saves and restarts the API. A key that does not work
#  is never written, so the page can never show "connected" over a broken
#  connection.
#
#  The secret is typed here and nowhere else — not in a chat, not in a ticket,
#  not in a commit. That is the whole reason this is a script and not a
#  configuration you send to somebody.
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")"

ENV_FILE=".env"
[ -f "$ENV_FILE" ] || { echo "No .env here. Run set-secrets.sh first."; exit 1; }

current() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2-; }

echo
echo "Cloudflare R2 — dash.cloudflare.com → R2"
echo

# The account id is in every R2 endpoint URL and in the dashboard address. It
# is an identifier, not a secret, so it is safe to keep and offer back.
ACC_NOW="$(current R2_ACCOUNT_ID)"
read -r -p "  Account id${ACC_NOW:+ [$ACC_NOW]}: " ACC
ACC="${ACC:-$ACC_NOW}"

BUCKET_NOW="$(current R2_BUCKET)"
read -r -p "  Bucket name${BUCKET_NOW:+ [$BUCKET_NOW]}: " BUCKET
BUCKET="${BUCKET:-$BUCKET_NOW}"

read -r -p "  Access Key ID: " AKID
read -r -s -p "  Secret Access Key: " SECRET; echo

[ -n "$ACC" ] && [ -n "$BUCKET" ] && [ -n "$AKID" ] && [ -n "$SECRET" ] || {
  echo; echo "All four are needed. Nothing was changed."; exit 1;
}

echo
echo "Testing before saving…"

# Prove it end to end inside the API container, which is where it has to work.
docker compose run --rm --no-deps \
  -e "R2_ACCOUNT_ID=$ACC" -e "R2_BUCKET=$BUCKET" \
  -e "R2_ACCESS_KEY_ID=$AKID" -e "R2_SECRET_ACCESS_KEY=$SECRET" \
  api node -e '
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } =
  require("@aws-sdk/client-s3");
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const B = process.env.R2_BUCKET, K = "pestops/.connection-test";
(async () => {
  await s3.send(new PutObjectCommand({ Bucket: B, Key: K, Body: "ok", ContentType: "text/plain" }));
  const r = await s3.send(new GetObjectCommand({ Bucket: B, Key: K }));
  const body = await r.Body.transformToString();
  await s3.send(new DeleteObjectCommand({ Bucket: B, Key: K }));
  if (body !== "ok") throw new Error("read back the wrong bytes");
  console.log("  wrote, read and deleted a test object — the bucket works.");
})().catch((e) => { console.error("  FAILED: " + e.message); process.exit(1); });
' || {
  echo
  echo "Nothing was saved. Common causes:"
  echo "  · the token needs Object Read & Write on this bucket, not just read"
  echo "  · the bucket name is wrong, or it lives under a different account"
  echo "  · the account id is not the one in the R2 endpoint URL"
  exit 1
}

# Only now is it worth keeping.
cp "$ENV_FILE" "$ENV_FILE.$(date +%Y%m%d-%H%M%S).bak"
chmod 600 "$ENV_FILE".*.bak
python3 - "$ENV_FILE" "$ACC" "$BUCKET" "$AKID" "$SECRET" <<'PY'
import sys
path, acc, bucket, akid, secret = sys.argv[1:6]
vals = {
    "R2_ACCOUNT_ID": acc, "R2_BUCKET": bucket,
    "R2_ACCESS_KEY_ID": akid, "R2_SECRET_ACCESS_KEY": secret,
}
lines, seen = [], set()
for line in open(path):
    key = line.split("=", 1)[0].strip()
    if key in vals:
        lines.append(f"{key}={vals[key]}\n"); seen.add(key)
    else:
        lines.append(line)
for k, v in vals.items():
    if k not in seen:
        lines.append(f"{k}={v}\n")
open(path, "w").writelines(lines)
PY
chmod 600 "$ENV_FILE"

echo
echo "Saved. Restarting the API…"
docker compose up -d api >/dev/null 2>&1
sleep 4
docker compose logs api --tail 30 2>/dev/null | grep -i "R2 ready" || echo "  (check: docker compose logs api | grep R2)"

cat <<EOF

Done. Open Credentials in the app and press Refresh figures — Cloudflare R2
will report the bucket rather than a warning.

New photographs go to R2 from now on. To move the ones already in PostgreSQL:

  docker compose exec api node prisma/photos-to-r2.mjs --dry-run
  docker compose exec api node prisma/photos-to-r2.mjs
EOF
