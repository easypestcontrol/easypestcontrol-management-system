# PestOps Field — the technician Android app

The complete field experience as a native Android app, for **Senior Technicians
and Technicians**. It is a native shell around the live PestOps server, so it
is always a 100% clone of the technician web experience — **every feature, no
exceptions** — and it updates itself the moment the server updates.

## What's inside (everything the technician has)

- **Login** — technician role cards or email + password
- **My Services** — today / upcoming / completed, only their own work
- **Service page** — what the visit delivers: quoted service names,
  descriptions, warranty, and the **medicines issued from inventory** per
  service; site instructions; call the customer
- **Execution flow** — travel → GPS check-in → before photos (opens the
  camera directly) → start work → chemicals used (deducted from stock) →
  findings → after photos → customer signature on-screen → finish
- **Money** — per-visit invoice, Collect in three modes (Cash → wallet,
  UPI QR via Razorpay once connected, Bank transfer with UTR), every rupee
  recorded with name, date and time
- **Trip** — one-tap trip from today's services or Add trip with purpose +
  place; GPS breadcrumb distance along the real road; Ola live map, road
  route and in-app turn-by-turn directions
- **Training** — the lessons published for their role (video + text)
- **My Wallet** — cash in hand, every receipt, deposit status

## Build the APK

Everything is already scaffolded. On this PC:

```bash
cd v2/apps/mobile/android
set ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
gradlew assembleDebug
```

The APK lands at
`android/app/build/outputs/apk/debug/app-debug.apk`.
Copy it to any Android phone (WhatsApp it to yourself works) and install —
allow "install from unknown sources" when asked.

Or open `v2/apps/mobile/android` in **Android Studio** and press Run with a
phone plugged in.

## Pointing the app at the server

The app shows whatever `server.url` in `capacitor.config.ts` serves:

- **Now (testing)**: `http://192.168.1.7:3050` — this PC's Wi-Fi address.
  The phone must be on the same Wi-Fi, and the PestOps servers must be
  running on the PC.
- **After the VPS goes live**: change it once to `https://your-domain`,
  run `npx cap sync android` and rebuild. From then on the app works from
  anywhere with internet.

## How updates work — the important part

The app never contains the product; it contains a window to the server.
Ship a change to the server (new feature, fix, anything) and **every
installed app shows it instantly** — no rebuild, no redistribution, no
version mismatch between web and mobile. The APK only needs rebuilding if
the server ADDRESS changes or you want a new icon/name.

## Permissions the app requests

- **Location** — GPS check-in stamps and trip distance tracking
- **Camera** — before/after treatment photos

Both are asked once on first use, exactly like any Android app.
