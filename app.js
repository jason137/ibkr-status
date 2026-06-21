// ibkr-deploy ops dashboard — static, dependency-free.
//
// Fetches the snapshot the box pushes to S3 and renders it. The page has no
// server: staleness is derived purely from the snapshot's own `generated_at` +
// `stale_after_s`, so a stopped box (self-stops post-close) reads as "stale",
// not "broken". See the ibkr-deploy repo, plan item 18.

// Set this to the Terraform `status_url` output:
//   cd infra/ec2 && terraform output -raw status_url
const STATUS_URL = "https://ibkr-deploy-status-124382933679.s3.us-east-1.amazonaws.com/status.json";

// How often the page re-fetches. Set to match the box's push cadence
// (ibkr-deploy [status] interval_s = 300s) — no point polling faster than the
// box publishes. This is a low-traffic glance page, not a live monitor.
const POLL_MS = 300_000;

const $ = (id) => document.getElementById(id);

// status.json may carry an optional `session` (RTH/pre/post/closed) — see
// plan item 5. Used as staleness context; absent → omitted, behaves as before.
const SESSION_LABELS = { rth: "RTH", pre: "pre-market", post: "post-market", closed: "closed" };
const sessLabel = (s) => SESSION_LABELS[s] ?? s;
const sessDot = (s) => (s === "rth" ? "ok" : s === "pre" || s === "post" ? "warn" : null);

function card(label, value, dotClass) {
  const dot = dotClass ? `<span class="dot ${dotClass}"></span>` : "";
  return `<div class="card"><div class="label">${label}</div>` +
         `<div class="value">${dot}${value}</div></div>`;
}

function fmtAge(s) {
  if (s == null) return "n/a";
  if (s < 90) return `${Math.round(s)}s`;
  if (s < 5400) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(1)}h`;
}

function render(snap) {
  const ageS = (Date.now() - Date.parse(snap.generated_at)) / 1000;
  const stale = ageS > (snap.stale_after_s ?? 900);

  $("updated").textContent =
    `updated ${fmtAge(ageS)} ago · up ${fmtAge(snap.uptime_s)} · ` +
    `${snap.generated_at} · schema v${snap.v}`;

  const banner = $("banner");
  if (stale) {
    const sess = snap.session;
    // Stale snapshot's `session` is as-of generated_at, so it can't *clear* the
    // alarm (a missed restart looks "closed" too) — only soften + caveat it.
    if (sess != null && sess !== "rth") {
      banner.className = "banner muted";
      banner.textContent =
        `snapshot is stale (${fmtAge(ageS)} old) — last report was outside RTH ` +
        `(${sessLabel(sess)}); the box self-stops then. Investigate if it's now RTH.`;
    } else {
      banner.className = "banner stale";
      const tail = sess === "rth"
        ? " during RTH — the box may be down, investigate."
        : " — the box may be stopped (it self-stops outside market hours).";
      banner.textContent = `⚠ snapshot is stale (${fmtAge(ageS)} old)${tail}`;
    }
  } else {
    banner.className = "banner";
    banner.textContent = "";
  }

  const g = snap.gateway || {};
  // When the whole snapshot is stale, health dots go warn (unknown), not green.
  const rd = stale ? "warn" : snap.redis?.ok ? "ok" : "bad";

  // Gateway: the login probe (g.logged_in) is true auth state, stronger than
  // bare TCP reachability — "reachable" only means the port is open. When the
  // probe confirms login we show green even if the feed is idle (off-hours).
  // logged_in null/absent (probe off or older snapshot) → fall back to reach.
  let gwVal, gwDot;
  if (stale) {
    gwVal = g.reachable ? "reachable" : "down";
    gwDot = "warn";
  } else if (!g.reachable) {
    gwVal = "down"; gwDot = "bad";
  } else if (g.logged_in === true) {
    gwVal = "logged in"; gwDot = "ok";
  } else if (g.logged_in === false) {
    gwVal = "no login"; gwDot = "bad";        // port open but not authenticated
  } else {
    gwVal = "reachable"; gwDot = g.data_fresh ? "ok" : "warn";
  }

  const health = [
    card("Gateway", gwVal, gwDot),
    card("Data feed", g.data_fresh ? "fresh" : "idle", stale ? "warn" : g.data_fresh ? "ok" : "warn"),
    card("Last bar", fmtAge(g.last_bar_age_s), null),
    card("Redis", snap.redis?.ok ? "ok" : "down", rd),
  ];
  // Optional session card (RTH/pre/post/closed) for staleness context. Uptime
  // lives in the header subline, keeping this an even 4-card row.
  if (snap.session != null) {
    health.push(card("Session", sessLabel(snap.session), sessDot(snap.session)));
  }
  $("health").innerHTML = health.join("");

  const c = snap.counts || {};
  $("counts").innerHTML = [
    card("Orders", c.orders ?? 0),
    card("Fills", c.fills ?? 0),
    card("Cancels", c.cancels ?? 0),
    card("Rejects", c.rejects ?? 0, (c.rejects ?? 0) > 0 ? "warn" : null),
  ].join("");
}

function renderError(msg) {
  const banner = $("banner");
  banner.className = "banner err";
  banner.textContent = `✗ could not load status.json — ${msg}`;
  $("updated").textContent = "no data";
}

async function tick() {
  try {
    // cache-bust so a polling page never sticks on a CDN-cached snapshot.
    const res = await fetch(`${STATUS_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    render(await res.json());
  } catch (e) {
    renderError(e.message);
  }
}

tick();
setInterval(tick, POLL_MS);
