import assert from "node:assert/strict";
import { test, after } from "node:test";
import { sql, closeDb } from "@aihot/backend/db";
import {
  updateAlerts,
  deliverEmails,
  collectMonitor,
} from "../backend/worker.ts";
import { installModules } from "@aihot/backend/modules";
import server from "../server.ts";
import { buildApp } from "@aihot/api/app";
import type { Signal } from "../contracts.ts";
after(closeDb);
const signal: Signal = {
  key: "test-risk",
  title: "测试风险",
  severity: "warning",
  ready: true,
  active: true,
  evidence: ["测试证据"],
  advice: "测试建议",
};
const start = new Date("2026-10-26T00:00:00Z");
async function tick(
  signal: Signal,
  minutes: number,
  signature = String(minutes),
) {
  await sql.begin(async (tx) => {
    await updateAlerts(
      tx,
      [signal],
      new Date(start.getTime() + minutes * 60000),
      signature,
    );
  });
}
test("persistent confirmation, no repeat, missing data cannot resolve, recovery requires confirmation", async () => {
  for (let i = 0; i <= 360; i += 15) await tick(signal, i);
  assert.equal(
    (await sql`SELECT * FROM btc_alerts WHERE rule='test-risk'`).length,
    1,
  );
  await tick(signal, 375);
  assert.equal(
    (await sql`SELECT * FROM btc_alerts WHERE rule='test-risk'`).length,
    1,
  );
  await tick({ ...signal, ready: false }, 390);
  assert.equal(
    (await sql`SELECT resolved_at FROM btc_alerts WHERE rule='test-risk'`)[0]
      .resolved_at,
    null,
  );
  for (let i = 405; i <= 765; i += 15)
    await tick({ ...signal, active: false }, i);
  assert(
    (await sql`SELECT resolved_at FROM btc_alerts WHERE rule='test-risk'`)[0]
      .resolved_at,
  );
});
test("duplicate timestamps and collection outages do not confirm urgency", async () => {
  const s = { ...signal, key: "test-urgent", severity: "critical" as const };
  await tick(s, 0, "same");
  await tick(s, 15, "same");
  assert.equal(
    (await sql`SELECT * FROM btc_alerts WHERE rule='test-urgent'`).length,
    0,
  );
  await tick(s, 75, "new");
  assert.equal(
    (await sql`SELECT * FROM btc_alerts WHERE rule='test-urgent'`).length,
    0,
  );
  await tick(s, 90, "new2");
  assert.equal(
    (await sql`SELECT * FROM btc_alerts WHERE rule='test-urgent'`).length,
    1,
  );
});
test("mail accepted once, ambiguous SMTP is not auto-retried", async () => {
  process.env.BTC_EMAIL_ENABLED = "true";
  for (const k of [
    "BTC_SMTP_HOST",
    "BTC_SMTP_USER",
    "BTC_SMTP_PASSWORD",
    "BTC_EMAIL_TO",
  ])
    process.env[k] = "local-test";
  let calls = 0;
  await deliverEmails(
    ["test-urgent"],
    async () => {
      calls++;
      throw new Error("connection dropped");
    },
    new Date(start.getTime() + 100 * 60000),
  );
  assert.equal(calls, 1);
  await deliverEmails(
    ["test-urgent"],
    async () => {
      calls++;
    },
    new Date(start.getTime() + 100 * 60000),
  );
  assert.equal(calls, 1);
  assert.equal(
    (await sql`SELECT delivery FROM btc_alerts WHERE rule='test-urgent'`)[0]
      .delivery,
    "unknown",
  );
  process.env.BTC_EMAIL_ENABLED = "false";
});
test("public API projects public fields, admin API rejects anonymous and CSRF-less writes", async () => {
  installModules([server]);
  const app = await buildApp();
  try {
    const pub = await app.inject("/api/v1/btc-monitor");
    assert.equal(pub.statusCode, 200);
    assert(!pub.body.includes("测试建议"));
    assert(!pub.body.includes("alerts"));
    const admin = await app.inject("/api/admin/btc-monitor");
    assert.equal(admin.statusCode, 401);
    const write = await app.inject({
      method: "POST",
      url: "/api/admin/btc-monitor/delivery",
      payload: { id: 1, action: "retry" },
    });
    assert.equal(write.statusCode, 401);
  } finally {
    await app.close();
    installModules([]);
  }
});
test("collection off never contacts data sources", async () => {
  process.env.BTC_MONITOR_ENABLED = "false";
  let calls = 0;
  await collectMonitor(async () => {
    calls++;
    return "";
  });
  assert.equal(calls, 0);
});

test("authenticated admin sees advice but writes require CSRF", async () => {
  const { config } = await import("@aihot/backend/config");
  const original = {
    dev: config.devAdmin,
    environment: config.environmentName,
  };
  config.devAdmin = { displayName: "Test admin" };
  config.environmentName = "development";
  installModules([server]);
  const app = await buildApp();
  try {
    const response = await app.inject("/api/admin/btc-monitor");
    assert.equal(response.statusCode, 200);
    assert(response.body.includes("测试建议"));
    const noCsrf = await app.inject({
      method: "POST",
      url: "/api/admin/btc-monitor/delivery",
      payload: { id: 1, action: "retry" },
    });
    assert.equal(noCsrf.statusCode, 403);
    const [alert] =
      await sql`SELECT id FROM btc_alerts WHERE rule='test-urgent'`;
    const accepted = await app.inject({
      method: "POST",
      url: "/api/admin/btc-monitor/delivery",
      headers: { "x-csrf-token": "dev" },
      payload: { id: alert.id, action: "sent" },
    });
    assert.equal(accepted.statusCode, 200);
    assert.equal(accepted.json().updated, 1);
  } finally {
    await app.close();
    installModules([]);
    config.devAdmin = original.dev;
    config.environmentName = original.environment;
  }
});

test("collection failures preserve last known data and stale reads are explicit", async () => {
  const { readMonitor } = await import("../backend/store.ts");
  process.env.BTC_MONITOR_ENABLED = "true";
  process.env.COLLECT_ENABLED = "true";
  process.env.BTC_EMAIL_ENABLED = "false";
  let calls = 0;
  await collectMonitor(async (url) => {
    calls++;
    if (url.includes("ticker/24hr"))
      return JSON.stringify({ lastPrice: "80000", closeTime: start.getTime() });
    throw new Error("provider unavailable");
  }, start);
  assert.equal(calls, 19);
  let m = await readMonitor(start);
  assert.equal(m.metrics.find((m) => m.key === "price")!.value, 80000);
  assert.equal(m.metrics.find((m) => m.key === "etf")!.value, null);
  await collectMonitor(
    async () => {
      throw new Error("network down");
    },
    new Date(start.getTime() + 3 * 3600000),
  );
  m = await readMonitor(new Date(start.getTime() + 3 * 3600000));
  assert.equal(m.metrics.find((m) => m.key === "price")!.value, 80000);
  assert.equal(m.metrics.find((m) => m.key === "price")!.quality, "stale");
  assert(m.sources.find((s) => s.id === "spot")!.error);
  process.env.BTC_MONITOR_ENABLED = "false";
});

test("quotes arriving after job start are accepted using response acquisition time", async () => {
  process.env.BTC_MONITOR_ENABLED = "true";
  process.env.COLLECT_ENABLED = "true";
  process.env.BTC_EMAIL_ENABLED = "false";
  const later = new Date(start.getTime() + 86400000);
  await collectMonitor(async (url) => {
    if (url.includes("ticker/24hr")) {
      await new Promise((r) => setTimeout(r, 30));
      return JSON.stringify({
        lastPrice: "81000",
        closeTime: later.getTime() + 20,
      });
    }
    throw new Error("unavailable");
  }, later);
  const [point] =
    await sql`SELECT value FROM btc_observations WHERE metric='price' ORDER BY observed_at DESC LIMIT 1`;
  assert.equal(point.value, 81000);
  process.env.BTC_MONITOR_ENABLED = "false";
});

test("admin distinguishes pending, confirmed, inactive and stale tracking without candidate advice", async () => {
  const { readAdminMonitor } = await import("../server.ts");
  const now = new Date();
  await sql`INSERT INTO btc_observations(metric,observed_at,value,source,collected_at) VALUES('usdt',${now},0.98,'usdt',${now})`;
  const s = { ...signal, key: "depeg-usdt", severity: "critical" as const };
  await sql.begin((tx) => updateAlerts(tx, [s], now, "quote1"));
  let admin = await readAdminMonitor();
  let view = admin.signals.find((s) => s.key === "depeg-usdt")!;
  assert.equal(view.confirmation.status, "pending");
  assert.equal(view.confirmation.samples, 1);
  assert(!("advice" in view));
  assert(!JSON.stringify(admin.signals).includes("考虑"));
  await sql`UPDATE btc_rule_states SET last_checked=${new Date(now.getTime() - 46 * 60000)} WHERE rule='depeg-usdt'`;
  view = (await readAdminMonitor()).signals.find((s) => s.key === "depeg-usdt")!;
  assert.equal(view.confirmation.samples, 0);
  assert.equal(view.confirmation.since, null);
  const before = new Date(now.getTime() - 15 * 60000);
  await sql`UPDATE btc_rule_states SET candidate_since=${before},last_checked=${before} WHERE rule='depeg-usdt'`;
  await sql.begin((tx) => updateAlerts(tx, [s], now, "quote2"));
  admin = await readAdminMonitor();
  view = admin.signals.find((s) => s.key === "depeg-usdt")!;
  assert.equal(view.confirmation.status, "confirmed");
  assert(admin.alerts.some((a) => a.id === view.confirmation.alertId && a.advice === "测试建议"));
  // Missing current observations cannot silently clear a confirmed risk.
  await sql`DELETE FROM btc_observations WHERE metric='usdt'`;
  view = (await readAdminMonitor()).signals.find((s) => s.key === "depeg-usdt")!;
  assert.equal(view.ready, false);
  assert.equal(view.confirmation.status, "confirmed");
});

test("changed trend rules restart confirmation instead of inheriting old candidates", async () => {
  const s = { ...signal, key: "weakening" };
  const now = new Date();
  await sql`INSERT INTO btc_rule_states(rule,candidate_since,last_checked,samples,signature) VALUES('weakening',${new Date(now.getTime() - 8 * 3600000)},${new Date(now.getTime() - 15 * 60000)},20,'old-evidence') ON CONFLICT(rule) DO UPDATE SET candidate_since=excluded.candidate_since,last_checked=excluded.last_checked,samples=excluded.samples,signature=excluded.signature`;
  await sql.begin((tx) => updateAlerts(tx, [s], now, "new-evidence"));
  const [state] = await sql`SELECT * FROM btc_rule_states WHERE rule='weakening'`;
  assert.equal(state.samples, 1);
  assert.equal(state.candidate_since.getTime(), now.getTime());
  assert.equal(state.active_alert, null);
  await sql.begin((tx) => updateAlerts(tx, [s], new Date(now.getTime() + 15 * 60000), "new-evidence"));
  assert.equal((await sql`SELECT samples FROM btc_rule_states WHERE rule='weakening'`)[0].samples, 1);
});

test("calendar refresh replaces changed schedules, failure retains last success, and stale schedules are explicit", async () => {
  const { readMonitor } = await import("../backend/store.ts");
  const { publishBtcMonitor } = await import("@aihot/backend/publication/btc-monitor");
  process.env.BTC_MONITOR_ENABLED = "true";
  process.env.COLLECT_ENABLED = "true";
  process.env.BTC_EMAIL_ENABLED = "false";
  await sql`DELETE FROM btc_sources WHERE id='cpiCalendar'`;
  let day = 10;
  let fail = false;
  const read = async (url: string) => {
    if (!url.endsWith("/cpi.htm") || fail) throw new Error("offline");
    return `<table class="release-list"><tbody><tr><td>October 2026</td><td>Nov. ${day}, 2026</td><td>08:30 AM</td></tr></tbody></table>`;
  };
  await collectMonitor(read, new Date("2026-11-01T00:00:00Z"));
  let calendar = (await readMonitor(new Date("2026-11-01T01:00:00Z"))).calendars.find((c) => c.source === "cpiCalendar")!;
  assert.equal(calendar.events[0].date, "2026-11-10");
  assert.equal(calendar.quality, "fresh");
  day = 12;
  await collectMonitor(read, new Date("2026-11-01T12:00:00Z"));
  calendar = (await readMonitor(new Date("2026-11-01T13:00:00Z"))).calendars.find((c) => c.source === "cpiCalendar")!;
  assert.deepEqual(calendar.events.map((e) => e.date), ["2026-11-12"]);
  const updatedAt = calendar.updatedAt;
  fail = true;
  await collectMonitor(read, new Date("2026-11-02T00:00:00Z"));
  const monitor = publishBtcMonitor(await readMonitor(new Date("2026-11-04T00:00:00Z")));
  assert.equal(monitor.states.length, 5);
  calendar = monitor.calendars.find((c) => c.source === "cpiCalendar")!;
  assert.equal(calendar.quality, "stale");
  assert.equal(calendar.updatedAt, updatedAt);
  assert.equal(calendar.events[0].at, "2026-11-12T13:30:00.000Z");
  assert.equal(monitor.sources.find((s) => s.id === "cpiCalendar")!.error, "最近采集失败");
  assert.equal((await readMonitor(new Date("2026-11-13T00:00:00Z"))).calendars.find((c) => c.source === "cpiCalendar")!.events.length, 0);
});

test("intraday observations expire at Beijing midnight even within the ordinary freshness window", async () => {
  await sql`INSERT INTO btc_observations(metric,observed_at,value,source,collected_at) VALUES('dayReturn','2026-11-30T15:59:59.999Z',1.2,'intraday','2026-11-30T16:00:00Z') ON CONFLICT DO NOTHING`;
  const { readMonitor } = await import("../backend/store.ts");
  const data = await readMonitor(new Date("2026-11-30T16:01:00Z"));
  const metric = data.metrics.find((m) => m.key === "dayReturn")!;
  assert.equal(metric.quality, "stale");
  assert.equal(metric.percentile, null);
  assert.equal(data.states.length, 5);
});
