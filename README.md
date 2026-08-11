# Amazon Review Request Automation (Cloud / GitHub Actions edition)

Runs entirely on GitHub's servers on a schedule — your laptop doesn't need to
be on. Self-hosted alternative to RatingRaja / Lonesome Labs, using Amazon's
own official SP-API Solicitations endpoint (the same mechanism those tools
use under the hood). It only ever triggers Amazon's fixed review-request
email — no custom messages, so it can't drift outside Amazon's Communication
Guidelines.

## How it works

1. **GitHub Actions** runs this script on a timer (every 6 hours by default)
   on GitHub's own cloud servers — free for private repos at this usage level.
2. The script fetches your shipped orders, and for each one asks Amazon
   directly: *"is this order currently eligible for a review request?"*
   Amazon's own answer is the sole gate — it has real delivery data we
   structurally can't access ourselves, so we defer to it rather than
   guessing a delivery-based timer.
3. Eligible + not-already-requested orders get the real request sent.
4. Every send is logged with the order ID and timestamp.
5. The **log page** (a free GitHub Pages site) shows you that log — order
   IDs, status, timestamps — so you can verify exactly what went out.

No cap on how many orders get processed per run by default — it works
through everything eligible, however many that is.

## One-time setup

### 1. Create a GitHub account (if you don't have one)
Go to github.com and sign up — free.

### 2. Create a new **private** repository
Click the **+** in the top right → **New repository**. Name it something
like `review-automation`. Set visibility to **Private** (this holds your
business logic and, indirectly via Secrets, touches your credentials — keep
it private). Don't initialize with a README (you're uploading your own files).

### 3. Upload these files
Easiest way, no command line needed:
- On your new repo's page, click **Add file → Upload files**
- Drag this entire folder's contents in (keep the folder structure — the
  `.github`, `lib`, `docs`, `state` folders need to stay as folders)
- Commit directly to the `main` branch

(If you're comfortable with git, `git init`, `git add .`, `git commit`,
`git remote add origin <your repo URL>`, `git push` works too — just note
GitHub's web upload sometimes doesn't preserve empty folders correctly, so
double check `state/.gitkeep` made it in.)

### 4. Add your credentials as repo Secrets
Go to your repo → **Settings** tab → **Secrets and variables** → **Actions**
→ **New repository secret**. Add each of these one at a time (name exactly
as shown, value is your real data):

| Secret name | Value |
|---|---|
| `LWA_CLIENT_ID` | your Client ID from Seller Central |
| `LWA_CLIENT_SECRET` | your Client Secret |
| `LWA_REFRESH_TOKEN` | your Refresh Token |
| `MARKETPLACE_ID` | `A21TJRUUN4KGV` (Amazon.in — leave as-is) |
| `SPAPI_BASE_URL` | `https://sellingpartnerapi-eu.amazon.com` |
| `LOOKBACK_DAYS` | `15` (or your preference) |
| `MAX_REQUESTS_PER_RUN` | leave unset for no cap, or e.g. `500` to be conservative on first runs |

GitHub encrypts these and never displays them again once saved — even you
can't view them afterward, only overwrite them.

### 5. Turn on GitHub Pages (this gives you the log page)
Repo → **Settings** → **Pages** (left sidebar) → under "Build and
deployment", **Source: Deploy from a branch** → **Branch: main**, folder:
**/docs** → **Save**.

GitHub will give you a URL like:
```
https://yourusername.github.io/review-automation/
```
That's your log page — bookmark it. It may take a minute or two to go live
the first time.

### 6. Test it before trusting the schedule
Repo → **Actions** tab → click **Amazon Review Request Automation** on the
left → **Run workflow** button → leave "Dry run only" set to **true** →
**Run workflow**.

Click into the run to watch it live. This is a real connection to your real
orders, but sends nothing — same safety net as `npm run dry-run` locally.
Once that looks right, run it again with dry_run set to **false** to confirm
a real send works, then let the schedule take over.

## The schedule

Set in `.github/workflows/review-automation.yml`:
```yaml
- cron: '0 */6 * * *'
```
This runs every 6 hours, always for real (scheduled runs are never dry-run —
only manual runs default to dry-run for safety). To change frequency, edit
the cron expression — e.g. `0 9 * * *` for once daily at 9am UTC. Push the
change (or edit directly in GitHub's web editor) and it takes effect on the
next scheduled tick.

## About rate limits (why this can't be instant)

Amazon enforces separate, fairly strict rate limits on both the Orders API
and the Solicitations API — roughly 1 request per minute for Orders, ~1 per
second for Solicitations. This script:
- **Caches your order list for 6 hours**, so it doesn't re-paginate hundreds
  of orders on every single run — just checks the cache.
- **Paces requests** (about 1.2s between calls) to stay under Solicitations'
  limit.
- **Retries automatically with backoff** if it does hit a quota wall, rather
  than crashing the run.

For a backlog of hundreds of orders on the very first run, expect it to take
a while (the 6-hour schedule naturally spreads this out — first run clears
what it can, next scheduled run picks up the rest, dedup log means nothing
gets double-sent).

## Verifying what's been sent

Open your GitHub Pages log URL any time. It shows:
- Last run time, orders sent, errors, total sent all-time
- A searchable table of every order ID that got a request, with timestamp
- Search by order ID to confirm a specific one went through

## Notes

- **Amazon only.** Flipkart and Meesho have no equivalent seller-triggered
  review-request API.
- If a run ever needs a fresh order list instead of the 6-hour cache,
  trigger it manually from the Actions tab and it'll refresh automatically
  once the cache expires — no manual cache-clearing needed in normal use.
- Keep the repo **private**. Nothing here is meant to be public.
