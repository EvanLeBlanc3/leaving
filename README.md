# 🚆 Leaving — Chicago L + bus countdown (v1.2)

Leaving tells you how long you have before you need to leave for the L. It finds the stations closest to you, shows live CTA arrivals, gives you a "Leave in X min" countdown based on your walk, and can alert you however many minutes before a specific train reaches a specific station. Made for iPhone and locked to portrait.

## What's new in 1.2: 🚌 Bus tab
- Search any CTA bus route by number or name. Classics like the 22, 9, 66 and 151 sit up top.
- Pick a direction, and stops are sorted nearest-first. Your closest stop is highlighted.
- Tap a stop to get a CTA-style stop sign, a "You need to leave in" countdown, and live arrivals for each bus with distance away and Delayed flags.

**Bus setup (one time):**
1. Get a Bus Tracker key. It's separate from your train key. Create an account at ctabustracker.com, sign in, then go to **My Account → Developer API**.
2. In Cloudflare, open your Worker and paste in the new `server/worker.js`, then select **Deploy**.
3. Go to Worker **Settings → Variables and Secrets → Add**. Type **Secret**, name `BUS_KEY`, value: your Bus Tracker key. Deploy.
4. In Leaving, go to **Settings → Save & test**. You should see ✅ next to "Bus key".

## What was new in 1.1
- **★ My stations:** tap the ☆ on any station card, search result, or station page to pin it to the top of Nearby. Save as many as you want. They stack in the order you add them (newest at the bottom), always show live arrivals, and stay saved after you close the app.
- The LEAVING header and pop-up messages sit lower to clear the Dynamic Island.

## Files
| Path | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js` | The app |
| `sw.js`, `manifest.webmanifest`, `icons/` | Install, offline and push support |
| `server/worker.js` | Cloudflare Worker: holds your CTA key and sends push alerts |
| `server/wrangler.toml` | Optional, only for the command line |

## Updating an existing install
Upload `index.html`, `styles.css`, `app.js`, `sw.js`, `manifest.webmanifest` and `icons/` to your `leaving` repo, replacing the old files. Commit, wait about a minute, then fully close Leaving and reopen it. Your server URL, alerts and favorites carry over.

For 1.2 you **do** need to update the Worker (see Bus setup above).

## First-time setup (summary)
1. **Cloudflare:** create a KV namespace called `leaving-kv`, then create a Worker called `leaving-api` and paste in `server/worker.js`. In the Worker's Settings:
   - Add a binding: **KV namespace** with variable name `LEAVING_KV` → `leaving-kv`.
   - Add a secret `CTA_KEY` (your CTA key) and a text variable `VAPID_SUBJECT` = `mailto:you@example.com`.
   - Add a Cron Trigger that runs every minute (`* * * * *`).
2. **GitHub Pages:** upload the app files and turn on Pages (main / root).
3. **iPhone:** open the Pages URL in Safari, tap Share → Add to Home Screen, and open Leaving from there.
4. **In the app:** go to Settings → paste your Worker URL → Save & test (you want two ✅). Then go to Alerts → Enable → Send test push.

*Not affiliated with the CTA. Data from CTA Train Tracker and the City of Chicago Data Portal.*
