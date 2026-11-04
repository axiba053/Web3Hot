import type { MetricView, Signal } from "../contracts.ts";
import { change, flowBaseline } from "../statistics.ts";
export { change, flowBaseline } from "../statistics.ts";
export function dailyValues(metric: MetricView) {
  const days = new Map<string, number>();
  for (const p of metric.history) days.set(p.at.slice(0, 10), p.value);
  return [...days.values()];
}
export function percentile(history: number[], value: number): number | null {
  if (history.length < 60) return null;
  return (
    (100 *
      (history.filter((v) => v < value).length +
        history.filter((v) => v === value).length / 2)) /
    history.length
  );
}
function previousDayDelta(metric: MetricView | undefined): number | null {
  if (!metric?.at || metric.quality !== "fresh" || metric.value === null) return null;
  const target = Date.parse(metric.at) - 86400000;
  const prior = metric.history.find((p) => Date.parse(p.at) === target);
  return prior ? metric.value - prior.value : null;
}
export function analyze(metrics: MetricView[]): Signal[] {
  const get = (key: string) => metrics.find((m) => m.key === key);
  const val = (key: string) => {
    const m = get(key);
    return m?.quality === "fresh" ? m.value : null;
  };
  const ready = (keys: string[]) => keys.every((k) => val(k) !== null);
  const r = val("return7"),
    ma = val("ma20gap"),
    cvd = val("cvd7Ratio");
  const flow = flowBaseline(get("cvd7Ratio"));
  const dr = previousDayDelta(get("return7")),
    dma = previousDayDelta(get("ma20gap")),
    dflow = previousDayDelta(get("cvd7Ratio"));
  const trendReady = ready(["return7", "ma20gap", "cvd7Ratio"]) &&
    new Set(["return7", "ma20gap", "cvd7Ratio"].map((k) => get(k)?.at)).size === 1 &&
    flow !== null && dr !== null && dma !== null && dflow !== null;
  const flowEvidence = [
    `买卖占比中性区间：${flow ? `±${flow.band.toFixed(4)}%（此前 ${flow.samples} 个日样本）` : "历史基线不足"}`,
    `较前一完整日变化：7 日收益 ${dr?.toFixed(4) ?? "缺失"}、均价偏离 ${dma?.toFixed(4) ?? "缺失"}、买卖占比 ${dflow?.toFixed(4) ?? "缺失"} 个百分点`,
  ];
  const stable = change(get("stableSupply"), 7),
    oi = change(get("oi"), 7);
  const dollar = change(get("dollar"), 7),
    rates = change(get("dfii10"), 7),
    nominal = change(get("dgs2"), 7);
  const macroReady = dollar !== null && rates !== null && nominal !== null;
  // Compare yield levels directly: percentage changes are misleading around negative real rates.
  const rose = (key: string) => {
    const m = get(key)!;
    const p = m.history
      .filter((p) => Date.parse(p.at) <= Date.parse(m.at!) - 7 * 86400000)
      .at(-1);
    return p ? m.value! > p.value : false;
  };
  const macroTight =
    macroReady && dollar! > 0 && (rose("dgs2") || rose("dfii10"));
  const funding = get("funding");
  const f = val("funding");
  const rank = funding?.percentile ?? null;
  const evidence = (keys: string[]) =>
    keys.map((k) => {
      const m = get(k);
      return `${m?.name ?? k}：${m?.value === null ? "缺失" : m?.value?.toFixed(4)} ${m?.unit ?? ""}（${m?.at ?? "无时间"}）`;
    });
  const signals: Signal[] = [
    {
      key: "weakening",
      title: "趋势继续恶化且主动卖出占优",
      severity: "warning",
      ready: trendReady && stable !== null,
      active: trendReady && r! < 0 && ma! < 0 && cvd! < -flow!.band &&
        dr! < 0 && dma! < 0 && dflow! < 0 && stable !== null && stable < 0,
      evidence: [...evidence(["return7", "ma20gap", "cvd7Ratio", "stableSupply"]), ...flowEvidence],
      advice: "考虑降低多头敞口和杠杆，暂缓逆势加仓；这不是立即开空指令。",
    },
    {
      key: "improving",
      title: "趋势继续改善且主动买入占优",
      severity: "warning",
      ready:
        trendReady && ready(["funding"]) &&
        stable !== null &&
        macroReady &&
        rank !== null,
      active:
        trendReady &&
        r! > 0 &&
        ma! > 0 &&
        cvd! > flow!.band &&
        dr! > 0 && dma! > 0 && dflow! > 0 &&
        stable! > 0 &&
        !macroTight &&
        rank! < 90,
      evidence: [...evidence([
        "return7",
        "ma20gap",
        "cvd7Ratio",
        "stableSupply",
        "funding",
      ]), ...flowEvidence],
      advice:
        "若持有空头，可复核并考虑减少逆势敞口；多头等待入场条件确认，改善状态不构成加杠杆依据。",
    },
    {
      key: "macro-pressure",
      title: "美元与利率压力上升，BTC 趋势偏弱",
      severity: "warning",
      ready: macroReady && ready(["return7", "ma20gap"]),
      active: macroTight && r! < 0 && ma! < 0,
      evidence: evidence(["dollar", "dgs2", "dfii10", "return7"]),
      advice:
        "考虑收缩多头杠杆，等待宏观压力缓和与价格企稳，避免仅因价格回落而补仓。",
    },
    {
      key: "crowded-long",
      title: "永续多头拥挤风险",
      severity: "warning",
      ready: f !== null && rank !== null && oi !== null && r !== null,
      active: f! > 0 && rank! >= 90 && oi! > 0 && r! > 0,
      evidence: [
        ...evidence(["funding", "oi", "return7"]),
        `费率历史分位 ${rank?.toFixed(1) ?? "积累中"}%；OI 7 日变化 ${oi?.toFixed(2) ?? "积累中"}%`,
      ],
      advice:
        "考虑降低多头杠杆，避免追涨；拥挤不等于价格即将反转，不据此单独开空。",
    },
    {
      key: "crowded-short",
      title: "永续空头拥挤风险",
      severity: "warning",
      ready: f !== null && rank !== null && oi !== null && r !== null,
      active: f! < 0 && rank! <= 10 && oi! > 0 && r! < 0,
      evidence: [
        ...evidence(["funding", "oi", "return7"]),
        `费率历史分位 ${rank?.toFixed(1) ?? "积累中"}%；OI 7 日变化 ${oi?.toFixed(2) ?? "积累中"}%`,
      ],
      advice: "考虑降低空头杠杆，避免追空；关注反弹挤空风险，不据此单独抄底。",
    },
  ];
  for (const key of ["usdt", "usdc"])
    signals.push({
      key: `depeg-${key}`,
      title: `${key.toUpperCase()} 美元报价持续偏离`,
      severity: "critical",
      ready: val(key) !== null,
      active: Math.abs(val(key)! - 1) >= 0.01,
      evidence: evidence([key]),
      advice:
        "核查发行商赎回与其他交易场所报价，考虑降低使用该稳定币作保证金的敞口；单平台偏离尚不能确认系统性脱锚。",
    });
  const depth = get("depth"),
    spread = get("spread");
  signals.push({
    key: "thin-liquidity",
    title: "可见盘口变薄且交易价差扩大",
    severity: "warning",
    ready:
      ready(["depth", "spread"]) &&
      depth?.percentile != null &&
      spread?.percentile != null,
    active:
      depth?.percentile != null &&
      depth.percentile <= 10 &&
      spread?.percentile != null &&
      spread.percentile >= 90,
    evidence: evidence(["depth", "spread"]),
    advice:
      "考虑降低总体杠杆和单次下单规模，避免使用大额市价单；该信号不判断涨跌方向。",
  });
  return signals;
}
