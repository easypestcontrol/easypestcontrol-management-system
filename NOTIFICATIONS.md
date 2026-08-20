# Notifications — the plan

**Real-time alerts that reach the phone even when the app is closed, with sound.**

Written 2026-08-20. Target: v2 (`v2/apps/api` + `v2/apps/web` + `v2/apps/mobile`).

The requirement, as given: whenever the app is closed, notifications must still
arrive — "today there is a schedule", "go here and do this" — with a sound. System
default tone for now; later a ringtone choice in Settings, for the mobile app only.
Notifications are what keep technicians (and everyone else) engaged with the app.

---

## 1. What exists today

| Piece | State |
|---|---|
| Bell in the topbar | Working — badge with unread count, list of last 25, "mark all read" |
| `Notification` table | `userId` (empty = broadcast to everyone), `at`, `text`, `read` |
| Who writes to it | Job cancel/renumber (jobs controller), chemical issue (techstock controller) |
| Push to the phone | **Nothing.** If the app is closed, nobody hears anything |
| Sound | None anywhere |

So the storage and the bell UI exist; what is missing is **delivery** (getting the
alert to a closed phone) and **coverage** (most events never create a notification
at all).

## 2. How an alert reaches a closed Android phone — the three lanes

There is exactly one mechanism on Android that wakes a phone when the app is
killed: **FCM (Firebase Cloud Messaging)**. Everything else only works while the
app is open. So the design uses three lanes, cheapest first:

| Lane | When it works | How |
|---|---|---|
| **A. The bell** (exists) | Whenever the user looks | Prisma row + topbar poll. This is the permanent record — every alert lands here regardless of the other lanes |
| **B. In-app live alert** | App open or recently backgrounded | The app polls `/notifications` every 20 s (later: one SSE stream). A new row triggers `@capacitor/local-notifications` → Android banner **with sound**, even while the technician is inside another screen |
| **C. Closed-app push** | Always — app closed, phone in pocket | FCM via `@capacitor/push-notifications`. The API sends to Google, Google wakes the phone. Needs a free Firebase project |

**Why FCM works despite our LAN-only server:** the push does not travel over our
LAN. The API server calls Google's FCM endpoint (the office machine has internet),
and Google delivers to the phone over whatever internet the phone has (mobile data
or Wi-Fi). The app's *content* still loads from `192.168.1.7:3050` as today.
Caveat: a phone with no internet at all receives the push the moment it is back
online — FCM queues it.

**What Firebase costs:** nothing. FCM is free at any volume. It needs a Google
account, one Firebase project, and two files: `google-services.json` in the
Android app (one APK reinstall) and a service-account JSON on the server.

Tapping any notification deep-links into the app: "New service assigned" opens
`/jobs/JOB-123`, "Cash confirmed" opens `/wallet`, and so on.

## 3. The notification catalog

Every row lands in the bell (lane A) always; **Push** marks the ones worth waking
a closed phone for. Text is written the way it should read on the lock screen.

### For technicians — the ones that drive the day

| # | Event | Example text | Push | Why |
|---|---|---|---|---|
| T1 | **Morning digest** (daily ~7:00) | "Today: 3 services. First at 9:00 — Sri Krishna Apartments, Anna Nagar." | ✔ | The single most engaging one. No services → no notification (silence means a free morning) |
| T2 | **Service assigned to you** | "New service SAT 16 Oct 9:00 — General Pest Control at Sri Krishna Apartments. You lead." | ✔ | "Go here and do this" |
| T3 | **Service rescheduled** | "JOB-910 moved to 18 Oct, 10:00–12:00." | ✔ | Prevents wasted trips |
| T4 | **Service cancelled** | "JOB-911 on 16 Dec is cancelled — day is clear." | ✔ | Same |
| T5 | **Starting-soon reminder** (30 min before slot) | "Sri Krishna Apartments at 9:00 — start your trip." | ✔ | Punctuality; ties into the trip module |
| T6 | **Chemicals issued to you** | "Issued: 2 × Pyrethrum Fogging Conc. — now in your stock." | — | Useful, not urgent; bell + in-app is enough |
| T7 | **Cash deposit confirmed** | "₹1,800 you deposited is confirmed by accounts." | ✔ | Money answers build trust in the wallet |
| T8 | **New training lesson** for your role | "New lesson: Termite pre-treatment — 6 min video." | — | Engagement, not urgency |

### For admin / operations

| # | Event | Example text | Push |
|---|---|---|---|
| O1 | Service **completed** | "JOB-1080 done at Sri Krishna Apartments — report signed, 2 photos." | ✔ |
| O2 | **Payment collected** on site | "₹1,800 cash collected by Suresh against INV-2041." | ✔ |
| O3 | Technician **reached site** (check-in) | "Suresh checked in at Sri Krishna Apartments, 9:04." | — |
| O4 | **Client accepted a quotation** | "QUO-118 accepted by Meera — ready to convert." | ✔ |
| O5 | **Unassigned service tomorrow** (evening check ~18:00) | "2 services tomorrow still have no technician." | ✔ |
| O6 | **Contract ending** in 30 days | "AMC-2026-01 ends 30 Sep — renewal call due." | — |

### For accounts

| # | Event | Example text | Push |
|---|---|---|---|
| A1 | **Invoice paid** (UPI/transfer recorded) | "INV-2041 paid — ₹14,553." | ✔ |
| A2 | **Cash in hand too long** (> 3 days) | "Suresh is holding ₹4,200 collected 3+ days ago." | ✔ |

### For sales

| # | Event | Example text | Push |
|---|---|---|---|
| S1 | Quotation accepted (same as O4, to the owner) | — | ✔ |
| S2 | **Lead follow-up due today** (morning) | "3 leads due for follow-up today." | — |

Rule of thumb baked in above: **push = something changed that affects what you do
next**. Everything informational stays bell + in-app only, so pushes stay rare
enough that people never mute them.

## 4. Sound and the ringtone setting

Android fact that shapes the design: since Android 8, the sound belongs to the
**notification channel**, not the message, and a channel's sound is **frozen at
creation** — it cannot be changed later, only replaced by a new channel.

So:

- **Now (phase 1–2):** one channel, `pestops-alerts`, created with the **system
  default notification tone**. Every alert sounds. Done — this is exactly the
  "system default for right now" ask.
- **Later (phase 3):** the Settings → Notifications screen (visible **only inside
  the app shell** — the desktop web never shows it) offers a small set of tones:
  *System default / Chime / Urgent / Silent*. Each tone is a pre-created channel
  (`pestops-alerts-chime`, …). Choosing one stores the preference on the user
  (server-side, so it follows them across phones) and the push payload simply
  names that channel. This is the standard way every serious Android app ships a
  tone picker.
- Same screen, same phase: **per-category switches** (each table row above is a
  category) and **quiet hours** (e.g. no sounds 21:00–7:00 except T5 reminders).

## 5. What gets built — data + server + app

### Data (Prisma)

```prisma
model Device {            // one row per phone that logged in
  id        Int    @id @default(autoincrement())
  userId    String
  token     String @unique   // FCM registration token
  platform  String @default("android")
  at        String           // registered when
}
```

`Notification` grows: `kind` (T1/O2/…), `title`, `ref` (JOB-x / INV-x for the
deep link). User preferences (tone, muted kinds, quiet hours) live in a JSON
column on `User` — no migration churn while the shape settles.

### Server — one door for every alert

A single `notify()` service the whole API calls; **no controller writes
Notification rows directly any more** (the two existing writers switch over):

```
notify({ to: userIds | role | 'all', kind, title, text, ref })
  1. writes Notification rows            → lane A, the bell
  2. (that's all lane B needs — the app polls and sees the new row)
  3. looks up Devices for those users    → lane C
     sends FCM HTTP v1 message  { title, text, ref, channel: user's tone }
```

Plus two small endpoints: `POST /devices` (the app registers its FCM token after
login), `DELETE /devices` (logout). And two scheduled jobs on the API (plain
`setInterval` at boot, checked hourly): the 7:00 technician digest (T1) and the
18:00 unassigned-tomorrow check (O5).

### Mobile app (the one APK reinstall)

- `@capacitor/push-notifications` + `google-services.json` → closed-app pushes.
- `@capacitor/local-notifications` → sound + banner while the app is open.
- On login: ask the Android 13+ notification permission, register token.
- Tap handler: read `ref`, `router.push` to the right page.

The web side (poll, bell, settings screen) updates over the air as always — only
the two plugins force the single reinstall, and it can ride together with any
other APK update.

## 6. Build order

| Phase | What ships | Effort | Needs |
|---|---|---|---|
| **1. Coverage + in-app sound** | `notify()` service; all catalog events wired to it; app polls and raises local notifications with the default tone while open | ~half a day | Nothing external |
| **2. Closed-app push** | Firebase project, both key files, push plugin, device registration, FCM send inside `notify()` | ~half a day | A Google account (free); **one APK reinstall** |
| **3. Settings + schedules** | Ringtone picker (channel set), per-category switches, quiet hours; 7:00 digest + 18:00 unassigned check | ~half a day | Nothing external |

Phase 1 alone already changes how the app feels (sound + banner during the day);
phase 2 is what fulfils "even when the app is closed"; phase 3 is the polish that
was asked for in Settings.

## 7. Decisions to take before building

1. **Google account for Firebase** — which account owns the project? (Free, two
   minutes to create; I need the `google-services.json` + service-account JSON,
   or the account login to generate them.)
2. Digest time 7:00 and unassigned-check 18:00 — right times?
3. Quiet hours default: 21:00–7:00, reminders exempt — agree?
4. Should **customers** ever get notified (service tomorrow / technician on the
   way)? That is SMS/WhatsApp territory, out of scope here — flagging so it is a
   conscious "later".

## 8. Verify-when-done checklist

- [ ] Kill the app completely → assign a service to Suresh → phone rings with the banner within seconds; tapping opens that service.
- [ ] Phone in flight mode during the event → alert arrives the moment it is back online.
- [ ] App open on the wallet page → same event still banners + sounds (local notification path).
- [ ] Every push also sits in the bell, marked unread.
- [ ] Change tone in Settings → next alert uses it; desktop web shows no tone setting.
- [ ] 7:00 digest fires once, only to technicians with services today.
- [ ] Quiet hours: an O2 at 22:30 is silent (bell only); a T5 reminder still sounds.
