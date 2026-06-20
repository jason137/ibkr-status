# ibkr-status — plan

Static, dependency-free ops dashboard for `ibkr-deploy` (its plan item
18). Scope is deliberately tiny: fetch `status.json` from S3, render
health + counts, derive staleness client-side. No backend, no PnL.

| ID | Description | Status |
|----|-------------|--------|
| 1  | Static page: fetch `status.json`, render health/counts, poll | ✅ |
| 2  | Client-side staleness from `generated_at` + `stale_after_s` | ✅ |
| 3  | Wrap README to 78 chars | ✅ |
| 4  | Set real `STATUS_URL` from Terraform `status_url` output (blocked on `ibkr-deploy` S3 sink deploy) |  |
| 5  | RTH/session flag in stats display — graceful render of optional `session` (`rth`/`pre`/`post`/`closed`): Session card + softened stale banner. No-op when field absent | ✅ |
| 6  | Wire `session` into the deploy app — add the field to `ibkr-deploy` `status.py` schema + populate it in the status sidecar (the box already knows the schedule; it self-stops on it). Additive, no `v` bump. Until then item 5 renders nothing | |
| 7  | Page-load analytics — GoatCounter tag in `index.html` (counts human visits, not polls), wired to `jason137`. Dashboard-only, no on-page counter | ✅ |
| 8  | Init git repo (secret-checked, `.claude/` gitignored), initial commit | ✅ |
| 9  | Render `gateway.logged_in` (read-only IB handshake = true auth state, vs `reachable` = port open): "logged in" / "no login" / fall back to reachability when null. Graceful when absent | ✅ |

## Escalation Triggers

MVP is the static page as-is. Add complexity only on a concrete failure:

- **Stale banner cries wolf outside RTH** → land items 5–6 (session flag)
  so expected post-close staleness reads as context, not an alarm.
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
