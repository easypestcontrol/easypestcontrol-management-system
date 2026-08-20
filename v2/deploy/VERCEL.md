# Putting the front end on Vercel

The back end, the database and everything else stays on the VPS. Vercel runs
only `v2/apps/web`, and reaches the API over the public internet.

**The browser never calls the API directly.** Next rewrites `/api/*` on the
server, so requests go browser → Vercel → your VPS. That is why there is no
CORS configuration anywhere, and why no API key is ever visible to a browser.
If you find yourself adding CORS headers, something has gone wrong upstream.

---

## 1. Before Vercel: the API must be reachable

Vercel cannot see anything on `127.0.0.1`. Finish the VPS side first —
`DEPLOY.md` — and confirm from your own machine:

```bash
curl -i https://api.yourdomain.com/api/auth/me
# 401 Unauthorized is the right answer. It means the API is up, HTTPS works,
# and it is refusing an unauthenticated request exactly as it should.
```

A timeout means DNS or the firewall. A 502 means nginx is up but the container
is not. Do not go further until this returns 401.

---

## 2. Import the repository

1. vercel.com → **Add New** → **Project**
2. **Import** `easypestcontrol/easypestcontrol-management-system`
3. Vercel will guess the settings. All three guesses are wrong for a workspace
   monorepo — set them by hand in the next step.

---

## 3. Settings that matter

This repository is npm workspaces: `apps/*` and `packages/*`. The web app
imports `shared`, which is TypeScript that has to be compiled before Next can
build. So the build runs from the **workspace root**, not from the app folder.

| Setting | Value |
|---|---|
| Framework Preset | **Next.js** |
| Root Directory | **`v2`** |
| Build Command | `npm run build --workspace shared && npm run build --workspace web` |
| Output Directory | `apps/web/.next` |
| Install Command | `npm install` |
| Node.js Version | 20.x or later |

> **Why root `v2` and not `v2/apps/web`.** Point Vercel at the app folder and
> `npm install` runs there, where `shared` is not a published package and
> cannot resolve. From `v2` the workspace links it, and the build command
> compiles it first. Setting the root any deeper trades a two-line build
> command for a broken install.

---

## 4. The one environment variable

**Settings → Environment Variables**, for Production, Preview and Development:

```
API_URL = https://api.yourdomain.com
```

No trailing slash. That is the only variable the front end needs.

It is not `NEXT_PUBLIC_` on purpose: `NEXT_PUBLIC_` bakes a value into the
browser bundle, and the API address belongs on the server side of the rewrite,
not in everybody's browser.

---

## 5. Deploy, then check the join

Click **Deploy**. When it finishes:

1. Open the Vercel URL. The sign-in page should render.
2. Sign in. If the page loads but sign-in fails, the front end is fine and the
   join is not — the rewrite cannot reach the API. Check `API_URL` for a typo
   or a trailing slash, and that step 1's `curl` still returns 401.
3. Open the dashboard. If it loads with data, the whole chain works.

---

## 6. Your own domain

**Settings → Domains** → add `app.yourdomain.com` → point the CNAME Vercel
gives you.

Leave `api.yourdomain.com` on the VPS. Two names, two machines, one app.

---

## Afterwards

* Every push to `main` deploys. Pull requests get their own preview URL, all
  pointing at the same production API — so a preview writes to real data.
  Use a separate API and database for previews if that matters.
* Vercel builds only what is in the repository. Anything uncommitted on your
  laptop does not exist as far as it is concerned — check `git status` before
  wondering why a change did not appear.
* The API and database are **not** on Vercel and do not redeploy with it. When
  the schema changes:

  ```bash
  ssh you@your-vps
  cd /opt/pestops && git pull
  cd deploy && docker compose up -d --build
  docker compose exec api npx prisma db push
  ```

  Deploy the API before the front end when a change spans both, so the new
  screen never arrives before the endpoint it calls.
