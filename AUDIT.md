# Where PestOps Overlaps

**A structural audit — navigation, duplication, and who owns a record's state.**

Read: 13,741 lines across 24 view files.
Findings: 6, ranked by what they cost you.
Verdict: structural, not cosmetic.

---

## Four numbers that explain the feeling

| Count | What it is |
|---:|---|
| **11** | places that write a lead's stage, spread over four files — each with its own guard clause |
| **8** | menu items under *Sales & Operations*, covering four distinct ideas |
| **5** | screens that render a list of service visits from the same two tables |
| **4** | separate code paths that create a job, one carrying a bug we already fixed elsewhere |

Every one of these came from a reasonable decision made on its own. The trouble is
that nobody has since asked what the whole thing adds up to — so each new screen was
bolted *beside* the last rather than *into* it. That is why the menu keeps growing and
why the same lead can look different depending on which door you came through.

> **The good news.** None of this is in the scheduling engine or the money. Contracts,
> visit generation, GST splitting and invoices are sound and have regression cover.
> What is tangled is **navigation** and **who owns a record's state** — both fixable
> without touching the parts that are working.

---

## Finding 1 — Sales & Operations is eight doors into four rooms

*This is the one you feel every day.*

### What the five overlapping items actually read

| Menu item | What it reads | Overlap |
|---|---|---|
| Contracts | `db.contracts` — all of them | Superset of the next two |
| AMC | `db.contracts` where not one-time | A filter of Contracts |
| One-time service | `db.contracts` where one-time | The other filter of Contracts |
| Schedule | `db.jobs` by date | Same visits, calendar shape |
| Services *(orphaned)* | `db.jobs` as a list | Same visits, list shape — **and it is in no menu at all** |

Three of those five are the same table with a `where` clause. Two are the same table in
two shapes. A person choosing between "Contracts", "AMC" and "One-time service" has to
already know your data model to pick correctly — and the answer is often "any of them".

### Today vs proposed

```
TODAY — admin sees 16 items          PROPOSED — 11 items, nothing lost
─────────────────────────────        ──────────────────────────────────
MASTER DATA                          SELL
  Branches & Lists                     Leads
  Service Catalogue      ← overlaps    Quotations
SALES & OPERATIONS                     Customers
  Customers                          DELIVER
  Leads                                Contracts    ← AMC + one-time as tabs
  Quotations                           Services     ← list ⇄ calendar toggle
  Contracts              ← overlaps    Team
  AMC                    ← overlaps  SETUP
  One-time service       ← overlaps    Service Catalogue
  Schedule               ← overlaps    Branches & Lists
  Team                               MONEY
RESOURCES · FINANCE                    Invoices · Reports · Settings
  Inventory · Audits
  Invoices · Reports · Settings
```

**The fix is a filter, not a menu item.** One *Contracts* screen with tabs for
`All · AMC · One-time · Expiring`, and one *Services* screen with a list ⇄ calendar
toggle. Three items leave the sidebar and nothing becomes unreachable.

---

## Finding 2 — Eleven places decide what stage a lead is in

*This is the real answer to "why does the lead section feel collapsed".* No single piece
of code owns the pipeline, so the same action lands differently depending on which
screen you were on.

| Where | Trigger | Sets the lead to |
|---|---|---|
| `leads.js` ×4 | The three call buttons and the inspection panel | `followup` · `inspection` · `lost` · `contract` |
| `quotations.js` ×4 | Saving a quote, approving, rejecting, converting | `quoted` · `contract` · `lost` |
| `amcform.js` ×2 | Creating a contract from a lead, and from a quote | **`contract` in one, `won` in the other** |
| `store.js` ×1 | `quoteToContract` promoting a lead to a customer | `contract` |

### The contradiction, in one file

```js
// amcform.js:90 — contract created from the lead card
if (l.stage !== 'won') l.stage = 'contract';   // you still confirm the signature

// amcform.js:729 — contract created from the quotation
if (l.stage !== 'won') l.stage = 'won';        // signature step skipped entirely
```

Same event — an AMC now exists — and the lead ends up in a different column depending on
which button produced it. Neither is wrong on its own; together they mean the **Contract
column can never be trusted** to hold everything awaiting signature.

**The fix: one function owns the pipeline.** Something like
`S.setLeadStage(lead, stage, reason)` that every caller goes through — it writes the
stage, clears the follow-up and inspection dates, appends the activity line, and refuses
transitions that make no sense. Eleven scattered assignments with eleven guard clauses
become one place to read and one place to change.

---

## Finding 3 — Three state machines describe one deal, and they can disagree

A single piece of business is tracked three times over, by three fields that nothing
keeps in step:

| Field | Values | Owned by |
|---|---|---|
| `lead.stage` | new · followup · inspection · quoted · contract · won · lost | eleven callers |
| `quote.status` | draft · sent · approved · rejected · expired | five callers |
| contract exists? | implied by `leadContracts()` | whoever last saved |

They encode overlapping facts:

- A lead at **Quoted** with a quote at **draft** means the pipeline says you have quoted
  when the customer has seen nothing.
- A lead at **Won** with no contract attached is a deal you cannot deliver.

Nothing prevents either.

**Recommendation: keep one source of truth per fact, derive the rest.** The quotation
owns whether it was sent and answered. The contract owns whether it exists and is
signed. The lead stage stops being typed in and becomes *computed* from those two, with
the three call buttons as the only manual input.

---

## Finding 4 — The same record gets created by several different pieces of code

| Record | Ways to create one | Cost of the duplication |
|---|---|---|
| **Customer** | The full form in `clients.js`; a silent stub in `store.js:825`; another stub in `amcform.js:84` | Customers born from a lead have no GST treatment, no billing address and no branch — exactly the bug that made *Edit customer* fail silently |
| **Service visit** | The engine `S.applyPlan`; the manual `newJob`; `contracts.js:561`; `amcform.js:701` | `amcform.js:706` still writes `serviceIds.slice(0, 2)` — the truncation bug we removed from the engine, alive again on the one-time path |
| **Contract** | The work-order page; plus `newContract()` in `contracts.js:304`, still exported but reachable from nothing | ~120 lines of dead form that will drift further from the real one every week |

> **This is how the scheduling bug came back.** We fixed `slice(0, 2)` in the engine, and
> a later screen wrote its own job-creation code that reintroduced it. One creation
> function per record type, used by every screen, is the only thing that stops this
> repeating.

---

## Findings 5 and 6 — two smaller things worth clearing

**5. A whole screen nobody can reach.** The *Services* list at `#/jobs` is in no role's
menu, yet three back-links point at it — including "All services" on the very page you
land on from a contract. Click it and you arrive somewhere you could not have navigated to.

**6. Three menu items with "service" in the name.** *Service Catalogue* is what you
sell. *One-time service* is a kind of contract. *Services* is the visits you perform.
Three different nouns wearing the same word, in one sidebar.

---

## What I would do — four moves, cheapest and safest first

Ordered so each one is independently useful and independently reversible. None of them
touch the scheduling engine or the money.

1. **Collapse the menu.** Merge AMC and One-time into *Contracts* as tabs; merge
   *Schedule* into *Services* as a list ⇄ calendar toggle; put Services back in the menu.
   Sixteen items become eleven. Pure navigation — no data model change, and the fastest
   relief for the confusion you described.

2. **Give the pipeline one owner.** Route all eleven stage writes through a single
   `setLeadStage`. Fix the contract-versus-won contradiction while you are in there.
   This is where the confusion actually lives.

3. **One creation function per record.** Delete the dead `newContract`, point the
   one-time path at the engine instead of hand-rolling a job, and make the two customer
   stubs call the same builder the real form uses.

4. **Then derive the lead stage** from the quotation and the contract, leaving only the
   three call buttons as manual input. Do this last, because it only becomes safe once
   step 2 has given you a single place to change.

> **On sequencing.** Do step 1 on its own and live with it for a day. It is an afternoon
> of work, it is the change you will feel most, and it will tell us whether the confusion
> was mostly navigation or mostly state — which changes how much of steps 2 to 4 is
> worth doing.

---

## Three things I should not decide for you

1. **Are AMC and one-time genuinely different jobs to your team, or just different
   contracts?** If a different person handles them day to day, they may deserve to stay
   separate despite the overlap. If it is the same person, tabs are plainly better.

2. **Should the lead stage ever be set by hand?** Deriving it removes a whole class of
   contradiction, but you lose the ability to move something into a column because you
   know something the system does not.

3. **How much history matters?** Deriving the stage means past leads get recomputed from
   their quotes and contracts. Mostly that corrects them — but anything set by hand in
   the demo would move.

---

# Part K — the placement pass (v2)

Walked screen by screen at 390×844 (a phone in one hand) and at 1280×720, against the
six questions in `TECHNICIAN.md` §10.1. Measured, not guessed: viewport width against
element bounds, tap-target heights, and what the API actually returns to a technician's
token. Fourteen defects, ordered so each is independently useful.

| # | Screen | Defect | Fix |
|---|--------|--------|-----|
| 1 | Login, app bar | A technician lands on the office dashboard — open leads, quotes awaiting, ₹2.17L outstanding | Field roles land on `/jobs`; the logo links to the role's home; `/dashboard` redirects them |
| 2 | `GET /dashboard` | Ungated: business totals readable with a technician's token | `@Roles('admin','ops','sales','accounts')` |
| 3 | `GET /jobs` | Ungated: a technician can list every service in the company. "My day" is a client-side default, not a boundary | Scope to the caller's own jobs for field roles; drop the all-technicians filter for them |
| 4 | Every list | `.ztable` runs off the side of a phone — `/jobs` 712px, `/customers` 749px, `/trip` 599px in a 390px viewport. Columns 4–6 are simply not reachable | One global rule: under `lg` the row becomes a stacked card |
| 5 | Leads | Board is pinned `min-w-[1220px]` — a 1220px canvas in a 390px window | Under `lg`, the list view instead of the board |
| 6 | Service | Two step "1"s and two step "2"s: the gate numbers 1–2, then the wizard restarts at 1 | Letter the gates A and B |
| 7 | Service | Locked steps say "Locked" and nothing else | Say what unlocks each one |
| 8 | Service, Trip, Services | Field tap targets are 32–35px: *Call*, *Navigate to site*, *Add trip*, *My day*, the tabs | 44px under `lg`, unchanged on desktop |
| 9 | Service | `Call Mr.` truncates the customer's name out of the button that calls them | Show the name, or drop the honorific |
| 10 | Login | Three fields on one row need 420px; the *Go* button sits off the right edge of a 390px phone | The row wraps |
| 11 | `AuthGuard` | A role refusal answered 401, and the web client signs you out on a 401 — tapping something not yours logged you out | 403 for a role refusal; 401 stays "who are you" |
| 12 | Commercial lists | `/leads`, `/quotations`, `/invoices`, `/audits` all returned 200 to a technician's token — the pipeline, the pricing, every customer's billing | Gate the collection; leave the detail, which his own screens link to |
| 13 | Service | The finish bar named blockers that were already done ("take your uniform photo" with the photo taken) | Name only what is actually outstanding |
| 14 | Services list | Header read "0 waiting for a technician" to a technician once the server did the scoping | Key the wording off the role, not the filter |

## Worked through

All fourteen are fixed, and both apps typecheck. Verified by measurement at 390×844 and
1440×900, not by eye:

* `/jobs`, `/trip`, `/jobs/:id` — no page overflow, no off-viewport element, no field
  control under 44px, on both widths.
* The shell drops the sidebar for a bottom bar under `lg`: a technician gets Services,
  Trip, Training, Wallet; the office gets Home, Leads, Contracts, Services. The logo goes
  to the role's home in both.
* Every locked step names what unlocks it — *After you check in*, *After you start the
  work*, *After the after-photos* — and the finish bar lists exactly what is missing.
* A technician's token: `403` on leads, quotations, invoices, audits and the dashboard;
  `200` on clients, contracts, inventory, his own holding, his jobs, and the one invoice
  his own screens link to. `GET /jobs` returns only services he is on.
* Sales keeps its pipeline, accounts keeps billing, and both still lose audits — the
  gates match the menu each role already sees.

**One caveat on the numbers.** The web app the user has running on :3050 is a production
build (`next start`), so it serves the last `next build` — none of this is live there
until it is rebuilt and restarted. Everything above was measured against a dev server on
:3060 reading the current source.

**Checked and found already right.** The service wizard reads top-to-bottom in the order
the work is done; the gate blocks the wizard until both its steps are done; `/trip` leads
with today's destination and puts the history below it; `/wallet` is clean at every width.
Those four needed nothing.

## The sweep, finished

Every route in the menu, measured at 390×844: `/dashboard`, `/leads`, `/customers`,
`/contracts`, `/quotations`, `/invoices`, `/board`, `/schedule`, `/reports`, `/inventory`,
`/team`, `/services`, `/branches`, `/audits`, `/training`, `/settings`, `/jobs`,
`/jobs/:id`, `/trip`, `/wallet`. **Page-level horizontal overflow is zero on all twenty.**

Two screens still have content wider than the viewport, and both are correct: the reports
chart (`minWidth: 480` inside `overflow-x-auto`) and the schedule's 250px technician
columns. Wide content scrolling inside its own container is the intended pattern — it is
the *page* that must never scroll sideways.

## Two more, found by looking at the screen

Building the technician dashboard turned up two the static pass could not have caught:

| # | Where | Defect | Fix |
|---|---|---|---|
| 15 | `GET /techdash` | `toISOString()` is UTC. In IST it rolls the date back at 18:30, so "tomorrow" resolved to today and the Tomorrow card repeated today's work | Local date parts, matching `todayISO()` everywhere else in the API |
| 16 | Technician dashboard | "All 1 service(s) done", "8 trip(s)" | A `plural()` helper — a screen a person reads should not contain `(s)` |

Number 15 is the one worth remembering: it was invisible in the payload and obvious the
moment the card rendered the same job twice.
