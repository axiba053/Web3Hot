import { beijingDate, beijingMidnight } from "@aihot/contracts/time";
import type { MetricView, Observation, Point, PublicMonitor } from "./contracts.ts";
export const QUARTER = 15 * 60000;
export function beijingStart(at: string | number): number {
  return beijingMidnight(beijingDate(at)).getTime();
}
export function parseIntraday(text: string, now: Date): Observation[] {
  const input = JSON.parse(text);
  if (!Array.isArray(input)) throw new Error("分时数据格式无效");
  const n = (v: unknown) => {
    if ((typeof v !== "string" && typeof v !== "number") || String(v).trim() === "" || !Number.isFinite(Number(v)))
      throw new Error("分时数值无效");
    return Number(v);
  };
  const rows = input.map((r: unknown[]) => {
    if (!Array.isArray(r) || r.length < 8) throw new Error("分时 K 线格式无效");
    const [start, open, high, low, close, end, volume] = [r[0], r[1], r[2], r[3], r[4], r[6], r[7]].map(n);
    if (start % QUARTER !== 0 || end !== start + QUARTER - 1 ||
        low <= 0 || high < Math.max(open, close) || low > Math.min(open, close) || volume < 0)
      throw new Error("分时 K 线边界无效");
    return { start, open, high, low, close, end, volume };
  }).filter((r) => r.end < now.getTime()).sort((a, b) => a.start - b.start);
  const out: Observation[] = [];
  let day = -1, previous = -1, complete = false, open = 0, high = 0, low = 0, volume = 0;
  const point = (key: string, value: number, at: number) =>
    out.push({ key, value, at: new Date(at).toISOString(), source: "intraday" });
  for (const r of rows) {
    if (r.start === previous) throw new Error("分时 K 线重复");
    const nextDay = beijingStart(r.start);
    if (day !== nextDay) {
      day = nextDay;
      complete = r.start === day;
      open = r.open; high = r.high; low = r.low; volume = 0;
      if (complete) point("intradayPrice", open, day);
    } else if (r.start !== previous + QUARTER) complete = false;
    previous = r.start;
    point("intradayPrice", r.close, r.end);
    if (!complete) continue;
    high = Math.max(high, r.high); low = Math.min(low, r.low); volume += r.volume;
    point("dayReturn", (r.close / open - 1) * 100, r.end);
    point("dayRange", (high - low) / open * 100, r.end);
    point("dayVolume", volume, r.end);
  }
  return out;
}
export function todayMetric(metric: MetricView | undefined, now: string): boolean {
  return metric?.quality === "fresh" && metric.value != null && metric.at != null &&
    beijingStart(metric.at) === beijingStart(now) && metric.at <= now;
}
export function todayPoints(metric: MetricView | undefined, now: string): Point[] {
  const start = beijingStart(now);
  return (metric?.history ?? []).filter((p) => Date.parse(p.at) >= start && p.at <= now);
}
export function oiToday(metric: MetricView | undefined, now: string) {
  if (!todayMetric(metric, now)) return null;
  const start = beijingStart(now);
  const base = metric!.history.filter((p) => Date.parse(p.at) <= start).at(-1);
  if (!base || start - Date.parse(base.at) > 90 * 60000 || base.value <= 0) return null;
  return { value: (metric!.value! / base.value - 1) * 100, at: base.at };
}
export function currentRisks(data: PublicMonitor) {
  const get = (key: string) => data.metrics.find((m) => m.key === key && m.quality === "fresh" && m.value !== null);
  const risks: Array<{ title: string; explanation: string; keys: string[]; urgent: boolean }> = [];
  for (const key of ["usdt", "usdc"]) {
    const m = get(key);
    if (m && Math.abs(m.value! - 1) >= 0.01)
      risks.push({ title: `${key.toUpperCase()} 报价偏离 1% 观察线`, explanation: "单平台美元报价异常，需对照发行方和其他市场核实。", keys: [key], urgent: true });
  }
  const depth = get("depth"), spread = get("spread");
  if (depth?.percentile != null && spread?.percentile != null && depth.percentile <= 10 && spread.percentile >= 90)
    risks.push({ title: "可见盘口变薄，价差扩大", explanation: "可见深度处于历史低 10%，价差处于高 10%，即时交易成本需留意。", keys: ["depth", "spread"], urgent: false });
  const funding = get("funding");
  if (funding?.percentile != null && ((funding.value! > 0 && funding.percentile >= 90) || (funding.value! < 0 && funding.percentile <= 10)))
    risks.push({ title: `资金费率处于历史${funding.value! > 0 ? "高" : "低"}位`, explanation: "落在历史日样本的极端 10% 区间；仅提示持仓成本，不单独确认多空拥挤。", keys: ["funding", "oi"], urgent: false });
  const incomplete = !get("usdt") || !get("usdc") || depth?.percentile == null || spread?.percentile == null || funding?.percentile == null;
  return { risks, incomplete };
}
export function upcomingEvents(data: PublicMonitor) {
  const easternDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/New_York" }).format(new Date(data.generatedAt));
  return data.calendars.filter((c) => c.quality === "fresh").flatMap((c) =>
    c.events.filter((e) => e.at ? e.at >= data.generatedAt : e.date >= easternDate)
      .map((event) => ({ ...event, source: c.source })))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.at ?? "").localeCompare(b.at ?? ""));
}
