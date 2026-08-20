# The Dispatch Board

**Brainstorm — drag-and-drop technician assignment on a timeline.**

Your client wants the screen in the reference: technicians down the left, the working day
across the top, jobs as bars you pick up and drop onto whoever is free. This document is
the honest assessment before we build it — what it is worth, what it costs, where it will
hurt, how I would build it, and every feature it could carry.

**The short answer: yes, and it is closer than it looks.** The hard part of this feature
is not the dragging. It is the data underneath it, and most of that data already exists.

---

## 1. What you are asking for, precisely

One screen where a dispatcher can see the whole day at a glance and fix it by hand:

- **Rows** are technicians, grouped by branch.
- **Columns** are time — 8 AM to 8 PM, or whatever your day is.
- **Bars** are jobs, positioned by start time and as wide as the job is long.
- **A queue on the left** holds everything not yet assigned.
- **Dragging** a bar onto a technician's row assigns it. Dragging sideways moves the time.
- **Duration is set by a person**, not calculated — an hour, ninety minutes, whatever the
  admin knows it takes.
- **Location matters** — a technician should get work near where they already are, and
  each customer belongs to the branch nearest them.

---

## 2. What the app already has

This is the good news, and it is most of the feature.

| What a dispatch board needs | Does it exist? |
|---|---|
| A job with a **date** | ✅ `job.date` |
| A **start time** | ✅ `job.slot` — `"09:00"` |
| A **duration in minutes** | ✅ `job.mins` — already per-job, already editable |
| **Who is on it** | ✅ `job.techIds` — a list, since the crew work |
| **How many people it takes** | ✅ `plan.crew`, added this week |
| **Technicians, and their branches** | ✅ `user.branches` — a technician can cover several |
| **Branches, and the areas they cover** | ✅ `branch.areas` — Adyar, Besant Nagar, Mylapore… |
| **Which services a technician can do** | ✅ `user.skills` |
| **A queue of unassigned work** | ✅ already computed in `store.js:611` |
| **Merged trips** — two services, one visit | ✅ the scheduling engine does this |

So a job **is** a work order, and it already carries everything a bar on a Gantt chart
needs: a row, a start, a width. **No new data model is required to draw the board.**

### What is genuinely missing

| Missing | Why it matters | How hard |
|---|---|---|
| **Latitude / longitude on customers** | Without coordinates there is no real travel time. We have `addr`, `city`, `pin`, and the branch's `areas` list — enough for a *zone* proxy, not for "23 minutes away" | Medium |
| **A branch on the customer** | Leads have `branch`; customers do not. So "the branch nearest this customer" has to be inferred from the area name | Easy |
| **Working hours, shifts, days off** | The board cannot grey out time a technician is not available, because nothing records it | Easy |
| **Leave and sickness** | Same — a dispatcher will drop work onto someone who is not coming in | Easy |
| **Travel buffer between jobs** | Two jobs can sit back to back with no gap to drive between them | Easy once zones exist |
| **A pin, so the engine leaves a moved visit alone** | AMC visits are generated. Move one by hand and the next plan regeneration puts it back | Easy, and needed |

---

## 3. The positives

**It replaces the part of the job that is still in someone's head.** Right now assignment
is a dropdown per contract. A dispatcher holding twelve technicians and forty jobs cannot
see conflicts, gaps or overload in a dropdown. On a board they are obvious without reading
anything.

**Idle time becomes visible.** An empty stretch on a technician's row is money. Nothing in
the app shows that today.

**It is the natural home for the crew rule we just built.** A service that takes two people
shows as two rows lit at the same time. Under-staffing stops being a warning banner and
becomes a visible hole in the day.

**It shortens the distance between "the phone rang" and "someone is going".** An urgent
callback is dropped into the first free slot near that area, and the technician is notified
on WhatsApp — one gesture instead of four screens.

**Same-day rescheduling stops being painful.** A technician calls in sick; you drag their
row's work onto whoever is free, and every customer gets a new time.

**It demonstrates well.** This is a screen that sells the product in a meeting. That is a
real benefit for a demo, and you should weigh it honestly rather than pretend it is only
about efficiency.

**The data is already right.** Because a job already has a duration and a crew, the board
is a *view* of existing data, not a parallel system that can drift out of step. That is the
difference between a two-week feature and a two-month one.

---

## 4. The negatives — what it costs you

**It is the most complex screen in the product, by a distance.** Everything else is a form
or a list. This is a canvas with hit-testing, live geometry, and rules that fire while the
pointer is moving. Expect it to hold more bugs than the rest of the app combined.

**Drag-and-drop is genuinely hard on touch.** The browser's built-in drag API does not work
on phones. It has to be rebuilt on pointer events, and then long-press, scroll and drag all
compete for the same finger. Your reference image shows a phone — that phone is where most
of the effort will go.

**A board invites fiddling.** Manual assignment feels productive. A dispatcher can spend
forty minutes producing a plan an algorithm would have produced in a second. The board
should suggest, not just accept.

**Manual duration is a promise you have to keep.** If a job is typed as one hour and takes
two every time, the board is lying all day and everyone stops trusting it. Duration needs
to be corrected against what actually happened — the app already records `exec.durationMins`,
so this is fixable, but it must be fixed.

**Nearby-location routing is not really possible yet.** Without coordinates, "near" means
"same area name". That catches the obvious mistakes and misses the subtle ones. Do not
promise route optimisation on top of a text field.

**It changes who does the work.** Today the system assigns. With a board, a person assigns —
and if that person is on leave, nobody does. Whatever gets built needs an auto-assign that
is good enough to fall back on.

---

## 5. The drawbacks — where it will actually break

Ranked by how likely they are to bite, and what to do about each.

**1. The generated plan overwrites a hand-moved visit.** AMC visits come from the engine.
A dispatcher moves Tuesday's visit to Thursday; the next time the plan is applied it moves
back, silently. *Fix: a `pinned` flag on any visit touched by hand, respected by
`S.applyPlan` the same way completed visits already are. This must ship with the board, not
after it.*

**2. A crew job on two rows can be split by accident.** A service needing two technicians
draws two bars. Drag one and you either move both or you have broken the job. *Fix: the
bars are lanes of one job; dragging any lane moves all of them, and the UI says so while
dragging.*

**3. Double-booking is easy and invisible.** Drop a job on a busy technician and it
overlaps. *Fix: detect the overlap before the drop lands, refuse it or offer to push the
next job later. Detection is straightforward — same technician, overlapping minute range.*

**4. No travel time means impossible days.** Adyar at 11:00, Anna Nagar at 12:00, back to
Adyar at 13:00 — the board will happily allow it. *Fix: a per-branch-pair travel estimate
the admin can type once, applied as a warning band between consecutive jobs.*

**5. Accidental drags destroy a plan silently.** A stray gesture moves a job and nothing
says so. *Fix: undo, an action log, and a small toast on every move naming what changed.*

**6. It will be slow if built naively.** Twelve technicians across a day is nothing. Fifty
technicians across a week is 350 rows of absolute-positioned bars re-rendered on every
pointer move. *Fix: render the board once, move only the dragged bar during the gesture,
commit on drop. Day view first; a week view only if it is genuinely wanted.*

**7. Two dispatchers on the same board overwrite each other.** With localStorage this cannot
happen. On a real server it will, daily. *Fix: worth knowing now, not solving now.*

**8. Timezone and midnight-crossing jobs.** A job at 22:00 running three hours crosses into
tomorrow — the reference image even shows one (`2:00 PM – 4:00 AM`). *Fix: decide early
whether a bar may cross midnight, or is clipped at the end of day.*

---

## 6. How I would build it

Four stages, each usable on its own. Stop after any one of them and you still have
something better than today.

### Stage 1 — the board, read-only

Draw it before making it interactive. Technicians as rows grouped by branch, jobs as bars
from `slot` and `mins`, a now-line, the unassigned queue on the left.

Geometry is the whole trick, and it is simple: **minutes become pixels.**

```
left  = (startMinutes - dayStartMinutes) * PX_PER_MIN
width = job.mins * PX_PER_MIN            // PX_PER_MIN = 2  →  1 hour = 120px
```

Everything else — snapping, hit-testing, resizing — is arithmetic on that one line. This
stage alone answers "who is free on Thursday afternoon", which nothing answers today.

### Stage 2 — dragging

**Pointer events, not the HTML5 drag API.** `pointerdown` / `pointermove` / `pointerup`
with `setPointerCapture` gives one code path for mouse, finger and stylus, and it is the
only thing that works properly on the phone in your reference image.

- Move only the dragged element while the gesture runs; leave the rest of the board alone.
- Snap to 15 minutes. Round on drop, not during the drag — snapping mid-gesture feels sticky.
- The row under the pointer highlights. An invalid row goes red rather than silently refusing.
- On drop: write `slot` and `techIds`, mark the visit `pinned`, save, toast with an **Undo**.
- Long-press to pick up on touch, so scrolling still works.

### Stage 3 — the rules

Now the board can say no, or at least "are you sure":

conflict · travel gap · outside working hours · on leave · missing skill · wrong branch ·
crew short · outside the customer's preferred window · priority breach.

Each rule is a small pure function of `(job, technician, startMinute)` returning
`{ ok, level, message }`. They run on hover during a drag, so the answer arrives before the
drop, not after.

### Stage 4 — the help

Once the board is trustworthy, make it do the work:

- **Suggest** — rank technicians for a job by area, skill, current load and gap.
- **Auto-fill the day** — assign everything in the queue, then let a person adjust.
- **Balance** — even the load across a branch.
- **Nearest free slot** — one click to place an urgent callback.

---

## 7. Every feature it could carry

Grouped, and marked **must** (the board is not useful without it), **should** (build it
soon), **later** (only if asked).

### The board
- Day view with technicians as rows — **must**
- Grouped by branch, collapsible — **must**
- Bars sized by real duration — **must**
- Colour by service type, with a legend — **must**
- Now-line on today — **must**
- Zoom the hour width; a compact and a comfortable density — **should**
- Week view — **later**
- Employee view (a list per technician rather than a timeline) — **should**
- Print / export the day's plan — **should**

### The unassigned queue
- Everything unassigned, oldest first — **must**
- Search by customer, work-order number or address — **must**
- Filter by priority, service, branch, date — **must**
- Count badge, and a warning when anything is overdue to be assigned — **must**
- Sort by urgency, by area, by contract deadline — **should**

### Dragging
- Queue → board, assigning technician and time in one gesture — **must**
- Move within the board; move between technicians — **must**
- Resize the right edge to change duration — **should**
- Multi-select and move together — **later**
- Keyboard alternative for accessibility — **should**
- Undo, and an action log — **must**
- Unassign by dragging back to the queue — **must**

### The rules
- Double-booking — **must**
- Outside working hours; on leave — **must**
- Crew shortfall on a service needing more than one — **must**
- Skill mismatch — **should**
- Branch or area mismatch — **should**
- Travel gap too short between consecutive jobs — **should**
- Customer's preferred time window — **should**
- Overtime warning past N hours in a day — **later**

### Location
- Customer carries a branch, inferred from the area — **must**
- Areas as zones; same-zone jobs group naturally — **should**
- A travel-time estimate per branch pair, typed once by the admin — **should**
- Latitude / longitude with a map picker — **later**
- A map beside the board showing the day's route — **later**
- Real route optimisation — **later, and only with coordinates**

### People
- Working hours per technician — **must**
- Days off, leave, holidays — **should**
- Capacity per day (hours or jobs) — **should**
- Live load: hours booked against hours available — **must**
- Skills already exist; surface them on the row — **should**

### Communication
- WhatsApp the technician when work is assigned or moved — **must**
- Tell the customer their time window — **should**
- Re-notify both when a job moves — **must**
- A day sheet the technician can open on their phone — already exists

### Mobile
- The same board, scrollable and pinchable — **should**
- Long-press to pick up — **must, if mobile is in scope**
- A simple list mode for phones, since a Gantt on a 5-inch screen is a compromise — **should**

---

## 8. My recommendation

**Build stages 1 and 2, plus the pin and the conflict rule from stage 3.** That is the real
feature: see the day, move the work, do not double-book, do not lose the move. Everything
else is an improvement on a thing that already works.

**Add the two small data pieces first** — working hours on a technician, and a branch on a
customer. Both are an afternoon each, and without them the board cannot be honest about who
is available or who is nearby.

**Do not promise route optimisation.** Say "assign by area and branch", which is true and
useful. Coordinates and real routing are a later, separate conversation.

---

## Questions I need answered before building

1. **What is your working day?** The board needs a start and an end — 8 AM to 8 PM, or does
   night work for restaurants and warehouses mean it runs to midnight? The reference image
   shows a job ending at 4 AM.
2. **Can a job cross midnight**, or is it clipped at the end of the day?
3. **Day view only, or is a week view needed?** Week roughly doubles the work and is where
   the performance problems live.
4. **Is the phone a real requirement or a nice-to-have?** Touch dragging is a large part of
   the effort, and a list-based mobile assign screen would cost a fraction.
5. **When a dispatcher moves a generated AMC visit, what should happen to the rest of the
   plan?** Move only that one, or shift everything after it? This is the question behind
   the pin, and it changes the design.
6. **Should the board ever refuse a drop, or only warn?** A dispatcher usually knows
   something the system does not — my instinct is warn loudly, refuse nothing.
