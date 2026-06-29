# ibkr-status

**What** — a static, backend-free ops dashboard for [`ibkr-deploy`][deploy]
(its plan item 18). It renders eng/ops telemetry — gateway health, uptime,
order/fill/cancel/reject counts. **No PnL or positions.**

**Why** — the box needs an at-a-glance health view, but standing up a server
to show four numbers is overkill and adds its own failure surface. The box
also self-stops outside market hours, so the hard requirement is to tell
*"stopped (expected)"* apart from *"broken"* without anything actively
polling the box.

**How** — a sidecar on the box pushes a small `status.json` to S3; this page
fetches it from GitHub Pages and renders client-side. Staleness is derived
purely from the snapshot's own `generated_at` + `stale_after_s`, so a stopped
box simply reads as **stale**, never as an error.

```
ibkr-deploy box ──PutObject──▶ s3://…/status.json ◀──fetch── this page (github.io)
 (status sidecar)                 (public read)
```

## Architecture & design

- **Backend by omission.** All state is one JSON object on S3. The page is
  pure static files — nothing to run, patch, or pay for; the only surface is
  a public-read object holding non-sensitive ops counts.
- **Self-describing staleness.** The page never contacts the box. It reasons
  only from `generated_at` + `stale_after_s`, which decouples *page* health
  from *box* health: a stopped box is stale, a broken fetch is an error, and
  the two are visually distinct.
- **As-of / causal correctness.** Every field in a *stale* snapshot is
  as-of its `generated_at`, so the page treats stale fields as last-known,
  not current. The `session` flag (below) therefore *softens* the stale
  banner but never *clears* it — a missed restart also looks "closed."
- **Additive schema.** The `status.json` schema is canonical in
  `ibkr-deploy`; new fields are additive and the page degrades gracefully on
  any it doesn't recognize — and on any it expects but a snapshot omits (older
  fields fall back). No version field; the page tolerates field add/drop directly.
- **No stale CDN reads.** Each poll cache-busts (`?t=…`, `no-store`) so a
  polling page can't stick on a cached snapshot.

## Open items

See `docs/plan.md` for the full list. Currently open:

- **Real `STATUS_URL`** — paste the Terraform `status_url` output into
  `app.js` once the `ibkr-deploy` S3 sink is deployed.
- **Wire `session` into the box** — add the optional `session`
  (`rth`/`pre`/`post`/`closed`) field to `ibkr-deploy`'s status schema +
  sidecar. The render side is already live and is a no-op until it lands.
- **Escalation (not built):** a forward-looking `next_open` would let the
  page flag a *missed restart* ("overdue, investigate") rather than only
  softening the banner. Add only if stale-window false-reassurance bites.

## Setup

1. Deploy the S3 sink + IAM from `ibkr-deploy` (`terraform apply` in
   `infra/ec2`), then grab the public URL:
   ```bash
   cd infra/ec2 && terraform output -raw status_url
   ```
2. Paste it into `app.js` → `STATUS_URL`.
3. Push this repo and enable Pages: **Settings → Pages → Deploy from
   branch → `main` / root**. Lives at
   `https://jason137.github.io/ibkr-status/`.
4. Lock CORS to that origin (optional): set `status_allowed_origins`
   in the `ibkr-deploy` tfvars to
   `["https://jason137.github.io"]` and re-apply.
5. Page-load analytics: wired to
   [GoatCounter](https://www.goatcounter.com) (`jason137`) via the
   `data-goatcounter` tag in `index.html`. Counts human visits (one per
   load), not the `status.json` polls; view counts on the GoatCounter
   dashboard (not surfaced on the page).

## Contract

Consumes `status.json`; the canonical schema lives in
`ibkr-deploy` (`src/ibkr/services/status.py`). Current fields:

```json
{ "generated_at": "2026-06-20T14:00:00Z", "stale_after_s": 900,
  "uptime_s": 3600,
  "gateway": {"reachable": true, "logged_in": true, "data_fresh": true, "last_bar_age_s": 45},
  "redis": {"ok": true, "tape_bars": 1234, "clients": 6,
            "consumers": {"ingest": 1, "signal:tape": 1, "signal:fills": 1,
                          "signal:targets": 1, "exec": 1, "status": 1}},
  "counts": {"orders": 3, "fills": 2, "cancels": 1, "rejects": 0} }
```

`gateway.logged_in` is the read-only IB-handshake result (true auth state, vs
`reachable` = port open): `true` → "logged in", `false` → "no login", `null`
→ falls back to reachability. `redis.clients` (total connections) is the
Redis card value; `redis.tape_bars` (summed tape-stream backlog, the "data is
flowing" signal) renders a Tape card. `redis.consumers` (per-connection counts,
grouped by `CLIENT SETNAME`) drives the **Pipeline** row — one card per split leg
with **one dot per consumer connection**: `signal` shows three
(`signal:tape`/`:fills`/`:targets`), `ingest` and `exec` one each. A dead
consumer reads red while its siblings stay green. `status` is excluded — it's the
observer that publishes the snapshot, so its liveness is the page's own freshness.
The row hides if the field is absent. Optional `session` (`"rth"`/`"pre"`/`"post"`/`"closed"`)
renders a Session card and contextualizes the stale banner. All fields are
additive; the page degrades gracefully on any it doesn't recognize or omits.

[deploy]: https://github.com/jason137/ibkr-deploy
