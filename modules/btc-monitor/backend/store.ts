import { beijingStart } from "../intraday.ts";
import { CALENDAR_SOURCES } from "./calendar.ts";
import { sql } from "@aihot/backend/db";
import { METRICS, GROUPS } from "../catalog.ts";
import { SOURCES } from "./collectors.ts";
import { analyze, dailyValues, percentile, flowBaseline, change } from "./analysis.ts";
import type { CalendarEvent, CalendarView, MetricView, PublicMonitor, SourceView } from "../contracts.ts";
export async function readMonitor(now = new Date()): Promise<PublicMonitor> {
  const rows = await sql<
    { metric: string; value: number; observed_at: Date; collected_at: Date }[]
  >`SELECT * FROM (SELECT DISTINCT ON (metric, (observed_at AT TIME ZONE 'UTC')::date) metric,value,observed_at,collected_at FROM btc_observations WHERE observed_at >= ${new Date(now.getTime() - 180 * 86400000)} AND observed_at < ${new Date(now.getTime() - 8 * 86400000)} ORDER BY metric, (observed_at AT TIME ZONE 'UTC')::date, observed_at DESC) daily UNION ALL SELECT metric,value,observed_at,collected_at FROM btc_observations WHERE observed_at >= ${new Date(now.getTime() - 8 * 86400000)} AND observed_at <= ${now} ORDER BY observed_at`;
  const metrics: MetricView[] = METRICS.map((spec) => {
    const points = rows.filter((r) => r.metric === spec.key);
    const latest = points.at(-1);
    const metric: MetricView = {
      ...spec,
      value: latest?.value ?? null,
      at: latest?.observed_at.toISOString() ?? null,
      collectedAt: latest?.collected_at.toISOString() ?? null,
      quality: !latest
        ? "missing"
        : (spec.source === "intraday" && beijingStart(latest.observed_at.getTime()) !== beijingStart(now.getTime())) || now.getTime() - latest.observed_at.getTime() >
            spec.maxAgeHours * 3600000
          ? "stale"
          : "fresh",
      history: points.map((p) => ({
        at: p.observed_at.toISOString(),
        value: p.value,
      })),
      percentile: null,
    };
    const days = dailyValues(metric);
    metric.percentile = latest && spec.source !== "intraday"
      ? percentile(days.slice(0, -1), latest.value)
      : null;
    return metric;
  });
  const health = await sql<
    {
      id: string;
      checked_at: Date | null;
      succeeded_at: Date | null;
      error: string | null;
    }[]
  >`SELECT * FROM btc_sources`;
  const sources: SourceView[] = [...SOURCES, ...CALENDAR_SOURCES].map((s) => {
    const h = health.find((h) => h.id === s.id);
    return {
      id: s.id,
      name: s.name,
      url: s.url,
      intervalMinutes: s.intervalMinutes,
      checkedAt: h?.checked_at?.toISOString() ?? null,
      succeededAt: h?.succeeded_at?.toISOString() ?? null,
      error: h?.error ?? null,
    };
  });
  const snapshots = await sql<{ source: string; events: CalendarEvent[]; collected_at: Date }[]>`SELECT * FROM btc_calendar_snapshots`;
  const easternToday = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/New_York" }).format(now);
  const calendars: CalendarView[] = CALENDAR_SOURCES.map((source) => {
    const snapshot = snapshots.find((s) => s.source === source.id);
    return {
      source: source.id,
      updatedAt: snapshot?.collected_at.toISOString() ?? null,
      quality: !snapshot ? "missing" : now.getTime() - snapshot.collected_at.getTime() > 48 * 3600000 ? "stale" : "fresh",
      events: (snapshot?.events ?? []).filter((e) => e.at ? Date.parse(e.at) >= now.getTime() : e.date >= easternToday)
        .sort((a, b) => a.date.localeCompare(b.date) || (a.at ?? "").localeCompare(b.at ?? "")).slice(0, 3),
    };
  });
  const signals = analyze(metrics);
  const groups: Record<string, string[]> = {
    资金需求: ["weakening", "improving"],
    宏观环境: ["macro-pressure"],
    杠杆拥挤: ["crowded-long", "crowded-short"],
    流动性风险: ["thin-liquidity", "depeg-usdt", "depeg-usdc"],
  };
  const states = GROUPS.filter((group) => group !== "链上持币结构" && group !== "当天行情").map((group) => {
    const relevant = metrics.filter((m) => m.group === group),
      fresh = relevant.filter((m) => m.quality === "fresh").length;
    const relevantSignals = signals.filter((s) =>
      (groups[group] ?? []).includes(s.key),
    );
    const active = relevantSignals.filter((s) => s.ready && s.active);
    let state = active.length
      ? active.map((s) => s.title).join("；")
      : fresh === 0
        ? "数据不足"
        : relevantSignals.some((s) => !s.ready)
          ? "部分数据或基线不足"
          : "未触发观察条件";
    if (group === "趋势与波动") {
      const r = metrics.find((m) => m.key === "return7"),
        ma = metrics.find((m) => m.key === "ma20gap");
      state =
        r?.quality === "fresh" && ma?.quality === "fresh"
          ? r.value! > 0 && ma.value! > 0
            ? "趋势偏强"
            : r.value! < 0 && ma.value! < 0
              ? "趋势偏弱"
              : "趋势分化"
          : "数据不足";
    }
    let detail = `${fresh}/${relevant.length} 项数据在有效期内；公开状态为当前观测，持续确认结果仅后台可见。`;
    if (group === "资金需求") {
      const ratio = metrics.find((m) => m.key === "cvd7Ratio");
      const baseline = flowBaseline(ratio);
      state = !baseline || ratio?.value == null
        ? "买卖占比数据或基线不足"
        : Math.abs(ratio.value) <= baseline.band
          ? "现货主动买卖较均衡"
          : ratio.value < 0 ? "现货主动卖出占优" : "现货主动买入占优";
      const supply = change(metrics.find((m) => m.key === "stableSupply"), 7);
      detail += ` 买卖占比中性区间：${baseline ? `±${baseline.band.toFixed(3)}%` : "积累中"}；稳定币供给 7 日变化：${supply === null ? "数据不足" : `${supply.toFixed(2)}%`}。`;
    }
    return {
      group,
      state,
      detail,
    };
  });
  return {
    calendars,
    generatedAt: now.toISOString(),
    enabled: process.env.BTC_MONITOR_ENABLED === "true",
    metrics,
    sources,
    states,
    coverage: `${metrics.filter((m) => m.quality === "fresh").length}/${metrics.length} 项数据有效`,
    limitations: [
      "公开页提供当天行情与中期背景，原有告警仍面向数天至数周；未读取账户，不执行交易。",
      "单交易所指标不能代表全市场。历史分位需至少 60 个完整日样本；OI 变化需积累 7 天。",
      "ETF 网页可能不可访问或披露不完整；缺失不作零处理。宏观指标有公布滞后，历史首次采入时间不等于原始公布时间。",
      "重大新闻仍通过现有资讯信源阅读，本版不把未经确认的新闻标题自动转为合约建议；宏观日历每 12 小时同步官方日程，超过 48 小时标记过期，日程可能调整。",
    ],
  };
}
