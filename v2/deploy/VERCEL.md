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
3. Vercel detects Next.js correctly. The only thing it cannot guess is which
   folder of the monorepo to build — set that in the next step.

---

## 3. Settings

| Setting | Value |
|---|---|
| Framework Preset | **Next.js** (detected) |
| Root Directory | **`v2/apps/web`** |
| Build Command | *leave default* |
| Output Directory | *leave default* |
| Install Command | *leave default* |
| Node.js Version | 20.x or later |

Set the root directory. Leave everything else alone.

> **Why there is no custom build command.** The web app imports `shared`, which
> is TypeScript in this repository and is consumed as compiled `dist/`. Nothing
> compiles it on a fresh checkout, so the first Vercel build failed with
> `Module not found: Can't resolve 'shared'` five times over.
>
> The fix is a `prebuild` script in `apps/web/package.json`:
>
> ```json
> "prebuild": "tsc -p ../../packages/shared/tsconfig.json"
> ```
>
> npm runs `prebuild` before `build` automatically, so `shared` is compiled
> whichever directory the build server chooses to run from. A build that only
> works when a dashboard field is filled in correctly is a build waiting to
> break — better that the repository knows how to build itself.

If the install fails to resolve `shared` at all, turn on **Include source files
outside of the Root Directory** in the project settings: `shared` lives at
`v2/packages/shared`, above the root you just set.

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
   *Build log check:* it should show `> web@2.0.0 prebuild` then `> next build`.
   If `prebuild` is missing, the checkout predates the fix — redeploy from the
   latest `main`.
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
