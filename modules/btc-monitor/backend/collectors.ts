import { parseIntraday } from "../intraday.ts";
import { CALENDAR_SOURCES } from "./calendar.ts";
import { CHAIN_URL, parseOnchain } from "./onchain.ts";
import { load } from "cheerio";
import { ProxyAgent, fetch as proxyFetch } from "undici";
import { guardedFetch, requireOk } from "@aihot/backend/lib/http-fetch";
import type { Observation } from "../contracts.ts";

export interface Source {
  id: string;
  name: string;
  url: string;
  intervalMinutes: number;
  parse: (text: string, now: Date) => Observation[];
}
export type ReadText = (url: string) => Promise<string>;
const DAY = 86400000;
function number(v: unknown): number {
  if (
    v === null ||
    v === undefined ||
    typeof v === "boolean" ||
    String(v).trim() === ""
  )
    throw new Error("缺少数值");
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error("无效数值");
  return n;
}
function point(
  key: string,
  value: unknown,
  at: string | number,
  source: string,
): Observation {
  const date = new Date(at);
  if (!Number.isFinite(date.getTime())) throw new Error("无效时间");
  return { key, value: number(value), at: date.toISOString(), source };
}
function okx(text: string): Array<Record<string, string>> {
  const result = JSON.parse(text);
  if (result.code !== "0" || !Array.isArray(result.data) || !result.data.length)
    throw new Error("OKX 未返回有效数据");
  return result.data;
}
export function parseCandles(text: string, now: Date): Observation[] {
  const rows: unknown[][] = JSON.parse(text);
  if (!Array.isArray(rows)) throw new Error("日线格式无效");
  const days = rows
    .filter((r) => Array.isArray(r) && number(r[6]) < now.getTime())
    .sort((a, b) => number(a[0]) - number(b[0]));
  const out: Observation[] = [];
  const rsi: Array<number | undefined> = [];
  let gains = 0, losses = 0, changes = 0;
  for (let i = 1; i < days.length; i++) {
    if (number(days[i][0]) - number(days[i - 1][0]) !== DAY) {
      gains = losses = changes = 0;
      continue;
    }
    const delta = number(days[i][4]) - number(days[i - 1][4]);
    changes++;
    if (changes <= 14) {
      gains += Math.max(delta, 0) / 14;
      losses += Math.max(-delta, 0) / 14;
    } else {
      gains = (gains * 13 + Math.max(delta, 0)) / 14;
      losses = (losses * 13 + Math.max(-delta, 0)) / 14;
    }
    if (changes >= 14)
      rsi[i] = gains + losses === 0 ? 50 : 100 * gains / (gains + losses);
  }
  for (let i = 30; i < days.length; i++) {
    const recent = days.slice(i - 30, i + 1);
    if (
      recent.some(
        (r, j) => j > 0 && number(r[0]) - number(recent[j - 1][0]) !== DAY,
      )
    )
      continue;
    const close = number(days[i][4]);
    if (recent.some((r) => number(r[4]) <= 0)) throw new Error("价格非正");
    const avg =
      days.slice(i - 19, i + 1).reduce((s, r) => s + number(r[4]), 0) / 20;
    const returns = days
      .slice(i - 19, i + 1)
      .map((r, j) => Math.log(number(r[4]) / number(days[i - 20 + j][4])));
    const mean = returns.reduce((a, b) => a + b, 0) / 20;
    const rv =
      Math.sqrt((returns.reduce((s, r) => s + (r - mean) ** 2, 0) / 19) * 365) *
      100;
    const prior20 = days.slice(i - 20, i);
    const averageVolume = prior20.reduce((s, r) => s + number(r[7]), 0) / 20;
    const volumeDay = number(days[i][7]);
    const rangeLow20 = Math.min(...prior20.map((r) => number(r[3])));
    const rangeHigh20 = Math.max(...prior20.map((r) => number(r[2])));
    if (volumeDay < 0 || prior20.some((r) => number(r[7]) < 0) ||
        rangeLow20 <= 0 || rangeHigh20 < rangeLow20)
      throw new Error("成交额或价格区间无效");
    const at = number(days[i][6]);
    const week = days.slice(i - 6, i + 1);
    const volume = week.reduce((s, r) => s + number(r[7]), 0);
    const cvd = week.reduce((s, r) => s + 2 * number(r[10]) - number(r[7]), 0);
    for (const [key, value] of Object.entries({
      volumeDay,
      ...(averageVolume > 0 ? { volumeRatio20: volumeDay / averageVolume } : {}),
      rangeLow20,
      rangeHigh20,
      ...(rangeHigh20 > rangeLow20 ? {
        rangePosition20: (close - rangeLow20) / (rangeHigh20 - rangeLow20) * 100,
      } : {}),
      ...(rsi[i] !== undefined ? { rsi14: rsi[i] } : {}),
      return7: (close / number(days[i - 7][4]) - 1) * 100,
      ma20gap: (close / avg - 1) * 100,
      rv20: rv,
      drawdown30:
        (close /
          Math.max(...days.slice(i - 29, i + 1).map((r) => number(r[4]))) -
          1) *
        100,
      cvd7: cvd,
      ...(volume > 0 ? { cvd7Ratio: (cvd / volume) * 100 } : {}),
    }))
      out.push(point(key, value, at, "candles"));
  }
  return out;
}
export function parseSentiment(text: string): Observation[] {
  const result = JSON.parse(text);
  if (result.metadata?.error || !Array.isArray(result.data) || !result.data.length)
    throw new Error("情绪指数未返回有效数据");
  return result.data.map((r: { value: string; timestamp: string }) => {
    const value = number(r.value);
    if (!Number.isInteger(value) || value < 0 || value > 100)
      throw new Error("情绪指数超出范围");
    return point("fearGreed", value, number(r.timestamp) * 1000, "sentiment");
  });
}
export function parseFunding(text: string): Observation[] {
  const rows = okx(text).sort(
    (a, b) => number(a.fundingTime) - number(b.fundingTime),
  );
  return rows.slice(1).map((r, i) => {
    const hours =
      (number(r.fundingTime) - number(rows[i].fundingTime)) / 3600000;
    if (hours <= 0 || hours > 24) throw new Error("资金费率结算间隔异常");
    return point(
      "funding",
      ((number(r.realizedRate) * 8) / hours) * 100,
      number(r.fundingTime),
      "funding",
    );
  });
}
export function parseFred(text: string, key: string): Observation[] {
  const lines = text.trim().split(/\r?\n/);
  if (!/^observation_date,|^DATE,/.test(lines[0]))
    throw new Error("FRED 未返回 CSV");
  return lines.slice(1).flatMap((line) => {
    const [date, value] = line.split(",");
    if (!value || value === ".") return [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("FRED 日期格式变化");
    return [point(key, value, `${date}T23:59:59Z`, key)];
  });
}
export function parseEtf(text: string): Observation[] {
  const $ = load(text);
  const out: Observation[] = [];
  $("table").each((_i, table) => {
    const headers = $(table)
      .find("tr")
      .toArray()
      .find((row) =>
        $(row)
          .find("th,td")
          .toArray()
          .some((c) => $(c).text().trim() === "Total"),
      );
    if (!headers) return;
    const names = $(headers)
      .find("th,td")
      .toArray()
      .map((c) => $(c).text().trim());
    const total = names.indexOf("Total");
    if (total < 2) return;
    $(table)
      .find("tr")
      .each((_j, row) => {
        const cells = $(row)
          .find("td")
          .toArray()
          .map((c) => $(c).text().trim());
        if (
          !/^\d{1,2} [A-Za-z]{3} \d{4}$/.test(cells[0] ?? "") ||
          cells.length !== names.length
        )
          return;
        const values = cells.slice(1, total + 1);
        if (values.some((v) => !/^\(?-?[\d,]+(?:\.\d+)?\)?$/.test(v))) return;
        const value = cells[total];
        const n =
          number(value.replace(/[(),]/g, "")) *
          (value.startsWith("(") ? -1 : 1);
        out.push(
          point(
            "etf",
            n,
            new Date(`${cells[0]} 21:00:00 GMT`).toISOString(),
            "etf",
          ),
        );
      });
  });
  if (!out.length)
    throw new Error("ETF 无完整已披露行，可能被访问验证拦截或表格变更");
  return out;
}
const fred = (id: string, series: string, name: string): Source => ({
  id,
  name,
  url: `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${series}`,
  intervalMinutes: 720,
  parse: (t) => parseFred(t, id),
});
export const SOURCES: Source[] = [
  { id: "intraday", name: "Binance BTC 15 分钟 K 线", url: "https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=192", intervalMinutes: 15, parse: parseIntraday },
  { id: "onchain", name: "Bitview 免费链上数据", url: CHAIN_URL, intervalMinutes: 720, parse: parseOnchain },
  {
    id: "spot",
    name: "Binance BTC 现货",
    url: "https://data-api.binance.vision/api/v3/ticker/24hr?symbol=BTCUSDT",
    intervalMinutes: 15,
    parse: (t) => {
      const r = JSON.parse(t);
      return [point("price", r.lastPrice, number(r.closeTime), "spot")];
    },
  },
  {
    id: "candles",
    name: "Binance BTC 完整日线",
    url: "https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=180",
    intervalMinutes: 360,
    parse: parseCandles,
  },
  {
    id: "funding",
    name: "OKX 永续历史费率",
    url: "https://www.okx.com/api/v5/public/funding-rate-history?instId=BTC-USDT-SWAP&limit=400",
    intervalMinutes: 60,
    parse: parseFunding,
  },
  {
    id: "oi",
    name: "OKX 币本位持仓",
    url: "https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=BTC-USDT-SWAP",
    intervalMinutes: 60,
    parse: (t) => {
      const r = okx(t)[0];
      return [point("oi", r.oiCcy, number(r.ts), "oi")];
    },
  },
  {
    id: "premium",
    name: "OKX 永续溢价",
    url: "https://www.okx.com/api/v5/public/premium-history?instId=BTC-USDT-SWAP&limit=100",
    intervalMinutes: 60,
    parse: (t) =>
      okx(t).map((r) =>
        point("premium", number(r.premium) * 100, number(r.ts), "premium"),
      ),
  },
  {
    id: "stable",
    name: "DefiLlama 稳定币供给",
    url: "https://stablecoins.llama.fi/stablecoincharts/all",
    intervalMinutes: 720,
    parse: (t) =>
      (
        JSON.parse(t) as Array<{
          date: string;
          totalCirculating: { peggedUSD: number };
        }>
      )
        .slice(-180)
        .map((r) =>
          point(
            "stableSupply",
            r.totalCirculating.peggedUSD,
            number(r.date) * 1000,
            "stable",
          ),
        ),
  },
  {
    id: "sentiment",
    name: "Alternative.me 恐惧与贪婪指数",
    url: "https://api.alternative.me/fng/?limit=180",
    intervalMinutes: 720,
    parse: parseSentiment,
  },
  {
    id: "etf",
    name: "Farside BTC ETF",
    url: "https://farside.co.uk/btc/",
    intervalMinutes: 720,
    parse: parseEtf,
  },
  fred("dgs2", "DGS2", "FRED 2 年期国债"),
  fred("dfii10", "DFII10", "FRED 10 年实际利率"),
  fred("dollar", "DTWEXBGS", "FRED 广义美元"),
  {
    id: "depth",
    name: "Binance 可见订单簿",
    url: "https://data-api.binance.vision/api/v3/depth?symbol=BTCUSDT&limit=500",
    intervalMinutes: 15,
    parse: (t, now) => {
      const r = JSON.parse(t);
      const bids = r.bids as string[][],
        asks = r.asks as string[][];
      const bid = number(bids[0][0]),
        ask = number(asks[0][0]);
      if (bid <= 0 || ask < bid) throw new Error("盘口无效");
      const mid = (bid + ask) / 2;
      const depth = (rows: string[][]) =>
        rows
          .filter((r) => Math.abs(number(r[0]) / mid - 1) <= 0.01)
          .reduce((s, r) => s + number(r[0]) * number(r[1]), 0);
      return [
        point(
          "depth",
          Math.min(depth(bids), depth(asks)),
          now.toISOString(),
          "depth",
        ),
        point(
          "spread",
          ((ask - bid) / mid) * 10000,
          now.toISOString(),
          "depth",
        ),
      ];
    },
  },
  {
    id: "usdt",
    name: "Coinbase USDT/USD",
    url: "https://api.exchange.coinbase.com/products/USDT-USD/ticker",
    intervalMinutes: 15,
    parse: (t) => {
      const r = JSON.parse(t);
      return [point("usdt", r.price, r.time, "usdt")];
    },
  },
  {
    id: "usdc",
    name: "Kraken USDC/USD",
    url: "https://api.kraken.com/0/public/Ticker?pair=USDCUSD",
    intervalMinutes: 15,
    parse: (t, now) => {
      const r = JSON.parse(t);
      if (r.error?.length) throw new Error("Kraken 返回错误");
      const v = Object.values(r.result)[0] as { a: string[]; b: string[] };
      return [
        point(
          "usdc",
          (number(v.a[0]) + number(v.b[0])) / 2,
          now.toISOString(),
          "usdc",
        ),
      ];
    },
  },
];
let proxy: ProxyAgent | undefined;
export async function readText(url: string): Promise<string> {
  // Fixed public catalog only; a separate proxy is needed where exchange domains use fake-IP DNS.
  if (![...SOURCES, ...CALENDAR_SOURCES].some((s) => s.url === url)) throw new Error("未登记的数据源");
  if (process.env.BTC_DATA_PROXY_URL) {
    proxy ??= new ProxyAgent(process.env.BTC_DATA_PROXY_URL);
    const r = await proxyFetch(url, {
      dispatcher: proxy,
      signal: AbortSignal.timeout(20000),
      redirect: "error",
    });
    if (!r.ok) {
      await r.body?.cancel();
      throw new Error(`HTTP ${r.status}`);
    }
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for await (const chunk of r.body!) {
      bytes += chunk.length;
      if (bytes > 8 * 1024 * 1024) throw new Error("响应超过大小限制");
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  return requireOk(
    await guardedFetch(url, { timeoutMs: 20000, maxBytes: 8 * 1024 * 1024 }),
  ).text();
}
