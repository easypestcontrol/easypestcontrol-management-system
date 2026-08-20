# The Technician Module

**Brainstorm and build plan — the field app, the crew, the chemicals, the money.**

This is the piece the whole business runs on. Everything before it — the lead, the
quotation, the contract — is preparation. This is the part where someone stands at a
customer's door and does the work, and where the company finds out whether it happened,
whether it happened properly, and whether it got paid for.

**Target: v2** (`v2/apps/web` + `v2/apps/api`). Not v1. Razorpay, live GPS tracking,
map keys and photo storage all need a server; v1 is localStorage-only and would have to
fake every one of them.

**Status: Part A built and verified end to end.** Parts B–K to go. §12 is the checklist
to verify against when it is done.

---

## 1. The ten requirements

Written out as given, so nothing is lost in the translation to tasks.

| # | Requirement |
|---|---|
| 1 | Before entering any service, the technician uploads a **full-size photo of himself** — proof he is in full uniform. Punctuality and discipline. Every service, no exceptions. |
| 2 | Before entering, **location**. On the **first** service at a site it is mandatory — he must be standing there to mark it. On **later** services that saved location is used to navigate. |
| 3 | **Ola Maps** integrated in the Trip section — view the location, travel to it. |
| 4 | A service with 2+ technicians has a **head**. Only the head updates the service. The others get the trip and the checklist, nothing else. The head is chosen when technicians are assigned. |
| 5 | **Chemical issue.** A new **senior technician** role can issue from inventory alongside admin and ops. What a technician takes sits in *his* profile as stock in hand. What he uses on a service is recorded there and deducted from his holding. |
| 6 | Replace *"What did you find?"* with **area-wise free text** — kitchen, bathroom, living room, each its own line, added as needed. |
| 7 | A **notes** field for the technician, above the customer signature. |
| 8 | On completion, the invoice is raised **from the contract's billing type**. |
| 9 | Every **report** goes to the customer and to admin, stamped with date, time and who did it. |
| 10 | **Payment** — UPI via Razorpay, or cash into the technician's wallet, transferred to the company and confirmed by the office. |

### 1.1 The billing rule that scopes everything

Confirmed: the three billing types already work and are **not** being rebuilt. What
matters here is which one puts money in a technician's hand.

| Billing type | Who collects | Technician sees a payment step? |
|---|---|---|
| **Upfront** | Customer pays the company directly | **No** |
| **Monthly** | Customer pays the company directly | **No** |
| **Per-service** | **Technician collects at the door on completion** | **Yes** |

Everything in §7 — the UPI QR, the cash wallet, the settlement — applies to
**per-service contracts only**. On an upfront or monthly contract the technician
finishes the service and walks away; the invoice is the office's business.

---

## 2. What v2 already has — verified

An earlier draft of this table marked most of these **Built** on the strength of the
Prisma schema and the controller method names. That was an overclaim: a `@Get('route')`
in a controller proves an endpoint exists, not that the feature works or that anything
renders it. The table below is written after reading the implementations.

Three honest states: **Solid** (read it, it holds up), **Partial** (works, but the good
half is unused or the UI is wrong), **Missing**.

| Piece | Where | State |
|---|---|---|
| Trip distance along the GPS path | `trips.controller.ts` `ping` | **Solid** — accumulates per segment, drops fixes over 150 m accuracy, filters sub-3 m jitter and 2 km GPS jumps. This is real path distance, not a straight line. |
| `Trip` model — `points[]`, `distanceM` | `schema.prisma:446` | **Solid** |
| Ola routing call | `trips.controller.ts` `route` | **Solid at the API** — returns `distanceM`, `durationS`, `polyline` **and full turn-by-turn `steps[]` with maneuvers** |
| Turn-by-turn navigation | `components/navigate-sheet.tsx` | **Built** — and my "missing entirely" was wrong a second time. It already existed *inside the service* (`NavigateSheet`, 208 lines: live next-turn, local step advance, re-route). You said this precisely: the map is right inside the service, the **trip section** had no directions. Now extracted to a shared component and mounted in both. |
| Razorpay UPI QR | `api/src/pay` | **Partial** — QR generation and capture polling read correctly; not verified end to end against a live key |
| Wallet + `POST /wallet/settle` | `api/src/wallet` | **Partial** — the office-confirms model is right and role-gated; UI placement unreviewed |
| `Payment.by`, `.settled` | `schema.prisma:374` | **Solid** |
| `Job.exec` — timings, geo, photos, chemicals, findings, signature | `schema.prisma:330` | **Solid as a shape** — no uniform photo, no area findings, no tech notes |
| `Job.techIds[]`, `crewNeed` | `schema.prisma:330` | **Partial** — no `headTechId`, no head-vs-crew rights |
| `InventoryItem`, `StockMove` | `schema.prisma:389` | **Partial** — no per-technician holding |
| `Invoice.kind='visit'`, `jobId` | `schema.prisma:354` | **Solid as a shape** — the completion trigger is not wired |
| Technician UI | `jobs/[id]` + `TECH_NAV` | **Built** — an 1,811-line field view with the 8 gated steps, payment collection (`TechMoney`, `CollectDialog`) and its own sidebar. My audit called this "missing entirely"; it was not. |

**The lesson for this document:** "the endpoint exists" and "the feature works" are
different claims — and so are "I could not find it" and "it is not there". I got this
table wrong in both directions before reading the code: I marked API shapes as working
features, and I marked two substantial built features as missing. Everything in §12 is
now written as something you can stand in front of and watch happen.

### 2.1 Progress

| Part | State |
|---|---|
| **A** Schema + role predicate | **Done** — verified live |
| **B** Technician shell | Already existed |
| **C** Entry gates — uniform photo, 50 m site capture | **Done** — verified live |
| **D** Area findings, technician notes | **Done** — verified live |
| **E** Crew head rights | **Done** — API refuses a non-head (403), verified |
| **F** Chemicals — issue, holding, consume, return | **Done** — store/holding balance exact, verified |
| **G** Invoice on completion by billing type | **Was already built** — verified per-visit raises, interval does not |
| **I** Trip-section directions | **Done** — `NavigateSheet` extracted and shared |
| **J** Reports — send + log | **Done** — office notified, send stamped on the record |
| **K** Placement pass | **Done** — 14 defects found by measurement, all fixed; written up in `AUDIT.md` |

53 of 79 checklist items are ticked and verified live. What is left is almost entirely
things a terminal cannot answer: does the next-turn banner really advance while driving,
does the uniform capture open the camera rather than the gallery on a real handset, does
the report actually reach the customer. Those need the phone, not the keyboard.

**Part K turned up more than layout.** Measuring what the API returns to a technician's
token — rather than what his menu shows him — found that `/dashboard`, `/leads`,
`/quotations`, `/invoices`, `/audits` and the unfiltered `/jobs` list all answered `200`.
The menu hid them; nothing stopped them. That is fixed and listed in `AUDIT.md`.

---

## 3. Data model changes

Nine additions. Nothing existing is broken.

### 3.1 Role
```prisma
enum Role { admin  ops  sales  tech  senior_tech  accounts  client }
```
**Built.** `senior_tech` can issue chemicals and is otherwise a technician.

Adding a role is not one line — it is every place the old one was checked. There were
about thirty `role === 'tech'` tests across the two apps, and leaving any of them alone
would have quietly locked a senior technician out of his own job. They now all route
through one predicate in `packages/shared/src/roles.ts`:

| Helper | Answers |
|---|---|
| `isFieldTech(role)` | Does this person go out and do the work? (`tech` or `senior_tech`) |
| `canIssueStock(role)` | May they release chemicals from the store? (`admin`, `ops`, `senior_tech`) |
| `isOffice(role)` | May they see and change other people's work? |
| `canRecordService(user, job)` | May they write the execution record? Head or office only — §5 |
| `isOnCrew(user, job)` | Are they on this job at all? |

Applied to 14 call sites in the web app and 5 API controllers. Both apps typecheck clean.
`canRecordService` and `isOnCrew` are written now but not yet wired — Part E does that.

**Verified live:** Karthik R (U04), whose title was already *Senior Technician*, was
promoted to the role. He signs in, the office still sees him as a technician with
performance figures, and `GET /api/jobs` returns 200 for his token.

### 3.2 Job — the crew head
```prisma
model Job {
  headTechId String @default("")   // who owns this service; must be in techIds
  ...
}
```
**Built.** Set explicitly on every job that has a crew, including single-technician ones.
An earlier draft said to leave it empty when there is only one technician and infer the
head — that was worse: every consumer would have to remember the rule, and one that
forgot would silently grant crew rights to nobody. It is only *implicit at assignment
time*, where a lone technician becomes head without being asked.

Backfilled across the existing data: 54 jobs given a head, 0 left headless, the 2
unassigned jobs correctly untouched.

### 3.3 Client — the site location

**Built.**
```prisma
model Client {
  siteLat    Float?        // captured on the first service, at the door
  siteLng    Float?
  siteGeoAt  String  @default("")   // when
  siteGeoBy  String  @default("")   // which technician marked it
}
```
Marked once, navigated to forever after.

### 3.4 TechStock — what a technician is carrying

**Built.**
```prisma
model TechStock {
  id      Int    @id @default(autoincrement())
  userId  String
  itemId  String
  qty     Int    @default(0)        // current holding in the item's unit
  @@unique([userId, itemId])
}
```

### 3.5 StockIssue — the paper trail for it

**Built.**
```prisma
model StockIssue {
  id       String   @id            // ISS-1
  userId   String                  // who took it
  issuedBy String                  // admin / ops / senior_tech
  itemId   String
  qty      Int
  dir      String   @default("out") // out = issued to him, in = returned
  jobId    String   @default("")    // set when the movement is consumption on a service
  at       DateTime @default(now())
  note     String   @default("")
}
```

### 3.6 Job.exec — three new keys
```jsonc
{
  "uniformPhoto": "uploads/uniform/JOB-901-U03.jpg",   // §1 — the gate
  "areaFindings": [                                    // §6 — replaces findings[]
    { "area": "Kitchen",     "text": "Gel applied behind the slab and hinges." },
    { "area": "Bathroom",    "text": "Drain treated, no live activity seen." }
  ],
  "techNotes": "Customer asked us to avoid the puja room."  // §7
}
```
`findings[]` stays readable for old records; nothing is migrated.

### 3.7 Invoice — already sufficient
`kind: 'visit'` and `jobId` already exist. §8 needs logic, not schema.

---

## 4. The technician journey

The v1 wizard, re-cut with the gates in front and the payment at the end.

```
   ┌─ ENTRY GATE ────────────────────────────────────────────┐
   │  0a  Uniform photo          mandatory, every service     │
   │  0b  Location               mandatory on first visit     │
   │      ↓                      navigate on later visits     │
   └─────────────────────────────────────────────────────────┘
        1  Start travel            → opens a Trip, GPS begins
        2  Check in at site        → stamps exec.geo
        3  Before-treatment photos
        4  Start work              → timer runs
        5  Chemicals used          → deducted from HIS holding
        6  Area-wise findings      → kitchen / bathroom / …
        7  After-treatment photos
        8  Technician notes
        9  Customer signature & rating
       10  Finish
            ↓
       11  Invoice raised from the contract's billing type
       12  PER-SERVICE ONLY → collect payment (UPI or cash)
       13  Report sent — customer + admin, stamped
```

Steps 1–10 are the head's, on a crew job. Non-head crew see step 1 and a read-only
checklist. Nothing else.

### 4.1 The two gates

**Uniform photo.** Camera only — no gallery picker, so an old photo cannot be
re-submitted. Stored against the job, shown on the report and on the admin's view of the
service. If it is missing, the service cannot be entered.

**Location.** Behaviour depends on whether the customer already has one:

| | First service at this site | Every service after |
|---|---|---|
| Requirement | **Mandatory** — must be captured on site | Not asked |
| What happens | Device GPS saved to `Client.siteLat/siteLng` | Saved point used for navigation |
| If GPS is refused or inaccurate | Blocked, with the reason | Falls back to the address |

A single accuracy threshold, and the technician must be within it before the app accepts
the mark — otherwise the site location can be set from the office by mistake.

---

## 5. The crew and its head

**Assignment.** When technicians are assigned to a service the head is chosen at the same
time. One head, always, even on a single-technician job — where it is that technician,
set automatically and not asked.

**Rights.**

| Action | Head | Crew |
|---|---|---|
| Start own trip, distance counted | ✅ | ✅ |
| View the checklist | ✅ | ✅ |
| See the site location | ✅ | ✅ |
| Uniform photo | ✅ | ✅ own |
| Upload before/after photos | ✅ | ❌ |
| Record chemicals | ✅ | ❌ |
| Enter findings | ✅ | ❌ |
| Technician notes | ✅ | ❌ |
| Customer signature | ✅ | ❌ |
| Finish the service | ✅ | ❌ |
| Collect payment | ✅ | ❌ |

Each crew member still submits **his own uniform photo** — the point of it is that each
person is in uniform, not that one of them is.

**Enforced on the API, not just the UI.** A non-head calling the update endpoint is
refused. A hidden button is not a permission model.

---

## 6. Chemicals — issue, carry, consume

The model is a personal holding, not a shared cupboard.

```
   INVENTORY                TECHNICIAN                 SERVICE
   ─────────                ──────────                 ───────
   Bromadiolone   ──issue──▶  in hand: 20 L  ──use──▶  10 L on JOB-901
   stock −20 L               (TechStock)               in hand: 10 L
                                  ▲                    StockMove(jobId)
                                  └──── return 2 L ────┘
```

- **Issued by** admin, ops, or the new **senior technician**.
- Every movement writes a `StockIssue` row: who took it, who issued it, when, how much.
- The technician's profile shows **what he is carrying right now**, item by item.
- On a service he records what he used. It is deducted from his holding on finish, and a
  `StockMove` links the consumption to the job.
- **He cannot record more than he is carrying.** The form caps at his holding.
- Unused stock can be **returned** to inventory, which reverses cleanly.

Admin gets a view of every technician's holding — chemicals signed out and not yet
accounted for are money walking around.

---

## 7. Payment — per-service contracts only

Reached only when the contract bills per service. The invoice for the visit is raised
first (§8), then:

### 7.1 UPI

Razorpay QR for the exact invoice balance, generated on the phone, shown to the customer.
The app polls until Razorpay reports capture, then records the payment against the
invoice. `POST /pay/upi/:invoiceId` and `GET /pay/upi/:qrId/status` are **already built**.
API keys go in Settings — left blank until supplied.

### 7.2 Cash — the wallet

```
  Customer pays ₹500 cash
        ↓
  Payment{ mode:'Cash', by: <tech>, settled:false }
        ↓
  Technician's wallet: ₹500 in hand
        ↓
  He transfers via Razorpay  ──────▶  office sees it arrive
        ↓
  Admin / ops / accounts confirms receipt   ← your decision: a second pair of eyes
        ↓
  settled:true — wallet clears
```

**The wallet never clears itself.** A transfer that Razorpay reports as successful still
waits for the office to confirm, because the risk being managed here is not a failed API
call — it is cash. `POST /wallet/settle` already implements exactly this and is already
restricted to admin, ops and accounts.

The technician's wallet screen shows: in hand now, every collection that makes it up, and
the transfer button. The office's screen shows every technician with cash outstanding,
largest first.

---

## 8. Invoicing on completion

On finish, read the contract's billing type:

| Billing type | On completion |
|---|---|
| Upfront | Nothing — already invoiced at the start |
| Monthly | Nothing — the office raises it on the cycle |
| **Per-service** | Raise `Invoice{ kind:'visit', jobId }` from the contract's service rates, then show the payment step |

The rate comes from the contract's own plan line, never the current catalogue price — an
agreement signed in January bills at January's rate. A visit already invoiced can never be
invoiced twice.

---

## 9. Reports and tracking

**The report** is sent on finish to the customer and to admin together, carrying: date,
time started and finished, time on site, who did it (head and crew by name), uniform
photos, before and after photos, chemicals used with quantities, area-wise findings,
technician notes, customer signature and rating.

Every send is logged — what went, to whom, when. A report is the thing a customer quotes
back months later; it needs to be provable, not just sent.

**Tracking.** Every trip is a GPS breadcrumb path with real distance along the route, not
a straight line between two points. Admin sees who is out, where they are now, the path
they took, and the distance claimed against it. This is what makes travel reimbursement
checkable rather than trusted.

### 9.1 Navigation — travel like Google Maps

**This is the gap.** Today the trip page draws a static blue line and stops. A line on a
map is not navigation. Navigation is: pick where you are going, tap start, and be told
what to do at each turn while you drive.

The API already returns everything needed — `steps[]` with instruction text, distance,
duration, maneuver type and the coordinate of each turn. The page discards it. Nothing
new is needed from Ola for the first version; it needs building on the screen.

**What "travel like Google Maps" means, concretely:**

| | Behaviour |
|---|---|
| **Pick a destination** | The service site, another technician's location, or a searched place (`/trips/places` exists) |
| **Preview** | Route drawn, total distance and ETA, the full turn list readable before starting |
| **Start navigation** | Full-screen map, camera follows the technician, heading-up |
| **Next-turn banner** | Big, permanently visible: *"In 200 m, turn left onto Sardar Patel Road"* — distance counts down live |
| **Step advance** | When the turn coordinate is passed, the banner moves to the next step by itself |
| **Off-route** | Detected when he strays past a threshold from the line → re-route automatically, tell him it happened |
| **Voice** | Speak each instruction. He is driving; he cannot read a phone |
| **Arrival** | Detected on reaching the destination → navigation ends, offers to check in |
| **Throughout** | Breadcrumbs keep pinging, so distance keeps accruing while navigating |

**Two places it runs, and they are different jobs:**

- **In the Trip section** — free travel. Choose any destination and go. This is the one
  that is missing entirely.
- **Inside a service** — the destination is fixed to the customer's saved site location
  (§4.1). One tap from the service, no searching.

**Re-routing needs care.** Ola is called on every re-route; a technician stuck in traffic
must not trigger a call every second. Re-route on genuine deviation past a threshold,
rate-limited, and never while stationary.

**Ola Maps** keys live in Settings alongside Razorpay.

---

## 10. Build parts

Each part is independently shippable and independently verifiable.

| Part | What | Depends on |
|---|---|---|
| **A** | Schema — role, `headTechId`, client geo, `TechStock`, `StockIssue`, exec keys | — |
| **B** | Technician shell in v2 web — sidebar, today's work, service list | A |
| **C** | The two entry gates — uniform photo, location capture and navigation | B |
| **D** | The service wizard — steps 1–10, area findings, notes | C |
| **E** | Crew head — assignment, rights, API enforcement | D |
| **F** | Chemicals — issue, holding, consumption, return, admin view | D |
| **G** | Invoicing on completion, per billing type | D |
| **H** | Payment — UPI QR, cash wallet, office settlement | G |
| **I** | **Navigation** — §9.1 in full. Turn-by-turn, live banner, off-route, voice, arrival | B |
| **J** | Reports — compose, send to customer + admin, log | D |
| **K** | **Placement pass** — the audit below | E–J |

**Order:** A → B → C → D, then E/F/G in parallel, then H, then I/J, then K last.

### 10.1 Part K — the placement pass

Your words: *everything is implemented and working, but not in the right place, and not a
perfect UI.* That is a different problem from a missing feature, and it needs a different
method. Features are found by asking "does this exist?" — placement problems are found by
asking "would someone reach for this here?"

This part is **not** "tidy the CSS". It is a screen-by-screen walk of the whole app with
one question per screen:

1. **Is the primary action the most prominent thing?** One obvious next step, not five
   equal buttons.
2. **Is anything here that belongs somewhere else?** A control on the wrong screen is
   worse than a missing one — it teaches the wrong model.
3. **Does the order match the order of the work?** Screens should read in the sequence
   the job is done, top to bottom.
4. **Is anything said twice, or contradicted?** Two numbers for the same thing is a bug
   even when both are right.
5. **Does it hold on a phone?** Field screens especially — one hand, sunlight, gloves.
6. **Is every disabled thing explaining itself?** A dead button with no reason is the
   most common small failure in this app.

The output is a numbered defect list with a screen name and a one-line fix each, worked
through in order. Findings from this pass belong in `AUDIT.md`, not scattered in commits.

**This runs last on purpose.** Doing it before E–J means polishing screens that are about
to change.

---

## 11. UI rules

Same idiom as the rest of v2 — Zoho Books in three colours, navy `rgb(27 46 101)`, red
`rgb(255 0 0)`, white.

- **The field app is a phone app.** Thumb-reachable primary actions, one decision per
  screen, large tap targets. The technician is standing outside in the sun holding a
  spray can.
- **The office views are desktop tables.** Dense, sortable, scannable.
- Every screen responsive, no horizontal scroll on the page body — wide tables scroll
  inside their own container.
- Steps are **locked until their turn**, with the reason visible. Never a dead button
  with no explanation.
- Photos compressed on the device before upload.
- Every destructive or money-moving action confirms first, showing what will happen.

---

## 12. Verification checklist

Tick these when the module is done. Anything unticked is not built, whatever the code
looks like.

### Entry gates
- [x] Uniform photo required before every service, camera only, no gallery
- [x] Service cannot be entered without it
- [ ] Uniform photo appears on the report and on the admin's view
- [x] Each crew member submits his own uniform photo
- [x] First service at a site demands the location, on site
- [x] Location refused when GPS is off, denied, or not accurate enough — with the reason
- [x] Captured location saved to the customer, with who marked it and when
- [x] Later services do not ask again and offer navigation instead

### The service
- [x] Steps run in order and lock until their turn, each showing why
- [ ] Timer runs from "start work" to finish and the elapsed time is stored
- [ ] Before and after photos, compressed on device
- [x] *"What did you find?"* is gone
- [x] Area-wise findings: type an area, type what was done, add another
- [x] Technician notes field sits above the customer signature
- [ ] Customer signature and rating captured on the phone
- [ ] Finish blocked until the required steps are done

### Crew and head
- [x] Head is chosen when technicians are assigned
- [x] Single-technician job sets the head automatically, without asking
- [x] Head can do everything on the service
- [x] Non-head sees only trip and checklist
- [x] Non-head cannot upload photos, record chemicals, enter findings, sign or finish
- [x] The API refuses a non-head, not just the UI

### Chemicals
- [x] `senior_tech` role exists and can issue
- [x] Admin and ops can issue
- [x] Issued stock appears in that technician's profile as in-hand
- [x] Inventory decreases when issued
- [x] Technician records what he used on the service
- [x] Consumption deducts from his holding on finish
- [x] He records what he used; going over his holding is flagged, not blocked
- [x] Unused stock can be returned and reverses cleanly
- [x] Every movement traceable: who took it, who issued it, when, how much, which job
- [x] Admin sees every technician's current holding

### Invoicing
- [x] Upfront contract: no invoice on completion
- [x] Monthly contract: no invoice on completion
- [x] Per-service contract: invoice raised on completion
- [x] Priced from the contract's plan line, not the catalogue
- [x] A visit cannot be invoiced twice

### Payment — per-service only
- [ ] Payment step appears only on per-service contracts
- [ ] UPI QR generated for the exact balance
- [ ] Payment recorded automatically when Razorpay reports capture
- [ ] Cash goes into the collecting technician's wallet
- [ ] Wallet shows in-hand total and every collection behind it
- [ ] Technician can transfer his wallet to the company via Razorpay
- [ ] Wallet clears **only** after admin, ops or accounts confirms receipt
- [ ] Office sees every technician with cash outstanding

### Trips and tracking
- [ ] Trip starts from the service and from a standalone journey
- [ ] Every crew member starts his own trip and his own distance is counted
- [ ] GPS breadcrumbs recorded along the way
- [ ] Distance measured along the path, not a straight line
- [ ] Admin sees who is out, where, and the path taken

### Navigation — the one to be hardest on
- [x] Destination can be a service site, a technician, or a searched place
- [x] Preview shows route, total distance, ETA and the full turn list before starting
- [x] Start navigation opens a full-screen map that follows the technician
- [x] Next-turn banner always visible, with the distance counting down live
- [x] The banner advances by itself when a turn is passed — no tapping
- [ ] Going off-route is detected and re-routes automatically, and says so
- [ ] Re-routing is rate-limited and never fires while stationary
- [x] Instructions are spoken aloud
- [ ] Arrival is detected and offers check-in
- [ ] Breadcrumbs keep recording throughout navigation
- [x] One tap from a service navigates to that customer's saved location
- [ ] **Drive a real route end to end and arrive** — the only test that counts

### Reports
- [ ] Report sent to the customer on finish
- [x] Report sent to admin on finish
- [x] Carries date, time, duration, who did it
- [ ] Carries uniform photo, before/after photos, chemicals, area findings, notes, signature, rating
- [x] Every send logged: what, to whom, when

### Across the board
- [ ] Zoho Books idiom held throughout
- [x] Field screens usable one-handed on a phone
- [x] Office screens dense and scannable on desktop
- [x] Every screen responsive, no page-level horizontal scroll — measured at 390×844 on
      every route in the menu; the field screens also at 1440×900
- [x] No dead buttons — anything disabled says why *on the field screens*. The office
      screens have 23 files with conditional `disabled`; most are transient (`disabled={busy}`
      during a request) and were not audited one by one

### Placement pass (Part K)
- [x] Every screen walked against the six questions in §10.1
- [x] One obvious primary action per screen
- [x] Nothing sitting on a screen it does not belong to
- [x] Screen order matches the order the work is actually done
- [x] No figure stated twice, and none contradicting another
- [x] Defect list written up in `AUDIT.md`, each with a one-line fix
- [x] Every defect either fixed or consciously deferred with a reason

---

## 12.1 The technician's dashboard

Your question was the right one: *what are the things recorded for a technician that
have to be shown here?* The system records exactly four kinds of thing against a person
in the field, and the dashboard is built out of those four and nothing else. No company
totals, no other technician's work.

| What is recorded | Where it lives | What the dashboard shows |
|---|---|---|
| **Cash he collected** | `Payment.by`, `.settled`, `.mode='Cash'` | Wallet in hand, how many collections are waiting to be handed in, and what he took in today |
| **Chemicals issued to him** | `TechStock.qty`, `StockIssue` trail | How many lines he is carrying, and a red count if any has gone negative — used more than he was ever issued |
| **The visits he is on** | `Job.techIds`, `.headTechId`, `Job.exec` | Today, tomorrow, then the rest — each with time, customer, status, whether he leads the crew, and its money |
| **The road he drove** | `Trip.distanceM` along the GPS path | Distance and trip count for the month |

`Job.exec` is the richest of the four, and the parts of it that mean something to *him*
rather than to the office are surfaced: whether he has checked in, whether the work is
started, whether the report has gone out, and the star rating the customer left.

### The screen, top to bottom

1. **A line that says how the day is going** — "2 of 4 done · next is Nithya Dental at
   10:00 AM". The one sentence he would ask a colleague for.
2. **Quick look — three tiles.** Wallet, chemicals, today's count. These are the things
   he is *answerable* for, so they come before the things he has to *do*. Each turns red
   on its own when it needs him: cash in hand, a chemical short.
3. **Money today** — *to collect* against *collected*. Two figures, never the same money
   twice: once a visit has an invoice the balance is the truth, and before that the
   contract rate is the expectation. Only per-service contracts appear; everything else
   is billed from the office and is not his to chase.
4. **Needs you** — only ever things he can act on himself. A chemical short, a finished
   service whose report has not gone out, cash waiting to be handed in.
5. **Today, then Tomorrow, then Coming up** — each a card of visits. Every row carries
   its own money: *₹9,440 to collect*, or *₹9,440 collected* with a tick once it is in,
   or *invoice raised when you finish* before there is anything to collect.
6. **Your month so far** — services done, average customer rating, hours on site,
   kilometres driven. All four are his own recorded numbers, and they are the ones a
   technician is actually judged on.

Served by one endpoint, `GET /techdash`, because the first thing a phone loses on a bad
connection is the fourth request. The office can pass `?userId=` to read anyone's — the
same screen becomes the answer to "how is Karthik doing" on the team page.

**Verified on screen**, not just in the payload: 390×844 and 1440×900, no page overflow,
no off-viewport element, the bottom bar carrying Home · Services · Trip · Training ·
Wallet. Live figures for Karthik as it stands — ₹9,440 to collect today, 2 chemical lines
with 1 short, 4 services done this month at 4.8 stars, and two things in *Needs you*:
a Deltamethrin shortfall and a finished job whose report has not gone out.

---

## 13. Decisions

Settled before Part B. These are constraints on everything that follows.

| Question | Decision | What it means |
|---|---|---|
| **Offline** | **Online only** | The wizard needs a connection at each step. No queue, no sync engine. Every screen must therefore fail *loudly and safely* — never lose work already entered when a request fails. |
| **GPS accuracy** | **50 m** | A site mark is rejected above 50 m accuracy, with the reason shown. Configurable in Settings. |
| **Chemical shortfall** | **Allow, flag** | He records what he actually used. Any excess over his holding is flagged for the office to reconcile; holdings may go negative until they do. |
| **Trip end** | **Auto-stop on check-in, manual stop too** | A service trip ends when he checks in. A standalone trip he stops himself. |

### 13.1 What "online only" obliges us to do

Choosing not to build offline support does not mean ignoring the network — it means
being honest about it. Every step in Parts C and D must:

- **Never clear the form on a failed request.** What he typed stays on screen.
- **Say what happened** — "no connection" is a different message from "server refused".
- **Offer retry** on the spot, without re-entering anything.
- **Never double-submit** if he taps twice on a slow connection.

A technician who loses a signature he already collected will not use the app again.

---

## 14. Remaining open questions

Not blocking the current parts.

1. **Uniform photo review** — does anyone check them, or are they kept for when a
   complaint arrives? A review queue is a different build from an archive. Assumed
   archive-only until told otherwise.
2. **Ola Maps plan** — which product and key type. Not blocking: the server already holds
   a working key and `/trips/route` returns real routes, so Part I builds against that.
