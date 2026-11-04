import { useRef, useState } from "react";
import { useRevalidator } from "react-router";
import { beijingDate, beijingTime } from "@aihot/contracts/time";
import type { MetricView, PublicMonitor } from "../contracts";
import { marketReadings, metricReading, number, percent } from "../readings";
import { currentRisks, oiToday, todayMetric, todayPoints, upcomingEvents } from "../intraday";
import { MacroCalendar } from "./calendar";
import { ReferenceIndicators } from "./references";
import { TrendChart } from "./chart";
import { DetailDrawer } from "./drawer";

export function time(at: string | null) {
  return at ? `${beijingDate(at)} ${beijingTime(at)}` : "尚未获取";
}
function MetricDetail({ metric: m, data }: { metric: MetricView; data: PublicMonitor }) {
  const reading = metricReading(m);
  return (
    <article className="space-y-4 border-b border-line py-5 first:pt-0 last:border-b-0">
      <div>
        <h3 className="font-semibold">{m.name}</h3>
        <p className="mt-2 text-2xl font-semibold tabular-nums">{reading.value}</p>
        <p className="mt-2 text-sm leading-7 text-ink-2">{reading.explanation}</p>
        <p className="mt-2 text-xs text-ink-3">{m.quality === "stale" ? "数据已过期 · " : m.quality === "missing" ? "数据缺失 · " : ""}数据时间 {time(m.at)}（北京时间）</p>
      </div>
      <div><h4 className="text-sm font-semibold">历史走势</h4><TrendChart points={m.history} label={`${m.name}历史走势`} /></div>
      <div className="text-sm leading-7 text-ink-2"><h4 className="font-semibold text-ink">计算口径与使用局限</h4><p>{m.meaning}</p><p>{m.effect}</p></div>
      {m.percentile !== null && <p className="text-xs text-ink-3">历史分位约 {number(m.percentile, 0)}%；需至少 60 个日样本，不是未来涨跌概率。</p>}
      {m.key === "fearGreed" && <a className="block text-sm text-accent" href="https://alternative.me/crypto/fear-and-greed-index/" target="_blank" rel="noreferrer">数据来源：Alternative.me ↗</a>}
      {m.source === "onchain" && <a className="block text-sm text-accent" href="https://bitview.space" target="_blank" rel="noreferrer">数据来源：Bitview ↗</a>}
      <a className="block text-sm text-accent" href={data.sources.find((s) => s.id === m.source)?.url} target="_blank" rel="noreferrer">查看原始数据源 ↗</a>
      <table className="w-full text-left text-xs">
        <caption className="pb-3 text-left text-sm font-semibold">最近观测</caption>
        <thead><tr><th>北京时间</th><th className="text-right">数值（{m.unit}）</th></tr></thead>
        <tbody>{m.history.slice(-14).reverse().map((p) => <tr key={p.at}><td className="py-2">{time(p.at)}</td><td className="text-right tabular-nums">{number(p.value, 6)}</td></tr>)}</tbody>
      </table>
    </article>
  );
}
type Selection = { title: string; keys?: string[]; page?: "calendar" | "all" | "references" };
export function Dashboard({ data }: { data: PublicMonitor }) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const opener = useRef<HTMLElement>(null);
  const refresh = useRevalidator();
  const get = (key: string) => data.metrics.find((m) => m.key === key);
  const open = (keys: string[], title?: string) => setSelection({ keys, title: title ?? get(keys[0])?.name ?? "指标详情" });
  const today = get("dayReturn"), range = get("dayRange"), price = get("price");
  const current = todayMetric(today, data.generatedAt);
  const rangeCurrent = todayMetric(range, data.generatedAt);
  const headline = current ? `今日${today!.value! > 0 ? "上涨" : today!.value! < 0 ? "下跌" : "持平"}${today!.value === 0 ? "" : ` ${percent(Math.abs(today!.value!))}`}` : "当天行情等待有效数据";
  const { risks, incomplete } = currentRisks(data);
  const events = upcomingEvents(data);
  const next = events[0];
  const readings = marketReadings(data);
  const oi = oiToday(get("oi"), data.generatedAt);
  const issues = data.metrics.filter((m) => m.quality !== "fresh");
  const calendarIssues = data.calendars.filter((c) => c.quality !== "fresh").length;
  const formatValue = (m: MetricView) => m.quality === "missing" || m.value === null ? "暂无数据" :
    m.key === "oi" && oi ? `${oi.value > 0 ? "+" : ""}${percent(oi.value)}` :
    m.key === "dayReturn" ? `${m.value > 0 ? "+" : ""}${percent(m.value)}` :
    m.key === "dayRange" ? percent(m.value) : metricReading(m).value;
  const card = (key: string, compact = false) => {
    const m = get(key);
    if (!m) return null;
    const usable = m.source === "intraday" ? todayMetric(m, data.generatedAt) : m.quality === "fresh";
    return (
      <button key={key} type="button" onClick={() => open([key])} className={`min-w-0 rounded-card border border-line bg-surface p-4 text-left transition-colors hover:border-accent focus-visible:outline-accent ${compact ? "" : "h-full"}`}>
        <span className="flex items-start justify-between gap-2 text-xs text-ink-3"><span>{key === "oi" ? "OI · 较零点附近" : m.name}</span><span aria-hidden="true">↗</span></span>
        <span className="mt-2 block text-lg font-semibold tabular-nums">{m.source === "intraday" && !usable ? "暂无当日数据" : formatValue(m)}</span>
        {!compact && <TrendChart points={m.source === "intraday" ? todayPoints(m, data.generatedAt) : m.history.filter((p) => Date.parse(p.at) >= Date.parse(data.generatedAt) - 7 * 86400000)} label={`${m.name}近期走势`} />}
        <span className="mt-2 block text-xs leading-relaxed text-ink-3">{!usable ? "数据待更新" : key === "oi" ? oi ? `基准 ${time(oi.at)} · 图为 OI 原值` : "零点附近对照不足，显示当前持仓量" : `截至 ${time(m.at)}`}</span>
        {key === "fearGreed" && <span className="mt-1 block text-xs text-ink-3">来源：Alternative.me</span>}
      </button>
    );
  };
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6" onClickCapture={(event) => {
      const button = (event.target as Element).closest("button");
      if (button && event.currentTarget.contains(button)) opener.current = button;
    }}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs text-accent">BTC · 当天行情与风险观察</p><h1 data-page-title className="mt-1 text-2xl font-semibold">BTC 市场状态</h1></div>
        <div className="flex items-center gap-3 text-xs text-ink-3"><span>{beijingDate(data.generatedAt)} · 北京时间</span><button type="button" onClick={() => refresh.revalidate()} disabled={refresh.state !== "idle"} className="rounded-control border border-line px-3 py-2 text-ink-2">{refresh.state === "idle" ? "刷新页面" : "正在刷新"}</button></div>
      </header>
      <section aria-label="当天市场总览" className="rounded-panel border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><h2 className="text-xl font-semibold">{headline}{rangeCurrent && `，振幅 ${percent(range!.value!)}`}</h2><p className="mt-2 text-sm text-ink-2">{risks.length ? `优先留意：${risks[0].title}。` : incomplete ? "已有风险数据未见所列异常；部分历史基线仍不足。" : "有效数据尚未触及所列风险观察线。"}{next && ` 下一事件：${next.title}。`}</p></div>
          <button type="button" onClick={() => open(["dayReturn", "dayRange"], "当天判断依据")} className="shrink-0 text-sm text-accent">查看判断依据 ↗</button>
        </div>
        <p className="mt-3 text-xs text-ink-3">当天按北京时间 00:00 起算 · 已完成 15 分钟 K 线 · 日内数据截至 {current ? time(today!.at) : "尚未获取"}{!data.enabled && " · 采集未启用"}</p>
      </section>
      <div className="grid items-start gap-4 xl:grid-cols-3">
        <section aria-label="当天价格走势" className="min-w-0 rounded-panel border border-line bg-surface p-5 xl:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs text-ink-3">BTC / USDT · 最新采样报价{price?.quality !== "fresh" && " · 待更新"}</p><p className="mt-1 text-3xl font-semibold tabular-nums">{price?.value == null ? "暂无报价" : number(price.value)} <span className="text-xs font-normal text-ink-3">USDT</span></p></div>
            <button type="button" onClick={() => open(["intradayPrice"])} className="text-xs text-accent">图表口径与记录 ↗</button>
          </div>
          <p className="mt-1 text-xs text-ink-3">报价时间 {time(price?.at ?? null)} · 每 15 分钟采集</p>
          <div className="mt-4"><TrendChart points={todayPoints(get("intradayPrice"), data.generatedAt)} label="BTC 当天价格走势（北京时间）" today={data.generatedAt} /></div>
          <p className="mt-1 text-xs text-ink-3">北京时间 · 15 分钟收盘价 · 未发生时段留空，缺口断开</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">{["dayReturn", "dayRange", "dayVolume"].map((key) => card(key, true))}</div>
        </section>
        <aside aria-label="风险与事件" className="space-y-4">
          <section className="rounded-panel border border-line bg-surface p-4">
            <div className="flex items-center justify-between"><h2 className="font-semibold">当前风险观察</h2><span className="text-xs text-ink-3">{risks.length} 项</span></div>
            <div className="mt-3 space-y-2">
              {risks.map((risk) => <button type="button" key={risk.title} onClick={() => open(risk.keys, risk.title)} className={`w-full rounded-control border p-3 text-left ${risk.urgent ? "border-hot bg-hot-soft" : "border-line bg-amber-soft"}`}><span className="block text-sm font-medium">{risk.title} ↗</span><span className="mt-1 block text-xs leading-relaxed text-ink-2">{risk.explanation}</span></button>)}
              {!risks.length && <p className="text-sm leading-relaxed text-ink-2">{incomplete ? "暂未发现可评估项的异常，部分基线不足。" : "所列项目暂未触及观察线。"}不代表没有市场风险。</p>}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink-3">观察稳定币偏离、盘口与费率极值；当前观测尚非持续确认的告警。</p>
          </section>
          <section className="rounded-panel border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">接下来关注</h2><button type="button" onClick={() => setSelection({ title: "宏观事件日历", page: "calendar" })} className="text-xs text-accent">完整日历 ↗</button></div>
            {events.slice(0, 2).map((e) => <div key={e.title + e.date} className="mt-3 border-t border-line pt-3"><p className="text-sm font-medium">{e.title}</p><p className="mt-1 text-sm tabular-nums">{e.at ? `${time(e.at)} 北京时间` : `${e.date} 美国东部日期`}</p><p className="mt-1 text-xs text-ink-3">{e.at ? `距发布约 ${Math.ceil((Date.parse(e.at) - Date.parse(data.generatedAt)) / 3600000)} 小时 · 以官方更新为准` : "仅提供日期，不推测声明时刻"}</p></div>)}
            {!events.length && <p className="mt-3 text-sm text-ink-3">暂无已同步的有效后续日程。</p>}
            {calendarIssues > 0 && <p className="mt-3 text-xs text-amber-ink">{calendarIssues} 个日程来源待更新，请查看完整日历。</p>}
          </section>
        </aside>
      </div>
      <section aria-labelledby="btc-live-metrics">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h2 id="btc-live-metrics" className="font-semibold">资金、杠杆与交易流动性</h2><p className="text-xs text-ink-3">数值直接可见 · 点击查看依据 · 小图为最近 7 天采样</p></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{["funding", "oi", "spread", "depth"].map((key) => card(key))}</div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">{["usdt", "usdc", "premium"].map((key) => { const m = get(key); return m && <button type="button" key={key} onClick={() => open([key])} className="text-ink-2">{m.name} <span className="font-medium tabular-nums">{formatValue(m)}</span>{m.quality !== "fresh" && " · 待更新"} <span className="text-accent">↗</span></button>; })}</div>
      </section>
      <section aria-labelledby="btc-background" className="border-t border-line pt-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h2 id="btc-background" className="font-semibold">市场背景</h2><button type="button" onClick={() => setSelection({ title: "全部指标", page: "all" })} className="text-sm text-accent">全部指标（{data.metrics.length}）↗</button></div>
        <p className="mb-4 text-xs text-ink-3">以下为日频或中期信息，与当天涨跌分开阅读；点击数值查看口径、解释和历史。</p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { title: "中期趋势", text: readings[0].state, keys: ["return7", "ma20gap", "rsi14"] },
            { title: "资金与情绪", text: readings[1].state, keys: ["stableSupply", "etf", "fearGreed"] },
            { title: "美元与利率", text: readings[3].state, keys: ["dollar", "dgs2", "dfii10"] },
            { title: "链上估值与持币", text: "日频 · 来源 Bitview", keys: ["mvrv", "sthCost", "supply1y"] },
          ].map((group) => <div key={group.title} className="min-w-0 rounded-panel border border-line bg-surface p-4"><h3 className="text-sm font-semibold">{group.title}</h3><p className="mt-1 text-xs text-ink-3">{group.text}</p><div className="mt-3 divide-y divide-line">{group.keys.map((key) => { const m = get(key); return m && <button type="button" key={key} onClick={() => open([key])} className="w-full py-3 text-left"><span className="block text-xs text-ink-3">{m.name}{m.key === "fearGreed" && " · Alternative.me"}</span><span className="mt-1 block text-sm font-medium tabular-nums">{formatValue(m)} <span className="text-xs text-accent">↗</span></span><span className="mt-1 block text-xs text-ink-3">{m.quality !== "fresh" ? "数据待更新" : time(m.at)}</span></button>; })}</div></div>)}
        </div>
        <button type="button" onClick={() => setSelection({ title: "S&P 500 与 VIX · 外部参考", page: "references" })} className="mt-4 text-sm text-accent">S&P 500 / VIX · 原站入口与说明 ↗</button>
      </section>
      <footer className="border-t border-line pt-4 text-xs leading-relaxed text-ink-3">
        <p>{data.coverage} · 页面读取 {time(data.generatedAt)}（北京时间） · 刷新页面读取已保存数据。</p>
        {issues.length > 0 && <p className="mt-1">待更新或缺失：{issues.map((m) => m.name).join("、")}。</p>}
        {data.sources.some((s) => s.error) && <p className="mt-1">部分来源最近采集失败；已保存值按各自数据时间判断有效性。</p>}
      </footer>
      <DetailDrawer returnFocus={opener} title={selection?.title ?? null} onClose={() => setSelection(null)}>
        {selection?.keys?.map((key) => { const m = get(key); return m && <MetricDetail key={key} metric={m} data={data} />; })}
        {selection?.page === "calendar" && <MacroCalendar data={data} />}
        {selection?.page === "references" && <ReferenceIndicators />}
        {selection?.page === "all" && <div className="divide-y divide-line">{data.metrics.map((m) => <button type="button" key={m.key} onClick={() => open([m.key])} className="flex w-full items-center justify-between gap-4 py-4 text-left text-sm"><span>{m.name}<span className="mt-1 block text-xs text-ink-3">{m.group} · {m.quality === "fresh" ? time(m.at) : "待更新"}</span></span><span className="shrink-0 font-medium">{formatValue(m)} ↗</span></button>)}</div>}
      </DetailDrawer>
    </div>
  );
}

export function Diagnostics({ data }: { data: PublicMonitor }) {
  const issues = data.sources.filter((s) => s.error || !s.succeededAt);
  return (
    <details className="rounded-panel border border-line p-4">
      <summary className="cursor-pointer text-sm font-medium">
        数据来源与使用说明 ·{" "}
        {issues.length ? `${issues.length} 个来源需留意` : "来源均有采集记录"}
      </summary>
      <section className="mt-4">
        <h3 className="text-sm font-semibold">信号源健康</h3>
        <div className="mt-3 divide-y divide-line">
          {data.sources.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap justify-between gap-1 py-2 text-xs"
            >
              <span>{s.name}</span>
              <span className="text-ink-3">
                {s.error ? "最近采集失败" : s.succeededAt ? "已采集" : "待采集"}{" "}
                · 每 {s.intervalMinutes} 分钟 · 最近成功 {time(s.succeededAt)}
              </span>
            </div>
          ))}
        </div>
      </section>
      <div className="mt-4 space-y-2 text-xs leading-relaxed text-ink-3">
        {data.limitations.map((l) => (
          <p key={l}>{l}</p>
        ))}
        <p>
          宏观日历：
          <a
            className="text-accent"
            href="https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"
            target="_blank"
            rel="noreferrer"
          >
            美联储议息
          </a>{" "}
          ·{" "}
          <a
            className="text-accent"
            href="https://www.bls.gov/schedule/"
            target="_blank"
            rel="noreferrer"
          >
            美国经济数据
          </a>
        </p>
      </div>
    </details>
  );
}
