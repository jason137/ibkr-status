# ibkr-status — plan

Static, dependency-free ops dashboard for `ibkr-deploy` (its plan item
18). Scope is deliberately tiny: fetch `status.json` from S3, render
health + counts, derive staleness client-side. No backend, no PnL.
Live: `https://jason137.github.io/ibkr-status/`

## Open

No open items in this repo — the page is fully shipped. The one remaining
dependency (the box emitting an optional `session` field) lives in
`ibkr-deploy`'s plan as item 18.1; the render side here is already done.

## Escalation Triggers

MVP is the static page as-is. Add complexity only on a concrete failure:

- **Stale banner cries wolf outside RTH** → land the session flag (deploy
  side, tracked in `ibkr-deploy` as 18.1; render side already done here) so
  expected post-close staleness reads as context, not an alarm.
- **Stale-snapshot session false-reassures during a missed restart** (last
  report says "closed", but it's now RTH and the box never came back) →
  current render only *softens* the banner, never clears it, for exactly
  this reason. If a hard "overdue, investigate" verdict is needed, add a
  forward-looking `next_open` to the snapshot and gate it on `now >=
  next_open` (valid even after the snapshot goes stale).
- **Page sticks on a cached snapshot** → already mitigated by cache-bust
  query param; escalate to cache-control headers on the S3 object only
  if staleness still misreports.
- **Multiple boxes / strategies to monitor** → only then introduce a
  multi-snapshot index; until then a single `status.json` is enough.

## Completed

The dashboard is built and live at `https://jason137.github.io/ibkr-status/`:
a static page that fetches `status.json` from the deployed S3 sink
(`STATUS_URL` wired), renders Services + Market data + Counts as card rows
(Gateway/Redis grouped as dependencies; Data feed/Last bar/Session as data
flow), and derives
staleness client-side from `generated_at` + `stale_after_s`. The Gateway card
shows true auth state from the read-only IB login handshake (`gateway.logged_in`
→ "logged in" / "no login", falling back to reachability), alongside a graceful
optional `session`/RTH flag + softened stale banner that no-op until the box
emits the field. GoatCounter page-load analytics (dashboard-only, no on-page
counter). Git repo initialized (secret-checked, `.claude/` gitignored) and
published to `jason137/ibkr-status` with GitHub Pages enabled (`main`/root);
README wrapped to 78 chars. UI polish: card values kept on one line, Uptime
moved to the header subline for even rows.
