# PestOps — Pest Control Operations Platform

An interactive, click-through demo of a complete operations system for a pest control
business: lead → follow-up / inspection → quotation → AMC contract → scheduled visits → technician execution
with photo proof → invoice → payment receipt.

Built for the requirements captured on the customer call: replace the manual quotation /
Zoho Books / WhatsApp workflow with one system, covering **all six user roles**.

---

## Opening it

**Just double-click `index.html`.** No build step, no install, no internet needed.
Works in Chrome, Safari, Edge and Firefox, on desktop and on a phone.

To show it on a phone on the same Wi-Fi, serve the folder instead:

```bash
cd pestops
python3 -m http.server 8000
# then open http://<your-mac-ip>:8000 on the phone
```

---

## The six roles

Pick any role on the landing screen — no password. Each one opens only the screens
that person actually uses.

| Role | Who | What they get |
|---|---|---|
| **Administrator** | Rajesh Kumar, Founder | Everything — business, money, people, settings |
| **Operations Manager** | Priya Sharma | Dispatch board, scheduling, technicians, audits, inventory |
| **Sales Executive** | Arun Prakash | Lead pipeline, quotations, customer onboarding |
| **Field Technician** | Karthik / Suresh / Vignesh | Today's Work, service execution, photo proof, stock |
| **Accounts & Billing** | Deepa Nair | Invoices, receipts, receivables ageing, reminders |
| **Customer Portal** | Meera Krishnan (Sri Krishna Apartments) | Contracts, visit history, reports, invoices, service requests |

You can jump straight to a role with a URL, which is handy when demoing:

```
app.html?as=U04#/my-work      → open as technician Karthik
app.html?role=client#/portal  → open the client portal
```

---

## How the call requirements map to the build

| What the customer said | Where it lives |
|---|---|
| "What services are you providing… we give them all manually" | **Service Catalogue** — 15 services with rate, duration, warranty, chemicals, a default service interval, an on-site checklist and a PDF information sheet |
| "We send quotation form" | **Quotations** — builder with live GST, printable A4 document, and a WhatsApp share that bundles the quotation PDF with every quoted service's information sheet plus an accept / decline link |
| "We send the bills in Zoho Books" | **Invoices** — GST tax invoice, CGST/SGST split, amount in words, SAC code |
| "We also do payment receipts" | **Payments** — record against invoice, auto receipt, ageing buckets |
| "We collect leads" | **Leads** — seven-stage pipeline (New Lead → Follow-up → Inspection → Quoted → Contract → Won / Lost) driven by the call-outcome SOP, phone-number lookup on capture, branch and owner on every lead, and every quotation for that lead on the card |
| Branches, and staff who cover more than one | **Master Data → Branches** — full branch records with the localities each one covers; every team member ticks the branches they cover |
| "Who should this lead go to?" | **Leads → Owner** — the locality sets the branch from the areas each branch covers; the lead is then assigned to a salesperson (never a technician) |
| Employee files | **Team** — photo, Aadhaar / ID number, date of birth, blood group, address, employment type, emergency contacts and scanned documents |
| "Put a contract on how many services are available on the date" | **AMC Contracts** — a **service plan**: every service on its own interval, day, time and technician. Same-day services merge into one trip; every dated visit is generated from the plan and nothing else |
| "Give it to technicians for AMC maintenance management" | **Dispatch** — assign one technician to the whole contract or a single visit |
| "Change it into a project and assign it to whom you want, track that assignment" | **Services** — every visit is a trackable service with an owner and a status |
| "Today's work… current service, current work time" | **Technician app** — Today's Work with a live on-site timer |
| "Go to that location, click work start, finish the service, upload a picture" | **Service execution** — travel → GPS check-in → before photos → start → chemicals → findings → after photos → signature → finish |
| "Trackable for all customers" | **Customer Portal** — visit history with before/after photos and ratings |
| "We have inventory and audits in place" | **Inventory** (stock, batches, expiry, CIB&RC reg.) and **Audits** (scored checklists) |
| "We send through WhatsApp till now" | WhatsApp actions throughout + **Settings → Notifications** with 8 editable message templates and live previews |

---

## Suggested demo script (about 10 minutes)

Run it in this order — each step feeds the next, so the customer sees one continuous thread.

1. **Sales Executive → Customers.** Customers sit at the top of Sales because the account
   comes first. **Add customer** creates it; **Enquiry** on any customer card opens the lead
   form with name, phone, email, area, property type, branch and owner already filled in,
   and the saved lead stays linked to that account. The same button sits on the customer's
   own page as **New enquiry**.
2. **Leads → New lead** for someone not on file yet. Type a phone number we already have — the name,
   email, area and property type fill in from the existing record. Tick a service (optional).
   The card lands in the *New Lead* column, or in *Follow-up* if you set a follow-up date.
   Typing the **area** sets the branch on its own, from the localities each branch covers
   in Master Data. **Assign to** is the salesperson who will chase the lead — capture it
   for yourself or hand it to someone else; technicians are never in that list, they are
   picked separately when a site inspection is booked. A returning customer keeps the
   branch and salesperson they had last time.
3. **Open the lead.** The record opens as two facing pages. On the left the customer: the
   call-outcome buttons, every detail captured (contact, property type, location, source,
   services required, notes) and the activity trail. On the right how it is being worked:
   who owns it, what is booked next, every quotation raised, and earlier leads from the
   same customer. Each live lead asks *What happened on the call?* with three buttons:
   - **Interested** moves the lead exactly one step, and the button says which step:
     from New Lead or Follow-up it offers *straight to quotation* or *book a site visit*;
     from **Inspection** it reads *Quote it* and raises the quotation (→ Quoted); from
     **Quoted** it reads *Quote accepted* (→ Contract); from **Contract** it reads
     *Contract signed* (→ Won).
   - **Not answered** → pick the call-back date and time — moves to Follow-up
   - **Not interested** → type why (required) — moves to Lost, and the reason is kept
     on the lead
   The stage is only ever moved by these three buttons, so it always matches something
   that actually happened. Every action is written to the lead's activity trail.
4. **Quotations live on the lead card.** The *Quotations* section lists every quote raised
   against that lead — number, title, status, date, value, and the running total. **New**
   opens the builder, and saving drops you straight back on the lead card with the new
   quote in the list. Clicking a row opens the printable quotation.
5. **Quotations → New quotation.** Raise it against that lead, choose *AMC — Monthly, 12 months*,
   watch the GST total update live. Then **Send to customer**: the share screen lists the
   quotation PDF plus the information sheet for every service on the quote, fills the
   WhatsApp message from the template, and gives you an accept / decline link for the
   customer. Save the files, tap **Open WhatsApp**, attach them in the chat.
6. Open the accept / decline link yourself to see what the customer sees — the service
   sheets, the full **printable document** with company header, GSTIN, terms and amount in
   words, and two buttons. Accepting there marks the quotation approved and moves the lead
   to *Contract*, with nobody keying anything in.
7. Press **Generate AMC**. Pick a technician and duration — PestOps previews the visit dates,
   then creates the contract **and all 12 dated visits** in one action.
   *This is the single biggest time-saver versus the current process.*
8. **Operations Manager → Dashboard.** The new visits appear on the dispatch board.
   Open an unassigned service and assign a technician — the WhatsApp notification fires.
9. **Switch role → Field Technician (Karthik).** Today's Work shows his 5 services, one already
   running with a live timer. Open a scheduled service and walk the steps:
   *I'm on my way → Check in with GPS → Before photo → Start work → add a chemical →
   tick what you found → After photo → customer signs → Finish service.*
   Note the stock deduction and the report going to the customer.
10. **Customer Portal (Meera).** The same visit is now in her Service History with the
   before/after photos, findings and the technician's name.
11. **Accounts & Billing.** Open the contract, **Raise invoice**, then **Record payment** —
   a receipt is issued and the receivables ageing updates.
12. **Admin → Team → Add member.** The full employee record: photo, Aadhaar / ID number,
   date of birth, blood group, address, employment type, applicator licence, emergency
   contacts and scanned documents. Branches are a required tick-list, so one person can
   cover Adyar and OMR at once. The team list then filters by branch.
13. **Master Data.** Sits at the top of the sidebar, above Sales, and holds the reference
   data the rest of the system is built on: **Branches & Lists** (branch records with
   address, GSTIN, manager and the localities each branch covers, plus the editable
   lead-source and property-type lists) and the **Service Catalogue**.
   The areas on a branch are what routes a lead: type "Ambattur" on lead capture and the
   branch switches to Anna Nagar and the owner to the person posted there with the
   lightest pipeline. Pick a branch that does not match the locality and the screen says
   so and offers to move it.
14. **Admin → Reports & Settings.** Revenue trends, technician productivity, pest trends,
   the role permission matrix and the WhatsApp automation templates.

---

## How the schedule is built

The whole chain lives on the lead card. Once a quotation is accepted the lead moves to
**Contract**, and the *AMC contract* section on the lead turns into the button that generates
it — then into the contract itself, with **Edit schedule** opening the plan editor without
leaving the lead. The lead is only **Won** when someone confirms the contract is signed.

Each contract carries a **plan** — one row per service, with its own interval, day of the
month, time and technician. That plan is the only thing that creates AMC visits.

- **The quotation says it per line.** There is no frequency dropdown and no single
  contract length. Under each line item you say how many times that service is delivered
  and over how many months; the gap between visits is arithmetic, shown live as you type.
  Four visits over one month reads *weekly, every 8 days*; four over two months reads
  *fortnightly, every 15 days* — two in each month.
- **Intervals come from the catalogue.** Every service has a default frequency; a contract
  inherits it and can override it per line.
- **A quotation already knows the intervals.** Each AMC line's quantity is the number of
  visits that service was priced for, so *Generate AMC* carries them straight through
  instead of flattening everything to one frequency.
- **Same-day services merge into one trip.** Duration is the sum, technicians are the union,
  and the per-service breakdown stays inside the visit. Fresh Basket's 28 service-visits
  become 12 actual trips, four of them 160 minutes instead of 120.
- **Sundays are skipped** — a visit landing on one moves to the next working day and says so.
- **Nothing is written until you press the button.** The plan editor previews the dates and
  shows a diff first: *"4 visits updated · 6 completed visits left untouched"*.
- **Completed and in-progress visits are frozen.** Regenerating a plan can never erase work
  that already has photos, chemicals and a customer signature against it.
- Every generated service is stamped with `planRef`, so the system can always answer *why does
  this date exist?* — and can regenerate without duplicating or orphaning visits.

Visits a month or more apart keep the calendar rhythm and the day-of-month anchor;
anything faster is spread evenly in days, because no day-of-month rule can describe an
eight-day gap. The two paths meet at 28 days, which is why every schedule built under the
old month-stepping engine regenerates identically.

Only the fixed day-of-month rule is implemented. `dayRule` is a string, so *nth weekday*
(`nth:2:SAT`) and *rolling gap* (`gap:45`) can be added later without a schema change.

---

## Notes

- **Everything is live.** Anything you create is saved in the browser and flows through
  the rest of the system — the numbers on the dashboards are computed, not hard-coded.
- **Nothing leaves the machine.** Data lives in `localStorage` only.
- **Reset any time** from the landing page, or *Settings → Demo & data → Reset*.
- **Dates are relative to today**, so the demo never looks stale.
- Sharing a quotation gives you two routes, because WhatsApp will not allow both at once:
  **Open chat** goes straight to the number you typed with the message already written and
  no contact picker, but a link cannot carry a file — so the PDFs are saved to your
  downloads first and you add them with the paperclip (or leave them out, since the
  accept / decline link in the message opens the full quotation anyway). **Share with files**
  attaches every PDF automatically but WhatsApp insists you pick the chat yourself.
  Sending to a number *with* the files attached, in one step, needs the WhatsApp Business API.
- Automatic reminders, the payment gateway and SMS are still **simulated** — they show a
  toast describing exactly what the production system would send.
- Uploaded PDFs and photos live in `localStorage`, which browsers cap at about 5 MB. Sheets
  are limited to 1.5 MB each and an upload is refused when the budget would be exceeded.
- Photo capture uses the real camera on a phone; on desktop use the **Sample** tile.

---

## Structure

```
index.html              landing / role picker
app.html                app shell (sidebar, topbar, mobile tab bar)
assets/css/
  base.css              design tokens, reset, layout, breakpoints
  components.css        buttons, cards, tables, forms, modals, toasts
  pages.css             login, kanban, calendar, documents, technician flow, print
assets/js/
  icons.js              inline SVG icon set
  data.js               seed business data (dates generated relative to today)
  store.js              persistence, derived figures, formatting, business rules
  ui.js                 modals, toasts, charts, small renderers
  comp.js               shared render components
  app.js                navigation config, router, chrome
  views/                one file per module (17, including masterdata.js)
```

Roughly 6,500 lines. No frameworks, no build tooling, no external requests.
