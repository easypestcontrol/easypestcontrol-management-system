# Purchasing — vendors, purchase orders, and the one door into stock

The brief, in your words: buy chemicals in grams, millilitres, litres or packets; keep a
list of vendors and raise an order against one; a purchase order that reads like a
quotation or an invoice; mark it **received** and have stock appear in inventory by
itself; stock falls when chemicals are issued to a technician. And the rule that makes
all of it hold together —

> *Without the purchase order we won't be able to add our product in the inventory.*

That one sentence is the whole design. Everything below follows from it.

---

## 1. Why that rule matters more than it looks

Today inventory has an **Add item** button and a **Record stock purchase** dialog. Anyone
in admin or ops can type "5000" into a box and the store now believes it has five
kilograms of Deltamethrin. Nothing says where it came from, what it cost, or who sold it.

Close that door and three things become true at once, for free:

1. **Every gram in the store has a paper trail** — a vendor, a date, a rate, a document
   number. That is the difference between an inventory and a guess.
2. **Stock value becomes real.** You cannot cost a service without knowing what the
   chemical cost, and you cannot know that unless purchases carry rates.
3. **The ledger closes.** Stock in = received purchase orders. Stock out = issued to
   technicians. Two doors, both watched. Any discrepancy is now a question with an
   answer instead of a shrug.

The cost of the rule is that adding an item takes an extra step. That is the right trade
— it is a store, not a notepad.

---

## 2. Units — the part that will bite if we get it wrong

You buy in **packets**. You issue in **grams**. Those are not the same number, and the
mistake everyone makes is storing whichever one they typed last.

So every item has exactly one **base unit**, fixed when the item is created and never
changed: `g`, `ml`, or `piece`. Stock, technician holdings, and consumption on a service
are *always* in that unit. There is one number and it means one thing.

A purchase order line then says how it was **bought**:

| Field | Meaning | Example |
|---|---|---|
| `qty` | how many packs ordered | 10 |
| `packUnit` | what a pack is called | packet |
| `packSize` | base units in one pack | 500 |
| `rate` | price per pack, ex-GST | ₹1,250 |

Receive it and **5,000 g** enters stock. The line still remembers it was ten packets at
₹1,250 — so the document reads the way the vendor's invoice reads, and the store reads
the way the technician works.

**Why `packSize` sits on the line and not on the item.** Because this vendor sells 500 g
packets and that one sells 1 kg tins, and next quarter the first one changes to 250 g.
A conversion fixed on the item would be a lie within a month. The form pre-fills
`packSize` from the last purchase of that item, so it is still one tap in the normal case.

The familiar ladders are offered as a helper when you pick a pack unit — `kg` → 1000 g,
`litre` → 1000 ml, `g` → 1000 mg — but what gets stored is always base units.

> **One consequence worth saying out loud:** choose the base unit as the *smallest* unit
> you will ever issue in. An item issued in millilitres must be based in `ml`, not
> `litre`. Stock is a whole number; there are no half units, by design.

---

## 3. The shape of it

### Vendor

Who we buy from. Enough to print a compliant purchase order and to call them when the
delivery is late.

```
Vendor   id VN-01 · name · gstin · contact person · phone · email
         addr · city · state · pincode        ← state decides the GST split
         terms "Net 30" · category · note · active
```

The vendor page carries their contact block, everything ever bought from them, what is
still on order, and a **New purchase order** button — which is the "click the vendor and
raise an order from him" you asked for.

### Purchase order

Deliberately the same anatomy as a quotation, because it is the same kind of document
pointed the other way — we are the customer.

```
PurchaseOrder  id PO-2026-01 · vendorId · date · expected delivery date
               status  draft → ordered → partial → received   (or cancelled)
               placeOfSupply  ← vendor's state vs ours, same GST rule as quotations
               discount · notes · terms[] · shipTo branch
               raisedBy · orderedAt · receivedBy · receivedAt
               items PoItem[]

PoItem         itemId (blank = a new product this order introduces)
               name · category · baseUnit
               packUnit · packSize · qty · rate
               receivedQty        ← packs received so far, for part deliveries
```

GST reuses `docTotals` untouched — the same place-of-supply rule you settled on the
quotation side, so a purchase order and an invoice add up the same way.

### The status machine

```
draft ──── place ────▶ ordered ──── receive all ────▶ received
  │                       │
  │                       └──── receive some ──▶ partial ──▶ received
  └──── cancel ──▶ cancelled          (receive the rest)
```

* **draft** — editable, no effect on anything.
* **ordered** — sent to the vendor. Lines are frozen. Any *new* products on the order are
  created in inventory now, at zero stock, so the item list can show "0 in hand · 5,000 g
  on order".
* **partial** — some of it turned up. The outstanding balance stays visible.
* **received** — everything arrived. Stock is in.
* **cancelled** — closed with nothing received.

**Why new items are created at *order* and not at *receipt*.** Two reasons. Ordering the
same new product on two draft orders would otherwise create the product twice. And "what
have we got coming" is a question worth being able to answer before the van arrives.
Stock still only moves on receipt — the item simply exists at zero until then.

### Receiving

One action, per line, with the quantity that actually turned up — defaulted to whatever
is outstanding, because most of the time everything arrives. In a single transaction:

* stock rises by `received × packSize`, in base units
* a `StockMove` is written — `in`, referencing the order and the vendor
* the line's `receivedQty` goes up; the order's status follows
* who received it and when is stamped on the order

Receiving more than was ordered is refused. It is not a delivery, it is a typo — or the
order needs amending, which is a decision, not a keystroke.

---

## 4. What changes in the app

| Where | Now | After |
|---|---|---|
| Inventory · **Add item** | opens a blank item form | opens **New purchase order** |
| Inventory · **Record stock purchase** | types a number straight into stock | gone. `POST /inventory/:id/move` refuses `kind: 'in'` with *"Stock only enters through a received purchase order"* |
| Inventory · issue to technician | unchanged | unchanged — this is the out door and it already works |
| Inventory · item row | name, stock, reorder | adds **on order**, and the last purchase rate |
| Item detail | movement ledger | the ledger now names the order and vendor on every receipt |

### The menu

*Organisation* becomes two, as you asked:

**Master data** — the things we define once
: Service Catalogue · Branches · Team · Training

**Purchase** — the things we buy and hold
: Purchase Orders · Vendors · Inventory

Inventory sits under **Purchase** rather than Master data on purpose: after this change
stock is not something anyone maintains by hand, it is the *result* of purchasing. Keeping
it next to the orders that fill it is the honest arrangement.

---

## 5. What this deliberately does not do

Naming these now so they are choices rather than omissions discovered later.

1. **No vendor bills or payments.** The order carries rates and totals, so a bill can hang
   off it the day you want accounts payable — but "what we owe our vendors" is a separate
   ledger and a separate screen, and bolting it on here would make both worse.
2. **No batch or expiry tracking.** See §7 — this is the one I would put next, and it is
   the one that hurts most to retrofit.
3. **No stock valuation or costing method.** No FIFO/weighted-average cost of what is on
   the shelf. Each item remembers its last purchase rate, which is enough to see whether a
   price moved; a valued inventory is an accounting decision, not a store one.
4. **No approval step.** Draft → ordered is one person's decision. If a second pair of
   eyes is wanted before an order goes out, that is a single extra status and a role check.

---

## 6. Build order

Each part leaves the app working. Nothing here needs a migration of existing data —
current stock stays exactly as it is and simply stops being hand-editable.

| Part | What |
|---|---|
| **A** | Schema — `Vendor`, `PurchaseOrder`, `PoItem`; `InventoryItem` gains `baseUnit`, `lastRate` |
| **B** | Vendor API + list + detail page, with **New purchase order** on the vendor |
| **C** | Purchase order API — create, edit while draft, place, cancel |
| **D** | The order form — the quotation builder's anatomy, with packs and pack size |
| **E** | Receiving — per-line quantities, the transaction, the stock move |
| **F** | Inventory closes its manual door; **Add item** becomes **New purchase order** |
| **G** | Inventory shows *on order* and last purchase rate; the ledger names the order |
| **H** | Menu split — Master data and Purchase |
| **H2** | Branch transfers — move stock from one branch's shelf to another |
| **I** | Print / PDF of the order, same writer as the quotation |
| **J** | Placement pass — the six questions from `TECHNICIAN.md` §10.1, on a phone too |

### What is built

A through H2 are done and proven against the live API, not just compiled. The end-to-end
run: a vendor, an order of ten 500 g packets of a product we had never bought plus four
1 kg cans of one we had, placed, part-received (six packets), over-receipt refused, the
rest received, then a transfer between branches and an issue to a technician.

```
place    → new product created at IN26, 0 in hand, 5,000 g on order
receive  6 packets → 3,000 g onto Anna Nagar's shelf, 2,000 g still on order
receive  the rest  → 5,000 g, status received
issue    to Karthik (Adyar) → refused: "Only 0 g at Adyar — the other 5,000 g
                               is at another branch. Transfer it first."
transfer 2,000 g Anna Nagar → Adyar
issue    200 g → holding 200 g, Adyar down to 1,800 g
```

At every step `item.stock` equalled the sum of its branch shelves, which is the one
invariant this module lives or dies by.

**Still open:** printing the order as a PDF (part I), and per-branch reorder levels have
a column but no screen yet.

---

## 7. The three decisions, settled

| Question | Your call | What it means here |
|---|---|---|
| Batch numbers and expiry | **Not now** | Stock is one number per item per branch. The receipt line is shaped so batch and expiry can be added without moving anything else. |
| Per-branch stock | **Each branch holds its own** | The big one. See §7.1. |
| Vendor bills and payables | **Out of scope** | The order carries rates and totals so a bill can hang off it later. |

### 7.1 Each branch holds its own stock

This is the decision that reshapes the module, so it is worth being precise about.

**Stock stops being a number on the item and becomes a number per branch per item.**

```
BranchStock   branchId · itemId · qty · reorder      @@unique([branchId, itemId])
```

`InventoryItem.stock` stays, and means **the total across every branch**. It is a cache,
and it earns its place: the inventory list and the low-stock banner both want a company
number, and computing it per row on every read is wasteful. The invariant is simple and
absolute — *`item.stock` equals the sum of that item's `BranchStock.qty`* — and it holds
because every writer moves both inside one transaction. There are only three writers:
receiving an order, issuing to a technician, and transferring between branches.

Four consequences follow, and all four are built:

1. **Receiving fills one branch** — the order's ship-to branch. That field stops being
   documentation and starts being the thing that decides where the chemicals landed.
2. **A technician draws from his own branch.** Issuing checks that branch's shelf, not the
   company total. Karthik cannot be handed Coimbatore's Deltamethrin because the number
   looked big enough. His holding stays personal — a technician carries what he carries,
   wherever he drew it from.
3. **Transfers between branches become a real movement.** Out of one, into the other, two
   ledger rows, one transaction. Without it, stock that landed at the wrong branch can
   only be fixed by lying to the system.
4. **Reorder levels are per branch.** Chennai running three technicians needs a different
   floor from a branch running one.

**Every `StockMove` now records its branch.** A movement that does not say where it
happened is not an audit trail, and retrofitting the column later would leave every
historical row ambiguous.

---

## 7.2 Two corrections after seeing it work

Both came from you looking at the built thing, which is the only reliable way to
find them.

### Chemicals are master data, not something an order invents

The first build let a purchase order line type a new product name and created the
item when the order was placed. That was wrong, and wrong in a way that rots
quietly: *Deltamethrin 2.5%*, *Deltamethrin 2.5 WP* and *deltamethrin* become
three products with a third of the stock each, and nobody notices until a
technician is told there is none left of something there is plenty of.

So **Master data → Chemicals** is now the list, and an order picks from it. The
rule you set still holds exactly as before — the catalogue is a *decision*, stock
is a *fact*:

* adding a chemical creates it at **zero**, and it stays there
* stock arrives only by receiving a purchase order
* a duplicate name is refused: *"Imidacloprid 30.5% SC is already in the list.
  Order more of it instead of adding it twice."*
* the base unit is **frozen** the moment anything moves — changing grams to
  millilitres under existing stock would silently reinterpret every number ever
  recorded against it
* a chemical with stock, movements or orders behind it cannot be deleted

### A purchase order carries no money

An order says *what we want and how much of it*. The price is whatever the vendor
invoices, and a figure typed in at ordering time is one nobody checked — printing
it only invites an argument about a number we never agreed.

Gone: rate, discount, place of supply, GST, totals, amount in words. What is left
is the part that matters to a store — the chemical, the pack, and the count:

| | |
|---|---|
| **Chemical** | from the master list |
| **How many** | 4 |
| **Pack** | can |
| **Each holds** | 5,000 ml |
| **= into stock** | 20,000 ml, on the ship-to branch's shelf |

The printed order shows *Quantity · Pack size · Total*, and closes with
*"Prices are not stated on this order. Invoice as per your quotation, quoting
PO-2026-04."* Vendors are counted in packs received and packs outstanding rather
than rupees, for the same reason.

`PoItem.rate` stays in the schema at zero. If prices are ever wanted, the column
is there — but nothing writes it and nothing shows it.
---

## 8. Checklist

### Vendors
- [x] Add a vendor with GSTIN, contact, address and payment terms
- [x] Vendor list shows what has been bought and what is on order
- [x] Vendor page raises a purchase order pre-filled with that vendor
- [x] A vendor with orders against it cannot be deleted, only deactivated

### The order
- [x] Chemicals are defined in Master data and an order picks from that list
- [x] A duplicate chemical name is refused
- [x] The base unit is frozen once stock has moved
- [x] Create a draft order against a vendor
- [x] Add a line for a product already in inventory
- [x] ~~Add a line for a product that does not exist yet~~ — replaced: products come from Master data → Chemicals
- [x] Pack unit and pack size per line; the base quantity is shown as you type
- [x] Pack size pre-fills from the last purchase of that item
- [x] ~~GST follows place of supply~~ — replaced: a purchase order carries no money
- [x] Notes and terms, as on a quotation — no discount, there are no prices
- [x] Edit freely while draft; frozen once placed
- [x] Place the order — every product already exists, so placing is purely a change of state
- [x] Cancel an order that was never received

### Receiving
- [x] Receive everything in one action
- [x] Receive part of an order; the balance stays outstanding
- [x] Receive the balance later; status becomes received
- [x] Over-receipt is refused with a clear reason
- [x] Stock rises by quantity × pack size, in base units, **on the order's ship-to branch**
- [x] A stock movement is written naming the order and the vendor
- [x] Who received it and when is on the order

### Inventory
- [x] Add item opens a new purchase order
- [x] Manual stock-in is refused by the API, not just hidden in the UI
- [x] Issuing to a technician reduces **his branch's** shelf, not the company total
- [x] Issuing more than that branch holds is refused, even when another branch has plenty
- [x] Stock can be transferred between branches, and both sides show in the ledger
- [x] `item.stock` always equals the sum of its branch rows
- [x] Item row shows in-hand, on-order and last purchase rate
- [x] Stock can be seen per branch, not only as a company total
- [ ] Reorder levels are set per branch — the column exists, no UI yet
- [x] Item ledger names the order and vendor on every receipt
- [x] Below-reorder still flags, and now suggests raising an order

### Everywhere
- [x] Master data and Purchase are separate menu groups
- [x] Role gates: who may raise, place, receive and cancel
- [ ] The order prints as a document, like a quotation — **not built**
- [ ] Every screen holds on a phone, no page-level sideways scroll
- [ ] Nothing disabled without saying why
