const references = [
  {
    title: "美股风险偏好（S&P 500）",
    status: "原站查看 · 未接入数值",
    summary: "观察美国大盘股的整体方向，作为 BTC 外部风险偏好的背景。",
    meaning: "S&P 500 反映美国大型上市公司的股票表现。可以对照同一时间窗口的 BTC 涨跌，观察两者是否同向；美股走强有时伴随风险偏好回升。",
    caution: "BTC 与美股的相关性会变化，美股上涨不保证 BTC 上涨。FRED 为日收盘数据，遇休市不更新，不应与 BTC 的全天候报价当成同步行情。",
    links: [{ label: "FRED · S&P 500", url: "https://fred.stlouisfed.org/series/SP500" }],
  },
  {
    title: "美股预期波动（VIX）",
    status: "原站查看 · 未接入数值",
    summary: "观察美股期权市场对未来约 30 天波动的定价，辅助识别外部风险升温。",
    meaning: "VIX 根据 S&P 500 指数期权价格计算，表示年化隐含波动率。上升意味着市场对未来波动的定价提高，常见于避险需求上升时。",
    caution: "VIX 不是 BTC 波动率，也不表示上涨或下跌概率。高位可持续，低位也不保证安全；应结合价格、利率和流动性一起看。",
    links: [{ label: "Cboe · VIX 指数", url: "https://www.cboe.com/tradable-products/vix" }],
  },
];

export function ReferenceIndicators() {
  return (
    <section aria-labelledby="btc-references">
      <h2 id="btc-references" className="text-base font-semibold">其他市场参考</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">
        以下指数的数据再展示条件尚未解决，暂保留解释和原站入口，不计入有效数据或当前状态判断。
      </p>
      <div className="mt-3 grid items-start gap-3">
        {references.map((item) => (
          <article key={item.title} className="min-w-0 rounded-panel border border-line bg-surface p-4 md:p-5">
            <p className="text-xs text-ink-3">{item.status}</p>
            <h3 className="mt-2 text-base font-semibold">{item.title}</h3>
            <p className="mt-2 text-sm leading-7 text-ink-2">{item.summary}</p>
            <div className="mt-3 border-t border-line pt-2">
              <h4 className="py-2 text-sm font-medium">怎么看与使用局限</h4>
              <p className="mt-2 text-sm leading-7 text-ink-2">{item.meaning}</p>
              <p className="mt-2 text-sm leading-7 text-ink-3">{item.caution}</p>
            </div>
            <div className="mt-2 flex flex-col items-start gap-2">
              {item.links.map((link) => (
                <a key={link.url} className="text-sm text-accent" href={link.url} target="_blank" rel="noreferrer">
                  {link.label} ↗
                </a>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
