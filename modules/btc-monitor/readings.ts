import type { AdminMonitor, MetricView, PublicMonitor } from "./contracts.ts";
import { change, flowBaseline } from "./statistics.ts";

export function number(value: number, digits = 2): string {
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: digits,
  }).format(value);
}
export function amount(value: number): string {
  if (Math.abs(value) >= 1e8) return `${number(value / 1e8)} 亿`;
  if (Math.abs(value) >= 1e4) return `${number(value / 1e4)} 万`;
  return number(value, Math.abs(value) < 1 ? 6 : 2);
}
export function percent(value: number): string {
  return `${number(value, Math.abs(value) < 0.01 ? 6 : 2)}%`;
}
const fresh = (
  m: MetricView | undefined,
): m is MetricView & { value: number } =>
  m?.quality === "fresh" && m.value !== null;
const labels: Record<string, string> = {
  return7: "过去 7 天涨跌",
  ma20gap: "与 20 日均价的距离",
  cvd7Ratio: "现货买卖力量",
  stableSupply: "稳定币总量变化",
  funding: "多空持仓费用",
  oi: "合约持仓量",
  depth: "可见盘口承接",
  spread: "即时买卖价差",
};
export function metricReading(m: MetricView) {
  const title = labels[m.key] ?? m.name;
  const raw = m.value === null ? "暂无数据" : `${amount(m.value)} ${m.unit}`;
  if (!fresh(m))
    return {
      title,
      value: raw,
      explanation:
        m.quality === "stale"
          ? "数据已过期，暂不用于当前判断。"
          : "尚无可用数据，不能据此判断方向。",
    };
  const v = m.value;
  let value = raw;
  let explanation = m.effect;
  const rank =
    m.percentile === null
      ? "历史样本不足，暂不能判断它处于什么水平。"
      : `历史位置约 ${number(m.percentile, 0)}/100，越接近 100 表示数值相对越高。`;
  switch (m.key) {
    case "mvrv":
      value = `${number(v)} 倍`;
      explanation = `当前市值为已实现市值的 ${number(v)} 倍。${m.effect}`;
      break;
    case "sthCost":
      value = `${number(v)} USD`;
      explanation = "币龄不足 150 天的筹码，其链上成本代理约为此价格。不同于常见的 155 天口径；不直接与实时 USDT 报价计算盈亏。";
      break;
    case "supply1y":
      value = percent(v);
      explanation = `约 ${percent(v)} 的未花费输出供应至少一年未移动。${m.effect}`;
      break;
    case "price":
      explanation = "购买 1 BTC 对应的现货报价。下方涨跌幅按完整日收盘计算。";
      break;
    case "return7":
      value = percent(v);
      explanation =
        v === 0
          ? "最近完整日收盘价与 7 天前相同。"
          : `最近完整日收盘价比 7 天前${v > 0 ? "上涨" : "下跌"} ${percent(Math.abs(v))}。`;
      break;
    case "ma20gap":
      value = percent(v);
      explanation =
        v === 0
          ? "收盘价与最近 20 天的平均收盘价持平。"
          : `收盘价比最近 20 天的平均水平${v > 0 ? "高" : "低"} ${percent(Math.abs(v))}，说明价格仍在均价${v > 0 ? "上" : "下"}方。`;
      break;
    case "volumeDay":
      explanation = "最近完整 UTC 日的现货成交额；每笔成交都有买卖双方，不是净流入。";
      break;
    case "volumeRatio20":
      value = `${number(v)} 倍`;
      explanation = `最近完整日成交额为此前 20 日均值的 ${number(v)} 倍，${v === 1 ? "与均值持平" : v > 1 ? "交易参与高于前期平均" : "交易参与低于前期平均"}；方向需结合主动买卖力量观察。`;
      break;
    case "rangePosition20":
      value = percent(v);
      explanation = `${v > 100 ? "收盘已高于此前 20 日区间上沿" : v < 0 ? "收盘已低于此前 20 日区间下沿" : `收盘位于此前 20 日区间的 ${percent(v)} 位置（下沿 0%，上沿 100%）`}；只描述位置，不保证突破延续或触底反弹。`;
      break;
    case "rsi14":
      value = `${number(v)} / 100`;
      explanation = `${v >= 70 ? "达到常用超买参考区" : v <= 30 ? "达到常用超卖参考区" : "位于常用 30–70 参考区间"}。RSI 描述价格动量，强趋势中可持续处于极端，不是买卖指令。`;
      break;
    case "fearGreed": {
      value = `${number(v, 0)} / 100`;
      const prior = m.history.find((p) => p.at.slice(0, 10) ===
        new Date(Date.parse(m.at!) - 7 * 86400000).toISOString().slice(0, 10));
      explanation = `${prior ? `较 7 天前${v === prior.value ? "持平" : `${v > prior.value ? "上升" : "下降"} ${number(Math.abs(v - prior.value), 0)} 点`}。` : "尚缺 7 天前的情绪对照。"}数值越低越偏恐惧，越高越偏贪婪；含量价成分，不是独立的顶部或底部信号。`;
      break;
    }
    case "cvd7Ratio": {
      value = percent(v);
      const baseline = flowBaseline(m);
      explanation = baseline
        ? `中性范围为 ±${percent(baseline.band)}。${Math.abs(v) <= baseline.band ? "当前处于范围内，主动买卖力量较均衡。" : `已超出范围，主动${v > 0 ? "买入" : "卖出"}占优。`}`
        : "历史样本不足，尚不能区分普通波动与明显买卖倾斜。";
      break;
    }
    case "cvd7":
      explanation = `过去 7 天主动${v >= 0 ? "买入" : "卖出"}比另一侧多 ${amount(Math.abs(v))} USDT；是否明显需结合成交额占比。`;
      break;
    case "stableSupply": {
      const delta = change(m, 7);
      if (delta !== null)
        value = `${delta > 0 ? "+" : ""}${percent(delta)} / 7 天`;
      explanation =
        delta === null
          ? `当前总量 ${amount(v)} USD，尚缺 7 天前的可比数据。`
          : `总量 ${amount(v)} USD，近 7 天${delta === 0 ? "持平" : `${delta > 0 ? "增加" : "减少"} ${percent(Math.abs(delta))}`}。总量变化反映潜在资金容量，并不等于买入 BTC 的金额。`;
      break;
    }
    case "funding":
      value = `${percent(v)} / 8 小时`;
      explanation =
        v === 0
          ? "该次费率为零，多空双方无资金费支付。"
          : `每 1 万 USDT 名义仓位，折算每 8 小时${v > 0 ? "多头向空头" : "空头向多头"}支付约 ${number(Math.abs(v) * 100, 4)} USDT。${rank}`;
      break;
    case "oi": {
      const delta = change(m, 7);
      explanation =
        delta === null
          ? "当前未平仓合约的 BTC 数量；7 天对照数据还在积累，暂不能判断是否增仓。"
          : `近 7 天持仓量${delta === 0 ? "持平" : `${delta > 0 ? "增加" : "减少"} ${percent(Math.abs(delta))}`}。增仓只说明参与增加，需结合费率判断多空拥挤。`;
      break;
    }
    case "premium":
      value = percent(v);
      explanation = `永续合约价格比现货指数${v >= 0 ? "高" : "低"} ${percent(Math.abs(v))}，表示合约相对${v >= 0 ? "偏贵" : "偏便宜"}。`;
      break;
    case "rv20":
      value = percent(v);
      explanation = `把近期价格波动折算成一年的尺度，用来衡量波动幅度，并非预计一年涨跌幅。${rank}`;
      break;
    case "drawdown30":
      value = percent(v);
      explanation =
        v === 0
          ? "收盘价处于最近 30 天最高收盘水平。"
          : `比最近 30 天最高收盘价低 ${percent(Math.abs(v))}，反映已发生的回撤。`;
      break;
    case "dgs2":
    case "dfii10": {
      value = percent(v);
      const delta = change(m, 7);
      const prior = m.history
        .filter((p) => Date.parse(p.at) <= Date.parse(m.at!) - 7 * 86400000)
        .at(-1);
      explanation =
        delta === null || !prior
          ? "缺少一周前的可比数据，暂不能判断利率压力的变化。"
          : `较约一周前${v === prior.value ? "持平" : `${v > prior.value ? "上升" : "下降"} ${number(Math.abs(v - prior.value), 3)} 个百分点`}。${v > prior.value ? "上升通常增加风险资产的资金成本。" : "未见这项利率继续上升带来的增量压力。"}`;
      break;
    }
    case "dollar": {
      const delta = change(m, 7);
      explanation =
        delta === null
          ? "指数点位本身不能说明美元正在走强还是走弱，需要前期数据比较。"
          : `较约一周前${delta === 0 ? "持平" : `${delta > 0 ? "上涨" : "下跌"} ${percent(Math.abs(delta))}`}。美元走强通常给 BTC 带来外部压力。`;
      break;
    }
    case "etf":
      explanation =
        v === 0
          ? "这一披露日的合计净流量为零。"
          : `该披露日合计净${v > 0 ? "流入" : "流出"} ${amount(Math.abs(v) * 1e6)} USD，反映 ETF 投资者的资金方向。`;
      break;
    case "depth":
      explanation = `现价附近可见买卖挂单中较薄一侧约 ${amount(v)} USDT；只是单交易所可见部分。${rank}`;
      break;
    case "spread":
      explanation = `买卖报价之间相差 ${percent(v / 100)}。价差扩大意味着即时成交成本增加；是否异常还需历史对照。`;
      break;
    case "usdt":
    case "usdc":
      value = `${number(v, 5)} USD`;
      explanation = `较 1 美元${v === 1 ? "持平" : `${v > 1 ? "高" : "低"} ${percent(Math.abs(v - 1) * 100)}`}。${Math.abs(v - 1) >= 0.01 ? "已达到 1% 的偏离观察线，需跨平台核查。" : "尚未达到 1% 的偏离观察线。"}`;
      break;
  }
  return { title, value, explanation };
}

export function marketReadings(data: PublicMonitor) {
  const get = (key: string) => data.metrics.find((m) => m.key === key);
  const available = (keys: string[]) => keys.every((key) => fresh(get(key)));
  const state = (group: string) =>
    data.states.find((s) => s.group === group)?.state ?? "数据不足";
  const r = get("return7"),
    ma = get("ma20gap"),
    flow = get("cvd7Ratio"),
    supply = get("stableSupply");
  const baseline = flowBaseline(flow);
  const stable = change(supply, 7);
  const oi = change(get("oi"), 7);
  const trend = available(["return7", "ma20gap"]);
  const band = baseline && fresh(flow);
  const funding = get("funding");
  const pegs = [get("usdt"), get("usdc")];
  const pegRisk = pegs.filter((m) => fresh(m) && Math.abs(m.value - 1) >= 0.01);
  const macroReady = ["dollar", "dgs2", "dfii10"].every(
    (key) => change(get(key), 7) !== null,
  );
  const risingRate = ["dgs2", "dfii10"].some((key) => {
    const m = get(key);
    const prior = m?.history
      .filter((p) => Date.parse(p.at) <= Date.parse(m.at!) - 7 * 86400000)
      .at(-1);
    return fresh(m) && prior !== undefined && m.value > prior.value;
  });
  const macroIncreasing =
    macroReady && change(get("dollar"), 7)! > 0 && risingRate;
  const liquidity = state("流动性风险");
  const leverage = state("杠杆拥挤");
  return [
    {
      group: "趋势与波动",
      title: "价格走势",
      state: trend ? state("趋势与波动") : "走势暂不能判断",
      explanation: trend
        ? `近 7 天${r!.value! >= 0 ? "上涨" : "下跌"} ${percent(Math.abs(r!.value!))}，收盘价${ma!.value! >= 0 ? "高于" : "低于"} 20 日均价 ${percent(Math.abs(ma!.value!))}。`
        : "需要有效的 7 日涨跌和 20 日均价数据才能判断趋势。",
    },
    {
      group: "资金需求",
      title: "资金与买卖力量",
      state: band
        ? Math.abs(flow.value) <= baseline.band
          ? "现货买卖较均衡"
          : flow.value > 0
            ? "现货主动买入占优"
            : "现货主动卖出占优"
        : "买卖力量暂不能判断",
      explanation: `${band ? `买卖占比 ${percent(flow.value)}，中性范围 ±${percent(baseline.band)}。` : "买卖占比或历史对照不足。"}${stable === null ? "稳定币总量缺少 7 天对照。" : `稳定币总量近 7 天${stable >= 0 ? "增加" : "减少"} ${percent(Math.abs(stable))}。`}${fresh(get("etf")) ? "" : "ETF 流量暂无有效数据。"}`,
    },
    {
      group: "杠杆拥挤",
      title: "合约与杠杆",
      state:
        leverage === "部分数据或基线不足" || leverage === "数据不足"
          ? "拥挤程度暂不能判断"
          : leverage === "未触发观察条件"
            ? "尚未出现多项拥挤信号"
            : leverage,
      explanation: `${fresh(funding) ? (funding.value === 0 ? "当前费率为零，双方无资金费支付。" : `每 1 万 USDT 名义仓位，折算每 8 小时${funding.value > 0 ? "多头向空头" : "空头向多头"}支付约 ${number(Math.abs(funding.value) * 100, 4)} USDT。`) : "费率暂无有效数据。"}${oi === null ? "持仓量尚缺 7 天对照，仅凭费率不能确认拥挤。" : `持仓量近 7 天变化 ${percent(oi)}，需与价格方向一起判断。`}`,
    },
    {
      group: "宏观环境",
      title: "美元与利率",
      state: !macroReady
        ? "宏观压力暂不能判断"
        : macroIncreasing
          ? "美元与利率压力上升"
          : "美元与利率未同步上升",
      explanation: macroReady
        ? ["dollar", "dgs2", "dfii10"]
            .map((k) => metricReading(get(k)!).explanation.split("。")[0])
            .map((t, i) => `${["美元", "2 年利率", "实际利率"][i]}${t}`)
            .join("；") + "。"
        : "美元或利率数据不足，暂不能判断组合压力。",
    },
    {
      group: "流动性风险",
      title: "稳定币与交易流动性",
      state: pegRisk.length
        ? "稳定币报价偏离需关注"
        : liquidity.includes("可见盘口变薄")
          ? "盘口承接与价差需关注"
          : !pegs.every(fresh)
            ? "稳定币报价尚不齐全"
            : get("depth")?.percentile == null ||
                get("spread")?.percentile == null ||
                !available(["depth", "spread"])
              ? "稳定币未达偏离线，盘口待观察"
              : "未出现组合流动性异常",
      explanation: `${pegs.every(fresh) && !pegRisk.length ? "USDT、USDC 报价偏离均未达 1%。" : pegRisk.length ? "已有报价偏离达到 1% 观察线，需核查其他平台。" : "稳定币报价未齐全。"}${get("depth")?.percentile == null || get("spread")?.percentile == null ? "盘口历史未满 60 个日样本，交易流动性暂不能定性。" : !available(["depth", "spread"]) ? "盘口数据已失效，暂停判断。" : liquidity.includes("可见盘口变薄") ? "可见挂单减少、价差扩大同时出现。" : "盘口深度与价差未同时达到异常条件。"}`,
    },
  ];
}

export const RULE_GUIDE: Record<string, string> = {
  weakening: "价格继续走弱、主动卖出明显占优且进一步增强，同时稳定币总量收缩。",
  improving:
    "价格继续走强、主动买入明显占优且进一步增强，同时稳定币总量扩张，并有宏观与费率条件配合。",
  "macro-pressure": "美元走强、至少一项利率上升，同时 BTC 价格趋势偏弱。",
  "crowded-long": "多头付费处于历史高位、持仓量增加，同时价格上涨。",
  "crowded-short": "空头付费处于历史极端、持仓量增加，同时价格下跌。",
  "depeg-usdt": "USDT 美元报价偏离 1 美元达到 1%。",
  "depeg-usdc": "USDC 美元报价偏离 1 美元达到 1%。",
  "thin-liquidity": "可见挂单深度处于历史低位，同时买卖价差处于历史高位。",
};
export function signalMetrics(
  signal: AdminMonitor["signals"][number],
  monitor: PublicMonitor,
) {
  return monitor.metrics.filter((m) =>
    signal.evidence.some((e) => e.startsWith(`${m.name}：`)),
  );
}
export function missingReason(
  signal: AdminMonitor["signals"][number],
  monitor: PublicMonitor,
): string {
  const missing = signalMetrics(signal, monitor).filter((m) => !fresh(m));
  if (missing.length)
    return `缺少有效的${missing.map((m) => m.name).join("、")}数据。`;
  if (
    signal.key.startsWith("crowded-") &&
    change(
      monitor.metrics.find((m) => m.key === "oi"),
      7,
    ) === null
  )
    return "持仓量尚缺 7 天前的可比记录，当前不能确认多空拥挤。";
  if (signal.key === "thin-liquidity")
    return "盘口深度与价差需至少 60 个日样本建立对照，当前仍在积累。";
  return "所需的历史基线或前期对照尚不完整，暂不能评估该条件。";
}
