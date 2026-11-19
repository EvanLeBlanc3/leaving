# 🚆 Leaving — Chicago L countdown

**Leaving** tells you how long you have before you need to leave for the L. It finds the stations closest to you, shows live CTA arrivals, and works out a **"Leave in X min"** countdown from your walking distance. You can set an alert to go off however many minutes before a specific train reaches a specific station.

Made for iPhone and locked to portrait, so it stays put even when you turn the phone sideways.

---

## What's in the box

| Path | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js` | The app |
| `sw.js`, `manifest.webmanifest`, `icons/` | Install, offline and push support |
| `server/worker.js` | The small Cloudflare server that holds your CTA key and sends push alerts |
| `server/wrangler.toml` | Optional, only needed if you use the command line instead of the dashboard |

---

## Part 1: The server (one time, about 10 minutes, free)

**Why a server?** Your GitHub repo is public, so an API key placed in the app's code is visible to everyone. iPhone notifications that arrive while the app is closed also have to come from a server. A free Cloudflare Worker handles both.

1. Sign up for a free account at **dash.cloudflare.com**.
2. **Create the storage:** go to **Storage & Databases → KV → Create**. Name it `leaving-kv`.
3. **Create the Worker:** go to **Workers & Pages → Create → Create Worker** (the "Hello World" starter). Name it `leaving-api` and select **Deploy**.
4. Select **Edit code**, delete everything there, paste in all of `server/worker.js`, then select **Deploy**.
5. In the Worker, go to **Settings → Bindings → Add → KV namespace**. Set the variable name to `LEAVING_KV` and choose `leaving-kv`.
6. In **Settings → Variables and Secrets → Add**:
   - Type **Secret**, name `CTA_KEY`, value: **your CTA Train Tracker API key** 🔑
   - Type **Text**, name `VAPID_SUBJECT`, value: `mailto:your-email@example.com`
   - *(Optional)* Type **Text**, name `ALLOWED_ORIGINS`, value: `https://YOURNAME.github.io`
7. In **Settings → Trigger Events (Triggers) → Add → Cron Trigger**, choose **every minute** (`* * * * *`).
8. Copy your Worker URL, which looks like `https://leaving-api.YOURNAME.workers.dev`.

> Cloudflare sometimes renames its menus. If a label doesn't match exactly, look for "Bindings", "Variables/Secrets" and "Triggers/Cron" in the Worker's Settings.

## Part 2: The app on GitHub Pages (same as your other apps)

1. Create a new repo named `leaving`.
2. Upload everything **except** the `server/` folder. Uploading it too is harmless because it contains no secrets.
3. Go to **Settings → Pages → Deploy from branch → `main` / root → Save**.
4. On your iPhone, open `https://YOURNAME.github.io/leaving/` in **Safari**.
5. Tap **Share → Add to Home Screen**, then open **Leaving** from your Home Screen.

## Part 3: Connect them

1. In Leaving, go to **Settings → Leaving Server URL**, paste your Worker URL, and tap **Save & test**. You want ✅ for both the CTA key and alert storage.
2. Go to **Alerts → Enable** and allow notifications, then tap **Send test push** to make sure they arrive.
3. Allow location when asked.

---

## How it works

- **Nearby:** your 4 closest stations, or 8 if you tap "Show more". Each one shows arrivals by direction, the walking distance, and a color-coded label: 🟢 *Leave in X* / 🟡 *Leave soon* / 🔴 *RUN* / ⚫ *Missed it*. The big card at the top counts down to the soonest train you can still catch.
- **Station:** every predicted train, plus Approaching, Delayed and Scheduled flags. Tap the ☆ to make it a favorite.
- **Alerts:** tap any train and choose how much warning you want: 1–120 minutes, the presets, or **🚶 My walk**, which uses your walking time plus your buffer. The server checks every minute and adds short timers inside that minute, so alerts go off close to the minute you picked.
- **Lines:** the status of each line, active CTA service alerts, and every train running right now. Tap a train to see its upcoming stops, and set an alert at any of them.
- **Refresh:** arrivals update every 5, 10, 15 or 30 seconds (you choose in Settings). Countdowns update every second either way.

## Good to know

- iPhone only sends push notifications to apps opened from the **Home Screen** (iOS 16.4 or later).
- CTA only predicts trains that are already on the way, so the furthest-out trains appear when they appear.
- An alert follows one train by its **run number**. If the CTA stops reporting that train before your alert goes off, you get a "lost track" notice.
- Walking time uses straight-line distance × 1.25 to account for city blocks, at your chosen pace. Change the pace and buffer in Settings.
- Your API key lives only in Cloudflare, never in GitHub.

*Not affiliated with the CTA. Data comes from CTA Train Tracker and the City of Chicago Data Portal.*
