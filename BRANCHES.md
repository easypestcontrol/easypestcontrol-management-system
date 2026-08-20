# Branches — the plan

**One company, five branches, one admin who sees everything; everyone else sees
only their branch.**

Written 2026-08-20. Target: v2. Status: **BUILT & verified 2026-08-20** — all four
phases done; QA proved the wall (list scoping, direct-URL 404, clamped filter,
technician unchanged). D1–D6 taken as recommended; D5: the five real city
branches are live, Chennai absorbed the demo localities. Backfill script:
`v2/branchfill.mjs` (safe to re-run).

The requirement, as given: branches like Chennai, Madurai, Tiruchi, Coimbatore,
Pondicherry. The founder (admin) works in ONE dashboard that holds all five —
never switching accounts — with a **branch filter** on every section to narrow
the view when wanted. Technicians, operations, sales, accounts log into the same
app but see **only their own branch's** leads, quotations, customers, contracts,
services, invoices — other branches' data must not even load for them.
Technicians additionally keep seeing only their own work, as today.

---

## 1. What the app already has (half the rails are laid)

| Piece | State today |
|---|---|
| `Branch` master (+ Branches page) | Exists — id, name, phone, `areas[]` (locality names that map customers to a branch) |
| `User.branches[]` | Exists — every person can be tied to one or more branches |
| `Client.branch` (+ `area`) | Exists — explicit, or inferred from which branch's `areas` contain the customer's locality |
| `branch` column on documents | **Lead, Quotation, Contract, Purchase Order have it.** Job, Invoice, Audit, Trip don't (they chain to the customer / user) |
| Per-branch inventory | **Already built** — `BranchStock` (each branch's own shelf + reorder floor) and a movements ledger where `branchId` is mandatory |
| Dispatch board | Already groups technicians by branch and has an "All branches" dropdown |
| **Server-side enforcement** | **None.** Today an ops login could read every branch's data. This is the real gap |

## 2. How every record knows its branch — the branch chain

The customer is the anchor: `Client.branch` (set by hand, or inferred from the
customer's area against each branch's `areas` list). Everything else inherits:

```
Lead      → its own branch column (stamped at creation from the creator's branch / picked area)
Quotation → the lead's / customer's branch, stamped at creation
Contract  → the quotation's / customer's branch, stamped at creation
Job       → NEW branch column, stamped from the contract / customer   ← to add
Invoice   → NEW branch column, stamped from the contract / customer   ← to add
Audit     → derived from its customer (low volume — no column needed)
Trip      → derived from its technician's branch
Wallet    → derived from the technician's branch
```

Jobs and invoices get real columns (they are the highest-volume lists — the
filter must be a plain indexed `where`, not a join). A one-time backfill script
stamps every existing row from its customer, and flags any customer whose branch
cannot be inferred so the admin can set it once.

## 3. Enforcement — the server wall (the security part)

One helper used by every controller:

```
scopeOf(user):  admin → ALL branches
                anyone else → their User.branches
```

- Every **list** endpoint filters to the scope, and additionally accepts
  `?branch=BR-x` — clamped inside the scope, so a Madurai ops asking for
  Chennai gets nothing, while the admin's filter dropdown uses the same param.
- Every **detail** endpoint (one lead, one contract, one invoice…) returns
  404 outside the scope — a guessed URL shows nothing.
- **Creates** stamp the creator's branch automatically (admin picks from the
  filter or the customer decides).
- Technicians keep today's tighter rule — only their own services — plus the
  branch wall.
- A user with **no branch assigned sees nothing** (safe default). Part of
  go-live is assigning everyone — see §6.

## 4. The admin's branch filter — one control, everywhere

A single shared dropdown component in each section header:

```
[ All branches ▾ ]   → All branches / Chennai / Madurai / Tiruchi / Coimbatore / Pondicherry / — Unassigned —
```

- **Admin only.** Office users don't see it — their branch is implied. (A user
  deliberately given two branches gets the dropdown limited to those two.)
- The choice is remembered while moving between sections (pick Madurai in
  Leads, land in Invoices already on Madurai) and resets to All on login.
- "— Unassigned —" shows records whose customer has no branch yet — the
  admin's cleanup lens, invisible to everyone else.
- It is a **filter, never a switch** — one dashboard, one login, all data.

## 5. Section by section

| Section | Filter behaviour | Non-admin sees |
|---|---|---|
| Dashboard (Home) | Every number/aggregate respects the filter | Own branch's numbers only |
| Leads | `branch` column filter | Own branch |
| Quotations | same | Own branch |
| Customers | `Client.branch` filter | Own branch |
| Contracts | same | Own branch |
| Dispatch | Already grouped by branch — wire the same dropdown + scope | Own branch's technicians & services |
| Schedule | filter by job branch | Own branch |
| Services (jobs) | NEW `Job.branch` | Own branch (techs: own work) |
| Trips | via the technician's branch | Own trips (office: own branch's) |
| Audits | via customer | Own branch |
| Invoices | NEW `Invoice.branch` | Own branch |
| Reports | every report aggregates within scope + filter | Own branch |
| Collections (wallets) | technicians grouped, filterable by branch | Own branch's technicians |
| Purchase orders | existing `branch` (ship-to shelf) | Own branch |
| Vendors | company-wide (a supplier serves all branches) — **no filter** | All (read) |
| Inventory | per-branch shelves already exist — dropdown selects the shelf | Own branch's shelf |
| Chemicals (tech stock) | via the technician's branch | Own stock / own branch |
| Service catalogue | company-wide (same services & prices everywhere) — **no filter** | All (read) |
| Branches | the master itself — admin manages | Hidden |
| Team | filter by `User.branches` | Own branch's colleagues |
| Training | company-wide by role — **no filter** | Their role's lessons |

## 6. Go-live data hygiene (one-time, admin's 15 minutes)

1. Enter the real five branches in the Branches master (rename/replace the
   demo ones — see decision D5), with each branch's locality list in `areas`.
2. Assign every user to their branch on the Team page.
3. Run the backfill — it stamps everything it can infer and lists the
   customers it couldn't; set those by hand (the "Unassigned" filter shows them).

## 7. Build order

| Phase | What ships | Effort |
|---|---|---|
| **1. Stamp & backfill** | `Job.branch` + `Invoice.branch` columns; creation-time stamping everywhere; backfill script with an "unassigned" report | ~half a day |
| **2. The server wall** | `scopeOf()` + scope enforcement in every controller (lists, details, creates); `?branch=` param | ~a day |
| **3. The filter UI** | Shared BranchFilter dropdown across all sections above; dashboard & reports respect it; sticky choice | ~a day |
| **4. Role QA** | Walk each role: admin filters all five; Chennai ops proves Madurai is invisible (lists AND direct URLs); technician unchanged | ~half a day |

Phase 2 before phase 3 on purpose: the wall is security, the dropdown is
convenience — the wall must never depend on the UI.

## 8. Decisions to approve (or correct) before building

- **D1 — Stamping approach**: Job + Invoice get branch columns, backfilled from
  the customer chain; Audit/Trip/Wallet derive. OK?
- **D2 — Company-wide sections**: Service catalogue, Vendors, Training stay
  shared across branches (no filter). OK?
- **D3 — Multi-branch people**: a user listed in two branches sees the union of
  both (the founder's trusted manager case). OK?
- **D4 — New leads**: a lead created by a Madurai sales person is stamped
  Madurai automatically; the admin creating one picks the branch. OK?
- **D5 — The demo branches**: today's three "branches" are Chennai localities
  (Adyar HQ, Anna Nagar, OMR Perungudi). Replace them with the real five city
  branches (Chennai keeps those localities in its `areas` list)? Or keep
  sub-branches inside Chennai as well?
- **D6 — Collections**: cash confirmation ("mark deposited") — admin and
  accounts of the SAME branch only, or any accounts person? (Plan assumes
  same-branch.)

Approve these (with any corrections) and phase 1 starts immediately.
