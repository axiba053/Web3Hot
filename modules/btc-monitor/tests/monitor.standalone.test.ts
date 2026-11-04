import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseCandles,
  parseFunding,
  parseFred,
  parseEtf,
} from "../backend/collectors.ts";
import { analyze, percentile } from "../backend/analysis.ts";
import { METRICS } from "../catalog.ts";
import { publishBtcMonitor } from "@aihot/backend/publication/btc-monitor";
import type { MetricView, PublicMonitor } from "../contracts.ts";

test("closed candles only, missing days do not manufacture returns", () => {
  const start = Date.UTC(2026, 0, 1),
    day = 86400000;
  const rows = Array.from({ length: 100 }, (_, i) => [
    start + i * day,
    100,
    101,
    99,
    100 + i,
    1,
    start + (i + 1) * day - 1,
    100,
    1,
    1,
    70,
  ]);
  const now = new Date(start + 99 * day + 1000);
  const points = parseCandles(JSON.stringify(rows), now);
  assert.equal(
    points.filter((p) => p.key === "return7").at(-1)?.value,
    (198 / 191 - 1) * 100,
  );
  assert(points.every((p) => Date.parse(p.at) < now.getTime()));
  assert.equal(
    parseCandles(JSON.stringify(rows.filter((_, i) => i !== 80)), now)
      .filter((p) => p.key === "return7")
      .at(-1)?.at,
    new Date(start + 80 * day - 1).toISOString(),
  );
});
test("funding uses realized rate and actual settlement interval", () => {
  const out = parseFunding(
    JSON.stringify({
      code: "0",
      data: [
        { fundingTime: "28800000", realizedRate: ".0002" },
        { fundingTime: "0", realizedRate: ".0001" },
        { fundingTime: "43200000", realizedRate: ".0001" },
      ],
    }),
  );
  assert.deepEqual(
    out.map((p) => p.value),
    [0.02, 0.02],
  );
});
test("missing macro or partial ETF data is never zero", () => {
  assert.deepEqual(
    parseFred(
      "observation_date,DGS2\n2026-10-01,4.1\n2026-10-02,\n2026-10-03,.",
      "dgs2",
    ).map((p) => p.value),
    [4.1],
  );
  assert.throws(() => parseFred("<html>blocked</html>", "dgs2"));
  const html =
    "<table><tr><th>Date</th><th>A</th><th>B</th><th>Total</th></tr><tr><td>23 Oct 2026</td><td>2</td><td>(3)</td><td>(1)</td></tr><tr><td>26 Oct 2026</td><td>2</td><td>-</td><td>2</td></tr></table>";
  assert.deepEqual(
    parseEtf(html).map((p) => p.value),
    [-1],
  );
  assert.throws(() => parseEtf("<html>Access denied</html>"));
});
test("flat history is neutral and warmup is explicit", () => {
  assert.equal(percentile(Array(59).fill(1), 1), null);
  assert.equal(percentile(Array(60).fill(1), 1), 50);
});
const metrics = (): MetricView[] =>
  METRICS.map((m) => ({
    ...m,
    value: null,
    at: null,
    collectedAt: null,
    quality: "missing",
    history: [],
    percentile: null,
  }));
test("OI is not directional alone; stale observations cannot trigger advice", () => {
  const m = metrics();
  const set = (key: string, value: number, percentile: number | null = null) =>
    Object.assign(
      m.find((m) => m.key === key)!,
      { value, at: "2026-10-26T12:00:00Z", quality: "fresh", percentile },
    );
  set("oi", 120);
  m.find((m) => m.key === "oi")!.history = [
    { at: "2026-10-19T12:00:00Z", value: 100 },
  ];
  assert.equal(analyze(m).find((s) => s.key === "crowded-long")!.ready, false);
  set("funding", 0.04, 95);
  set("return7", 8);
  assert.equal(analyze(m).find((s) => s.key === "crowded-long")!.active, true);
  m.find((m) => m.key === "funding")!.quality = "stale";
  assert.equal(analyze(m).find((s) => s.key === "crowded-long")!.ready, false);
});
test("public projection never leaks advice, alerts or raw source errors", () => {
  const data = {
    generatedAt: "2026-10-26",
    enabled: true,
    metrics: metrics(),
    states: [],
    sources: [
      {
        id: "x",
        name: "x",
        url: "https://example.com",
        intervalMinutes: 1,
        checkedAt: null,
        succeededAt: null,
        error: "secret internal detail",
      },
    ],
    coverage: "0/19",
    calendars: [{ source: "cpiCalendar", updatedAt: null, quality: "missing", events: [
      { title: "CPI", date: "2026-11-10", at: "2026-11-10T13:30:00Z", reference: "October 2026", ...{ internal: "private" } },
    ], ...{ internal: "private" } }], limitations: [],
    advice: "private",
    alerts: ["private"],
  } as PublicMonitor;
  const out = JSON.stringify(publishBtcMonitor(data));
  assert(!out.includes("private"));
  assert(!out.includes("secret internal detail"));
  assert(out.includes("最近采集失败"));
});

test("flow baseline excludes current/future days, needs 60 distinct days and positive volume", async () => {
  const { flowBaseline } = await import("../backend/analysis.ts");
  const metric = metrics().find((m) => m.key === "cvd7Ratio")!;
  Object.assign(metric, { at: "2026-10-26T23:59:59.999Z", quality: "fresh", value: 99 });
  metric.history = Array.from({ length: 60 }, (_, i) => ({
    at: new Date(Date.parse(metric.at!) - (i + 1) * 86400000).toISOString(), value: i % 2 ? -2 : 2,
  }));
  metric.history.push({ at: metric.at!, value: 99 }, { at: "2026-10-27T23:59:59.999Z", value: 100 });
  assert.deepEqual(flowBaseline(metric), { band: 2, samples: 60 });
  metric.history.push({ ...metric.history[0] });
  assert.deepEqual(flowBaseline(metric), { band: 2, samples: 60 });
  metric.history = metric.history.slice(1, 60);
  assert.equal(flowBaseline(metric), null);
  metric.history = Array.from({ length: 60 }, (_, i) => ({
    at: new Date(Date.parse(metric.at!) - (i + 1) * 86400000).toISOString(), value: 0,
  }));
  assert.equal(flowBaseline(metric), null);
  const rows = Array.from({ length: 32 }, (_, i) => [i * 86400000, 100, 100, 100, 100, 0, (i + 1) * 86400000 - 1, 0, 0, 0, 0]);
  assert(!parseCandles(JSON.stringify(rows), new Date(33 * 86400000)).some((p) => p.key === "cvd7Ratio"));
  for (const row of rows) { row[7] = 100; row[10] = 70; }
  assert.equal(parseCandles(JSON.stringify(rows), new Date(33 * 86400000)).find((p) => p.key === "cvd7Ratio")!.value, 40);
});

test("near-balanced real sample and weak-but-improving prices cannot signal deterioration", () => {
  const m = metrics();
  const at = "2026-10-26T23:59:59.999Z";
  const set = (key: string, value: number, previous: number) => {
    const metric = m.find((m) => m.key === key)!;
    Object.assign(metric, { value, at, quality: "fresh", history: [{ at: "2026-10-25T23:59:59.999Z", value: previous }] });
    return metric;
  };
  const r = set("return7", -2.1819317927, -2.38919);
  const ma = set("ma20gap", -2.3448054601, -2.66068);
  const flow = set("cvd7Ratio", -0.00015499638578, -0.73342096);
  flow.history.push(...Array.from({ length: 89 }, (_, i) => ({ at: new Date(Date.parse(at) - (i + 2) * 86400000).toISOString(), value: i % 2 ? -2 : 2 })));
  set("stableSupply", 99, 100).history = [{ at: "2026-10-19T23:59:59.999Z", value: 100 }];
  const signal = () => analyze(m).find((s) => s.key === "weakening")!;
  assert.equal(signal().ready, true);
  assert.equal(signal().active, false);
  flow.value = -4;
  assert.equal(signal().active, false); // selling alone is not worsening price trend
  r.value = -3; ma.value = -3;
  assert.equal(signal().active, true);
  flow.history[0].value = -5;
  assert.equal(signal().active, false); // sell imbalance is improving
  flow.history[0].value = -0.7;
  flow.at = "2026-10-25T23:59:59.999Z";
  assert.equal(signal().ready, false); // dates must align
});


test("improvement requires aligned strengthening and a non-neutral buyer imbalance", () => {
  const m = metrics();
  const at = "2026-10-26T23:59:59.999Z";
  for (const key of ["return7", "ma20gap", "cvd7Ratio", "stableSupply", "funding", "dollar", "dfii10", "dgs2"]) {
    Object.assign(m.find((m) => m.key === key)!, {
      at, value: 3, quality: "fresh", percentile: 50,
      history: [{ at: "2026-10-25T23:59:59.999Z", value: 1 }, { at: "2026-10-19T23:59:59.999Z", value: 2 }].sort((a, b) => a.at.localeCompare(b.at)),
    });
  }
  m.find((m) => m.key === "dollar")!.value = 1;
  const flow = m.find((m) => m.key === "cvd7Ratio")!;
  flow.history = Array.from({ length: 90 }, (_, i) => ({ at: new Date(Date.parse(at) - (90 - i) * 86400000).toISOString(), value: 2 }));
  const signal = () => analyze(m).find((s) => s.key === "improving")!;
  assert.equal(signal().ready, true);
  assert.equal(signal().active, true);
  flow.value = 0.01;
  assert.equal(signal().active, false);
  flow.value = 3;
  m.find((m) => m.key === "ma20gap")!.value = 0.5;
  assert.equal(signal().active, false);
});

test("plain-language readings explain costs and comparisons without treating missing data as normal", async () => {
  const { metricReading, marketReadings } = await import("../readings.ts");
  const m = metrics();
  const set = (key: string, value: number) => Object.assign(m.find((m) => m.key === key)!, { value, quality: "fresh", at: "2026-10-27T23:59:59.999Z" });
  const funding = set("funding", 0.01);
  assert.match(metricReading(funding).explanation, /多头向空头支付约 1 USDT/);
  funding.value = -0.02;
  assert.match(metricReading(funding).explanation, /空头向多头支付约 2 USDT/);
  funding.quality = "stale";
  assert.match(metricReading(funding).explanation, /已过期/);
  assert.doesNotMatch(metricReading(funding).explanation, /支付/);
  assert.match(metricReading(set("ma20gap", -2)).explanation, /低 2%/);
  const supply = set("stableSupply", 990);
  supply.history = [{ at: "2026-10-20T23:59:59.999Z", value: 1000 }];
  assert.equal(metricReading(supply).value, "-1% / 7 天");
  assert.match(metricReading(supply).explanation, /减少 1%/);
  const data = { metrics: m, states: [] } as unknown as PublicMonitor;
  assert.match(marketReadings(data)[0].state, /暂不能判断/);
  assert.match(marketReadings(data)[1].state, /暂不能判断/);
  const peg = set("usdt", 0.98);
  assert.match(marketReadings(data)[4].state, /偏离需关注/);
  peg.quality = "stale";
  assert.match(marketReadings(data)[4].state, /尚不齐全/);
});

test("flow interpretation retains the neutral band and macro interpretation compares rates even with strong BTC", async () => {
  const { metricReading, marketReadings } = await import("../readings.ts");
  const m = metrics();
  const set = (key: string, value: number) => Object.assign(m.find((m) => m.key === key)!, { value, quality: "fresh", at: "2026-10-27T23:59:59.999Z" });
  const flow = set("cvd7Ratio", -0.000155);
  flow.history = Array.from({ length: 90 }, (_, i) => ({ at: new Date(Date.parse(flow.at!) - (i + 1) * 86400000).toISOString(), value: 2 }));
  assert.match(metricReading(flow).explanation, /±2%/);
  assert.match(metricReading(flow).explanation, /较均衡/);
  set("return7", 5); set("ma20gap", 3);
  for (const key of ["dollar", "dgs2", "dfii10"]) {
    const metric = set(key, 4);
    metric.history = [{ at: "2026-10-20T23:59:59.999Z", value: 3 }];
  }
  const data = { metrics: m, states: [{ group: "宏观环境", state: "未触发观察条件", detail: "" }] } as unknown as PublicMonitor;
  assert.equal(marketReadings(data)[3].state, "美元与利率压力上升");
  m.find((m) => m.key === "dgs2")!.history = [];
  assert.equal(marketReadings(data)[3].state, "宏观压力暂不能判断");
});

test("activity excludes comparison day and range permits breakouts without lookahead", () => {
  const day = 86400000;
  const rows = Array.from({ length: 33 }, (_, i) => [i * day, 100, 110, 90, 100, 1, (i + 1) * day - 1, 100, 1, 1, 50]);
  rows[31][4] = 120; rows[31][2] = 120; rows[31][7] = 200;
  rows[32][4] = 500; rows[32][2] = 500; rows[32][7] = 10000;
  const points = parseCandles(JSON.stringify(rows), new Date(32 * day + 1000));
  const latest = (key: string) => points.filter((p) => p.key === key).at(-1)?.value;
  assert.equal(latest("volumeDay"), 200);
  assert.equal(latest("volumeRatio20"), 2);
  assert.equal(latest("rangeLow20"), 90);
  assert.equal(latest("rangeHigh20"), 110);
  assert.equal(latest("rangePosition20"), 150);
  rows[31][4] = 80; rows[31][3] = 80;
  assert.equal(parseCandles(JSON.stringify(rows), new Date(32 * day + 1000)).filter((p) => p.key === "rangePosition20").at(-1)?.value, -50);
  for (const r of rows) { r[2] = r[3] = r[4] = 100; r[7] = 0; }
  const flat = parseCandles(JSON.stringify(rows), new Date(34 * day));
  assert(!flat.some((p) => ["volumeRatio20", "rangePosition20"].includes(p.key)));
  assert.equal(flat.find((p) => p.key === "rsi14")?.value, 50);
});

test("Wilder RSI smooths gains and losses and restarts after a missing day", () => {
  const day = 86400000;
  const rows = Array.from({ length: 70 }, (_, i) => [i * day, 100, 200, 1, 100 + i, 1, (i + 1) * day - 1, 100, 1, 1, 50]);
  const run = (input: number[][]) => parseCandles(JSON.stringify(input), new Date(71 * day)).filter((p) => p.key === "rsi14");
  assert.equal(run(rows).at(-1)?.value, 100);
  rows[31][4] = 120; // after constant +1 gains, one -10 move: smoothed gains=13/14, losses=10/14
  assert(Math.abs(run(rows).find((p) => p.at === new Date(32 * day - 1).toISOString())!.value - 100 * 13 / 23) < 1e-10);
  const missing = rows.filter((_, i) => i !== 35);
  const reset = run(missing);
  assert(!reset.some((p) => Date.parse(p.at) > 35 * day && Date.parse(p.at) < 67 * day - 1));
  assert.equal(reset.at(-1)?.value, 100);
  for (let i = 0; i < rows.length; i++) rows[i][4] = 100 - i;
  assert.equal(run(rows).at(-1)?.value, 0);
});

test("sentiment preserves provider dates, rejects invalid readings and never changes alerts", async () => {
  const { parseSentiment } = await import("../backend/collectors.ts");
  const payload = (value: unknown) => JSON.stringify({ data: [{ value, timestamp: "1793404800" }], metadata: { error: null } });
  assert.deepEqual(parseSentiment(payload("30")), [{ key: "fearGreed", value: 30, at: "2026-10-31T00:00:00.000Z", source: "sentiment" }]);
  for (const value of [null, "", -1, 101, 1.5]) assert.throws(() => parseSentiment(payload(value)));
  assert.throws(() => parseSentiment('{"data":[],"metadata":{"error":null}}'));
  const m = metrics();
  const before = analyze(m);
  for (const key of ["volumeDay", "volumeRatio20", "rangeLow20", "rangeHigh20", "rangePosition20", "rsi14", "fearGreed"])
    Object.assign(m.find((p) => p.key === key)!, { value: 100, quality: "fresh", at: "2026-10-31T00:00:00.000Z" });
  assert.deepEqual(analyze(m), before);
  const { metricReading } = await import("../readings.ts");
  const sentiment = m.find((p) => p.key === "fearGreed")!;
  sentiment.value = 30;
  sentiment.history = [{ at: "2026-10-24T00:00:00.000Z", value: 40 }];
  assert.match(metricReading(sentiment).explanation, /下降 10 点/);
  sentiment.quality = "stale";
  assert.match(metricReading(sentiment).explanation, /已过期/);
});

test("official calendars preserve date-only FOMC and convert BLS Eastern time across DST", async () => {
  const { parseBlsCalendar, parseFomcCalendar, easternTime } = await import("../backend/calendar.ts");
  const html = '<table class="release-list"><tbody><tr><td>October 2026</td><td>Nov. 6, 2026</td><td>08:30 AM</td></tr></tbody></table>';
  assert.equal(parseBlsCalendar(html, "非农")[0].at, "2026-11-06T13:30:00.000Z");
  assert.equal(easternTime("2026-07-02", 8, 30), "2026-07-02T12:30:00.000Z");
  assert.equal(easternTime("2026-03-08", 8, 30), "2026-03-08T12:30:00.000Z");
  assert.equal(easternTime("2026-11-01", 8, 30), "2026-11-01T13:30:00.000Z");
  assert.throws(() => parseBlsCalendar(html.replace("Nov. 6", "Feb. 30"), "非农"));
  assert.throws(() => parseBlsCalendar("<html>blocked</html>", "非农"));
  const fed = '<div class="panel"><div class="panel-heading">2027 FOMC Meetings</div><div class="fomc-meeting"><div class="fomc-meeting__month">Apr/May</div><div class="fomc-meeting__date">30-1*</div></div></div>';
  const event = parseFomcCalendar(fed)[0];
  assert.equal(event.date, "2027-05-01");
  assert.equal(event.at, null);
  assert.throws(() => parseFomcCalendar(fed.replace("30-1*", "TBD")));
});

test("on-chain series align indexes, exclude incomplete days and never turn missing cohorts into zero", async () => {
  const { parseOnchain, AGE_SERIES } = await import("../backend/onchain.ts");
  const now = new Date("2026-11-01T04:00:00Z");
  const row = (type: string, data: unknown[], start = 10) => ({ type, data, start, end: start + data.length, index: "day1" });
  const rows = [
    row("Date", ["2026-10-30", "2026-10-31", "2026-11-01"]),
    row("Multiple", [1.4, 1.5], 11),
    row("Dollars", [70000, 71000, 72000]),
    ...AGE_SERIES.map(() => row("Percent", [5, 5, 5])),
  ];
  const parse = () => parseOnchain(JSON.stringify(rows), now);
  assert.equal(parse().length, 5);
  assert.equal(parse().find((p) => p.key === "mvrv")?.value, 1.4);
  assert.equal(parse().find((p) => p.key === "supply1y")?.value, 60);
  assert(parse().every((p) => p.at < now.toISOString()));
  rows[3].data[1] = null;
  assert.equal(parse().filter((p) => p.key === "supply1y").length, 1);
  rows[3].data[0] = 101;
  assert.throws(parse);
  rows[3].data[0] = "5";
  assert.throws(parse);
  rows[3].data[0] = 5;
  rows[0].data[0] = "2026-02-30";
  assert.throws(parse);
});

test("intraday aggregates start at Beijing midnight, exclude open candles and stop at gaps", async () => {
  const { parseIntraday, beijingStart, QUARTER } = await import("../intraday.ts");
  const start = Date.parse("2026-10-31T16:00:00Z");
  const row = (i: number) => [start + i * QUARTER, 100, 110, 90, 105, 1, start + (i + 1) * QUARTER - 1, 200];
  const rows = [row(0), row(1), row(2)];
  const now = new Date(start + 2 * QUARTER);
  const points = parseIntraday(JSON.stringify(rows), now);
  assert.equal(beijingStart(start + 4 * 3600000), start);
  assert.equal(points.filter((p) => p.key === "dayReturn").length, 2);
  assert.equal(points.find((p) => p.key === "dayRange")!.value, 20);
  assert.equal(points.filter((p) => p.key === "dayVolume").at(-1)!.value, 400);
  assert.equal(points.filter((p) => p.key === "intradayPrice")[0].at, new Date(start).toISOString());
  assert(points.every((p) => Date.parse(p.at) < now.getTime()));
  const missing = parseIntraday(JSON.stringify([row(0), row(2)]), new Date(start + 3 * QUARTER));
  assert.equal(missing.filter((p) => p.key === "dayReturn").length, 1);
  assert.equal(missing.filter((p) => p.key === "intradayPrice").length, 3);
  assert(!parseIntraday(JSON.stringify([row(1)]), now).some((p) => p.key === "dayReturn"));
  assert.throws(() => parseIntraday(JSON.stringify([row(0), row(0)]), now));
  const bad = row(0); bad[7] = -1;
  assert.throws(() => parseIntraday(JSON.stringify([bad]), now));
});

test("today view cannot borrow yesterday or stale risk evidence, OI requires a nearby midnight reference", async () => {
  const { todayMetric, currentRisks, oiToday, upcomingEvents } = await import("../intraday.ts");
  const at = "2026-11-01T00:00:00.000Z";
  const m = metrics();
  const day = m.find((p) => p.key === "dayReturn")!;
  Object.assign(day, { value: 2, quality: "fresh", at: "2026-10-31T15:59:59.999Z" });
  assert.equal(todayMetric(day, at), false);
  const peg = m.find((p) => p.key === "usdt")!;
  Object.assign(peg, { value: 0.98, quality: "stale", at });
  const data = { metrics: m, generatedAt: at, calendars: [] } as unknown as PublicMonitor;
  assert(!currentRisks(data).risks.some((r) => r.keys.includes("usdt")));
  peg.quality = "fresh";
  assert(currentRisks(data).risks.some((r) => r.keys.includes("usdt")));
  const oi = m.find((p) => p.key === "oi")!;
  Object.assign(oi, { value: 110, quality: "fresh", at, history: [{ at: "2026-10-31T15:30:00Z", value: 100 }] });
  assert(Math.abs(oiToday(oi, at)!.value - 10) < 1e-9);
  oi.history[0].at = "2026-10-31T14:00:00Z";
  assert.equal(oiToday(oi, at), null);
  data.calendars = [{ source: "cpiCalendar", quality: "stale", updatedAt: null, events: [{ title: "CPI", date: "2026-11-02", at: "2026-11-02T13:30:00Z", reference: "" }] }];
  assert.equal(upcomingEvents(data).length, 0);
});
