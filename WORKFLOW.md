# One Deal, Three Moments

**Brainstorm — unifying the quotation, the AMC contract and the one-time service form.**

You described the workflow you want. This document does three things: writes that
workflow down as the canonical model, shows exactly where the code disagrees with it,
and proposes the fix. Read the mismatch table in §3 first if you only read one thing —
it is the concrete evidence behind "a lot of features are roaming here and there".

**Status: built.** §1–§4 are the diagnosis, §5–§8 are your decisions and what shipped
against them.

---

## 1. The workflow you described

Everything starts from the **Customer**. Once a customer exists, three doors open, and
you may take any of them at any time.

```
                          ┌──────────────┐
                          │   CUSTOMER   │   created first, always
                          └──────┬───────┘
             ┌───────────────────┼───────────────────┐
             ▼                   ▼                   ▼
      ┌────────────┐      ┌────────────┐      ┌────────────┐
      │  MOVE TO   │      │  MOVE TO   │      │  MOVE TO   │
      │   LEAD     │      │ QUOTATION  │      │  CONTRACT  │
      └─────┬──────┘      └─────┬──────┘      └─────┬──────┘
            │                   │                   │
   follows the lead        skip the pipeline   skip both — ask
   protocol below          — quote directly    AMC or one-time
            │                   │                   │
            ▼                   │                   │
   ┌─────────────────┐          │                   │
   │ not picked up   │──────────┼───► FOLLOW-UP     │
   │ interested      │          │                   │
   └────────┬────────┘          │                   │
       ┌────┴────┐              │                   │
       ▼         ▼              │                   │
 INSPECTION   QUOTED            │                   │
 (visit the      │              │                   │
  premises)      │              │                   │
       └─────────┴──────────────┘                   │
                 │                                  │
                 ▼                                  │
          ┌─────────────┐                           │
          │  QUOTATION  │  AMC or one-time is       │
          │             │  decided HERE             │
          └──────┬──────┘                           │
                 │ customer approves                │
                 │ "Move to contract"               │
                 ▼                                  ▼
          ┌────────────────────────────────────────────┐
          │                 CONTRACT                    │
          │  everything from the quotation carries over │
          │  AMC → period + visit schedule              │
          │  One-time → one date, from-time to to-time  │
          └──────────────────┬─────────────────────────┘
                             ▼
                            WON
```

### The rules inside that picture

- **The customer comes first.** Lead, quotation and contract all hang off a customer.
- **The lead protocol** is: not picked up → *Follow-up*. Interested → one of two roads,
  *Inspection* (go and see the premises) or *Quoted* (price it now).
- **AMC vs one-time is decided once**, when the quotation is created. The contract
  inherits that decision — it must never ask again.
- **Whatever is on the quotation passes to the contract.** Nothing is retyped.
- **A one-time contract needs a date and a time window** — from *this* time to *that*
  time — not just a start date.
- **Skipping is allowed.** Customer → Quotation with no lead. Customer → Contract with
  neither.

---

## 2. What the code already does, and where it departs

| Your rule | Status today |
|---|---|
| Customer page offers Lead / Quotation / Contract | ✅ all three buttons exist and work |
| Contract asks AMC or one-time when entered directly | ✅ `choose()` puts up the two options |
| Lead protocol: follow-up, inspection, quoted, contract, won | ✅ all seven stages exist |
| Interested → inspection **or** quotation | ✅ the two-road split is built |
| Inspection schedules a visit at the premises | ✅ date, time and who visits |
| AMC vs one-time decided at quotation time | ✅ **fixed** — the contract inherits it, never re-asks |
| Quotation carries over to the contract | ✅ **fixed** — every field, see §6 |
| One-time needs from-time to to-time | ✅ **fixed** — a real window, and it sets the job duration |
| "Move to contract" on the quotation | ✅ exists |
| Contract moves to Won | ✅ when a lead exists; direct deals live in the contract, per your decision |

---

## 3. The field mismatch — the evidence

Three forms exist today: the **quotation builder**, and the work-order page in its **AMC**
and **one-time** shapes. They should be the same document. They are not.

### Fields on one form and not the other

| Field | Quotation | Contract | What it costs you |
|---|:---:|:---:|---|
| **Discount** | ✅ | ❌ | A discount agreed on the quotation has no line on the contract. The total is right; the customer cannot see why |
| **Customer notes** | ✅ | ❌ | Timing restrictions, chemical preferences, access instructions — all dropped |
| **Reference no.** (their PO) | ✅ | ❌ | The customer's own reference disappears from the agreement |
| **Place of supply** | ✅ | ❌ | Contract derives it from the customer and cannot override — GST can be wrong for a site in another state |
| **Digital signatures** | ❌ | ✅ | A quotation cannot be signed, even when the customer signs in person |
| **Appointment schedule** | ❌ | ✅ | The quotation cannot say *when*, only how many |
| **Employees needed** | ❌ | ✅ | Crew size is invisible when pricing |
| **Billing cycle** | in a modal | hard-coded `Quarterly` | Two different places, one of them not a choice at all |
| **Valid till** | ✅ | n/a | Correct — a proposal expires, an agreement does not |

### Same idea, two different controls

| Idea | Quotation | Contract |
|---|---|---|
| Choosing the customer | Searchable box over **customers *and* open leads** | Plain dropdown of **customers only** |
| Line scheduling | Per line: `visits` + `months` | Contract-level period + per line `startAt`, `slot`, `crew` |
| Terms & conditions | Pulled from **Settings → company terms** | A **second hard-coded list** inside `amcform.js:15` |

That last row is the clearest symptom: **you have two different sets of terms and
conditions**, and which one the customer receives depends on which screen produced the
document. Editing your terms in Settings changes the quotation and not the contract.

### The per-line consequence

The quotation lets each service run for its own number of months. The contract form has
one period for every line. So a quotation reading *"General Pest Control 12 months,
Termite 6 months"* becomes a contract that shows a single 12-month period. The engine
still honours the per-line months underneath — but the form cannot show or edit them,
so what you see is not what was agreed.

---

## 4. The root cause

> **A quotation and a contract are the same document at two moments in its life.**

Same customer, same branch, same salesperson, same subject, same service lines, same
quantities, same rates, same discount, same tax, same terms. What genuinely differs is
small:

| | Proposal (quotation) | Agreement (contract) |
|---|---|---|
| Expires on a date | ✅ | — |
| Signed by both parties | — | ✅ |
| Produces dated visits | — | ✅ |
| Number series | `QT-` | `AMC-` / `SRV-` |
| Status words | draft · sent · approved | active · expiring · expired |

Everything else is shared. But the two were written as separate screens by separate
passes of work, so they drifted — and each new pass added a field to one and not the
other. That is the "roaming" you are describing, and it will keep happening as long as
there are two forms.

---

## 5. Your decisions

Three questions were open. You answered them, and they shaped what got built.

| Question | Your answer | What it means |
|---|---|---|
| One form for AMC and one-time, or two? | **Genuinely two different products** | They stay two forms. The unification runs along the *proposal → agreement* axis only, never across AMC and one-time |
| Won for direct deals? | **No funnel for them** — managed in the contract itself, invoiced from there | *Won* stays a lead stage. Nothing auto-creates a lead. A direct contract's own life is Active → Expiring → Expired |
| Should a quotation be signable? | **Yes** | The customer can sign on the spot, and the signature carries into the contract |

So the shape is: **the quotation and the contract share one field list**, AMC and one-time stay
distinct products inside the agreement, and the pipeline is optional rather than universal.

---

## 6. What was built

### The field list is now the same on both documents

| Field | Before | Now |
|---|---|---|
| Discount | quotation only | both — taken off before tax on both |
| Customer notes | quotation only | both — printed on the contract, visible to the technician |
| Reference no. | quotation only | both |
| Place of supply | quotation only | both — the contract can override the customer's state |
| Digital signatures | contract only | both — optional on the quotation, required on the contract |
| Terms & conditions | two different lists | one list, from Settings |

### Terms come from one place

`amcform.js` carried its own hard-coded list, so editing your terms in Settings changed the
quotation and not the contract. It now reads the same `company.terms` the quotation does. The
hard-coded list survives only as a floor for a brand-new demo database.

### Signature capture is one implementation

`C.sigBoxes()` and `C.sigMount()` in `comp.js` — the markup and the canvas capture, written
once and used by both documents. Signing a quotation and signing a contract now behave
identically, and a signed document reopened for editing keeps its ink instead of losing it.

### AMC or one-time is asked once

A quotation already knows which it is. `choose()` now reads `q.mode` and goes straight to the
right form instead of putting the question up a second time. The two-option card only appears
when there is genuinely no answer yet — the direct Customer → Contract path.

### The one-time booking has a real time window

*From* and *to*, not just a start time. The window is what the job's duration is set from, so
a 09:00–13:30 booking takes 270 minutes off the technician's day rather than an assumed two hours.

### Per-line periods survive the crossing

A quotation reading *"General Pest Control 12 months, Termite 6 months"* used to become a
contract showing one 12-month period. Each contract line now carries its own **Runs for**
value, pre-filled from the quotation and editable, and the schedule below it lists the dates
that value actually produces.

---

## 7. Two bugs found while verifying

**The one-time job dropped services past the second.** `serviceIds.slice(0, 2)` — the
truncation already removed from the scheduling engine, reintroduced when the one-time path
hand-rolled its own job creation. A three-service one-time contract produced a job listing two.
Fixed, and confirmed: 3 services in, 3 services out.

**GST never actually split.** `taxSplit()` computed the halves correctly, but the `taxRows()`
helper that every screen renders from ignored them — it branched on *is this place inside India*
rather than *is this the home state*, and returned a single combined `GST 18%` line for every
Indian address. The calculation had been fixed earlier; the rendering never was. Because all six
screens (quotation builder, quotation document, contract, invoice, customer portal, PDF) go
through `taxRows`, one fix corrected all of them.

Verified on the contract form:

```
home state = Tamil Nadu
Tamil Nadu → Subtotal ₹12,600 · CGST 9% ₹1,134 + SGST 9% ₹1,134 · Total ₹14,868
Karnataka  → Subtotal ₹12,600 · IGST 18% ₹2,268                  · Total ₹14,868
```

This is statutory Indian GST: supply *within* the supplier's own state splits into CGST + SGST,
supply to *another* state is a single IGST line.

---

## 8. Verified end to end

A quotation with every field populated, carried into a contract:

```
asked AMC-or-onetime again : false
reference no.              : PO-4417
place of supply            : Karnataka
discount                   : 5000
customer notes             : Do not spray near the aquarium.
per-line months            : [12, 6]      <- the 6-month line stayed 6
terms                      : from the quotation
signature pads             : 2
```

Then created:

```
value        = 8260        (12,000 − 5,000 discount = 7,000, +18% = 8,260)
lead stage   = won
lead.contractId = AMC-2026-09
job serviceIds = 3         (was capped at 2)
job window   = 09:00 to 13:30 = 270 minutes
```

All twelve screens render with **zero console errors**.

---

## 9. Still open, from the earlier audit

None of these were part of this pass:

1. **Collapse the menu** — 16 items to 11. AMC and One-time become tabs on Contracts;
   Schedule becomes a list ⇄ calendar toggle on Services. *(Note: you have said AMC and
   one-time are different products, so this one needs rethinking — tabs may be wrong for you.)*
2. **One owner for the lead stage** — eleven scattered writers become one `setLeadStage()`.
   The contract-versus-won contradiction is now resolved, but the eleven writers remain.
3. **One creation function per record** — the dead `newContract()` in `contracts.js:304`, and
   the two customer stubs that create customers without a GST treatment or billing address.
4. **The `#/jobs` screen is in no menu**, yet three back-links point at it.
