# Invoicing a contract by the services actually delivered

Your brief: raising an invoice from a contract should show **the services in that
contract** — done, in progress, or still to come — and let you tick the ones this invoice
covers. A service already on an invoice drops off the list. The invoice then names those
services and adds them up. And once a service is invoiced, its own page — the
technician's and the office's — should say so, without saying anything about payment.

You asked me to check through it first. I did, and what I found argues for your instinct
more strongly than you probably expected.

---

## 1. What is wrong today

Contract invoices are raised off a **billing plan**: a sequence of installments numbered
`1 of 12`, `2 of 12`, and so on. The invoice carries one line — *"Monthly installment 8 of
12 — AMC-2026-01"* — and one amount. Nothing on it refers to a service. Nothing links it
to a visit. The two halves of the business never meet.

That is not just inelegant. It is already producing wrong numbers.

### AMC-2026-01 has been invoiced ₹1,12,983 against a ₹66,000 contract

```
INV-3341  Quarterly billing              manual     ₹13,983
INV-3313  Quarter 2                      manual     ₹16,500
INV-3327  Quarterly installment 1 of 4              ₹16,500
INV-3328  Quarterly installment 2 of 4              ₹16,500
INV-3329  Quarterly installment 3 of 4              ₹16,500
INV-3348  Monthly installment 4 of 12               ₹5,500
INV-3349  Monthly installment 5 of 12               ₹5,500
INV-3350  Monthly installment 6 of 12               ₹5,500
INV-3351  Monthly installment 7 of 12               ₹5,500
INV-3355  Monthly installment 8 of 12               ₹5,500
INV-3356  Monthly installment 9 of 12               ₹5,500
                                          raised ₹1,12,983
                                   contract value    ₹66,000
```

**How.** Already-raised installments are recognised by their sequence number. The
sequence is derived from the contract's *current* billing label. Someone changed that
label from Quarterly to Monthly, and the sequence re-based: quarters 1–3 had been raised,
but the plan now counted in months, so months 4 onwards looked unraised and were raised
again. Three quarters (₹49,500) and six months (₹33,000) now bill overlapping time, and
two hand-made invoices sit on top.

Every other interval contract is quietly exposed to the same fault:

| Contract | Value | Raised | Visits | Per-service rates |
|---|---|---|---|---|
| AMC-2026-01 | ₹66,000 | **₹1,12,983** | 12 | none |
| AMC-2026-03 | ₹1,86,000 | ₹1,08,500 | 12 | none |
| AMC-2026-04 | ₹1,23,334 | ₹59,609 | 10 | none |
| AMC-2026-02 | ₹23,128 | ₹11,564 | 4 | none |

**A sequence number is a poor thing to hang money on.** It is derived, it is unstable, and
nothing in the world corresponds to it. A *service* is stable: it has a date, a
technician, a signature and a customer who watched it happen. Bill that instead and the
whole class of fault disappears — because a service can be marked billed, once, forever.

---

## 2. The design

### One rule

> **A service is billed once.** An invoice line is a service. A service that is already on
> an invoice cannot be put on another.

Everything else follows from that sentence.

### Pricing a service

This already exists and needs no decision — `visitAmount()` in `packages/shared`:

1. If the contract's plan lines carry rates, a visit costs the sum of the rates of the
   services it delivers.
2. If they do not — and **no interval contract in your data does** — the visit costs
   `contract value ÷ total visits`.

For AMC-2026-01 that is ₹66,000 ÷ 12 = **₹5,500 a visit**, which is exactly the monthly
installment being raised today. Nothing about the money changes. What changes is that
twelve visits now add up to ₹66,000 and **cannot add up to more**, because there are only
twelve of them and each can be billed once.

That is the property installment billing lacks, and it is the whole point.

### The checklist

Raising from a contract shows every service on it that has not been invoiced:

```
AMC-2026-01 · Sri Krishna Apartments            8 of 12 visits done

  ☑  Visit 9   16 Sep 2026   General Pest Control              ₹5,500
     scheduled · Karthik R

  ☑  Visit 10  16 Oct 2026   General Pest Control              ₹5,500
     scheduled · not yet assigned

  ☐  Visit 11  16 Nov 2026   General Pest Control              ₹5,500
     scheduled

  ☐  Visit 12  16 Dec 2026   GPC + Snake Repellent             ₹5,500
     scheduled

  Visits 1–8 are already invoiced.                      2 selected · ₹11,000 + GST
```

Rules, in the order they matter:

* **Invoiced services do not appear.** Not greyed out — gone. They are settled business.
  This is your *"if the invoice is already created, there is no need for that checklist"*.
* **Paid does not need its own rule.** A paid service is by definition an invoiced
  service, so it is already off the list. One rule covers both things you asked for.
* **Status is shown, not enforced.** Completed, in progress and scheduled all appear and
  all can be ticked, because AMCs are routinely billed in advance. The status is there so
  you can *see* what you are charging for — *"already done, going to be done, or
  scheduled"*.
* **The current cycle is pre-ticked.** The visits falling in the period being billed come
  ticked; anything older that was never invoiced appears unticked above them, so a visit
  that slipped a month is visible rather than lost.
* **The total is the sum of what is ticked**, plus GST by the contract's place of supply.

### The invoice

The lines become the services. Where today an invoice reads:

```
1   Monthly installment 8 of 12 — AMC-2026-01      1   ₹5,500   ₹5,500
```

it will read:

```
1   General Pest Control — visit 9 of 12               1   ₹5,500   ₹5,500
    16 Sep 2026 · JOB-908
2   General Pest Control — visit 10 of 12              1   ₹5,500   ₹5,500
    16 Oct 2026 · JOB-909
```

The customer can see what they are paying for. So can you, in a year, when they ask.

### The mark on the service

Each job gains one field: the invoice it was billed on.

```
Job.invoiceId   ""  until billed, then "INV-3357"
```

On the service page — the technician's and the office's — that shows as a quiet line:

> **Invoiced** · INV-3357 · 20 Aug 2026

and nothing else. **No amount, no paid-or-not**, exactly as you said. A technician who
knows the visit is billed knows enough; whether the customer has paid is not his business
and showing it would only invite him to chase it.

For the office the same line links through to the invoice.

> **A note on per-service contracts.** They already work this way — a completed visit
> raises its own invoice at that service's rate, and `Invoice.jobId` records which. That
> link becomes `Job.invoiceId` too, so *"has this been billed"* is one question with one
> answer everywhere, whatever the billing mode.

---

## 3. What happens to installments

This is the part I want your decision on, because there are two honest answers.

**The sequence stops driving what gets billed.** That much is settled — it is the cause of
the ₹1,12,983. But the *cadence* is still useful: a quarterly contract should still prompt
you every quarter. So the plan is that the billing plan becomes a **reminder**, not a
ledger: it decides *when* the invoice is due and what the period is called, and the
services decide *what is on it and what it costs*.

`Invoice.seq` stays, and stays unique per contract, so a period cannot be raised twice.
But nothing is billed because a sequence number was free — it is billed because a service
was delivered and had not been charged for.

---

## 4. Decisions taken

Built on the recommendations in this document. **No existing invoice was touched** — the
over-billing on those four contracts is exactly as it was, waiting on you.

| Question | Taken as | Why |
|---|---|---|
| The over-invoiced contracts | **Left alone** | Money is yours to decide. The contract page now shows the drift so it is visible while you think. |
| Cancelling releases services | **Yes** | Otherwise one mistaken invoice permanently un-bills work that was done. |
| Billing before the service happens | **Allowed** | AMCs are normally billed ahead, and you listed *"going to be done"*. |

### One thing that had to change beyond the plan

`raiseDueBilling()` ran on **every read of the invoice list** and raised any installment
whose due date had passed. That is what produced the six monthly installments in one
sweep, and what raised INV-3356 the moment the API restarted.

It now runs for **upfront contracts only** — one installment, due at signing, nothing to
choose between and nothing that can drift. Interval contracts are billed by ticking the
services delivered. **Nothing bills itself by counting any more, because counting is what
went wrong.**

---

## 4.1 Still to decide

**1. What do we do about the four contracts already over-invoiced?**
AMC-2026-01 is ₹46,983 past its own value. The options:

* **Leave it and start clean.** New invoices are service-based; the existing ones stay as
  they are. Simplest, and the history stays untouched — but the contract still shows more
  billed than it is worth.
* **Cancel the duplicates.** The three quarterly installments (₹49,500) and the six
  monthly ones (₹33,000) bill overlapping time. Cancelling one set brings it back near its
  value. This is a money decision and yours alone — I will not touch invoices without you
  saying which.
* **Credit note.** Keep everything, issue a credit for the overlap. Most correct
  accounting, most work, and we have no credit-note concept yet.

That is the only open question left.

---

## 5. Build order

| Part | What |
|---|---|
| **A** | `Job.invoiceId`, and backfill it from the per-visit invoices that already carry `jobId` |
| **B** | `GET /contracts/:id/billable` — the un-invoiced services, priced, with status and cycle flag |
| **C** | The checklist in the New-invoice dialog, replacing "next installment + GST" |
| **D** | `POST /invoices/from-contract/:id` takes job ids; lines are services; jobs get stamped |
| **E** | The invoice document prints the service, its visit number and its date |
| **F** | "Invoiced · INV-xxxx" on the service page, both roles, no payment state |
| **G** | Cancelling an invoice releases its services |
| **H** | The contract page shows billed against value, so drift is visible before it grows |

---

## 6. Checklist

### The list
- [x] Raising from a contract shows its services, not an installment
- [x] Each row shows visit number, date, services, status and price
- [x] Services already on an invoice do not appear
- [x] The services in the period being billed come pre-ticked
- [x] An older un-invoiced service appears too, and is visible as overdue billing
- [x] The running total updates as lines are ticked, GST by place of supply
- [x] A contract with nothing left to bill says so plainly

### The invoice
- [x] One line per service, naming the service and its visit number
- [x] The line carries the date and the job reference
- [x] The total is the sum of the selected services
- [x] The document prints them the same way

### The mark
- [x] Every billed job records its invoice
- [x] The technician's service page shows "Invoiced", with no amount and no paid state
- [x] The office service page shows the same and links to the invoice
- [x] Per-service contracts stamp the same field when their visit invoice is raised
- [x] Cancelling an invoice releases its services back to the checklist

### Integrity
- [x] A service cannot appear on two invoices
- [x] Twelve visits on a ₹66,000 contract cannot bill more than ₹66,000
- [x] The contract page shows billed-against-value
- [x] Changing a contract's billing label can no longer re-bill a period
