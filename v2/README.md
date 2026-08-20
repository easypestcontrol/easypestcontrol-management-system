# PestOps v2

The pest-control operations platform, rebuilt: **Next.js** web, **NestJS** API,
**PostgreSQL**, deployable to any VPS. The UI follows the Zoho Books idiom in
three colors — navy `rgb(27 46 101)`, red `rgb(255 0 0)`, white.

```
v2/
  apps/web          Next.js 15 — the Zoho-style UI (Tailwind 4)
  apps/api          NestJS 11 — REST API, JWT auth, Prisma 6
  packages/shared   The domain engine: visit generation, GST split, crew rules
  scripts/devdb.mjs Embedded PostgreSQL for development (no install needed)
  deploy/           docker-compose + nginx + DEPLOY.md for the VPS
  V2_PARITY.md      Everything v1 does — the port tracker (68 screens, ~180 rules)
```

## Run it locally

Three terminals from this folder:

```bash
npm install            # once
npm run dev:db         # terminal 1 — PostgreSQL on 127.0.0.1:5455
npm run db:push        # once, after the db is up — creates the tables
npm run db:seed        # once — company, branches, team, services

npm run dev:api        # terminal 2 — API on http://127.0.0.1:4000
npm run dev:web        # terminal 3 — app on http://localhost:3050
```

Sign in as `rajesh@shieldpest.in` / `pestops123` (every seeded account uses
that password — priya@ is ops, karthik@ is a technician).

The company logo is uploaded in **Settings → Organisation** and appears at the
top of the sidebar.

## Deploy

See [deploy/DEPLOY.md](deploy/DEPLOY.md).

## Status

The foundation is complete and verified end to end: auth, org bootstrap,
customers, dashboard, settings with logo upload. The remaining v1 modules are
being ported against the checklist in [V2_PARITY.md](V2_PARITY.md) — leads,
quotations (with the PDF pipeline), contracts + the crew model, the dispatch
board, invoices/GST, inventory, reports. The v1 app in the parent folder keeps
working untouched throughout the port.
