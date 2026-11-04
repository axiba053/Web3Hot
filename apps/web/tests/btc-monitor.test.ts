// Readability must retain missing-data boundaries and keep actionable advice behind confirmed alerts.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium, webkit, expect, type Browser } from "@playwright/test";
import { METRICS } from "../../../modules/btc-monitor/catalog.ts";
import type { AdminMonitor, PublicMonitor } from "@aihot/contracts/market-monitor";
import { fakeApi, startWebServer, visit, type WebServer } from "./web-server.ts";

const at = "2026-10-28T04:00:00.000Z";
const monitor: PublicMonitor = {
  generatedAt: at, enabled: true, coverage: "测试数据", sources: [
    { id: "cpiCalendar", name: "BLS CPI 日历", url: "https://www.bls.gov/schedule/news_release/cpi.htm", intervalMinutes: 720, checkedAt: at, succeededAt: at, error: null },
    { id: "fomcCalendar", name: "美联储 FOMC 日历", url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm", intervalMinutes: 720, checkedAt: at, succeededAt: at, error: null },
  ], calendars: [
    { source: "cpiCalendar", quality: "stale", updatedAt: at, events: [{ title: "美国 CPI 发布", date: "2026-11-10", at: "2026-11-10T13:30:00.000Z", reference: "October 2026" }] },
    { source: "fomcCalendar", quality: "fresh", updatedAt: at, events: [{ title: "FOMC 会议结束日", date: "2026-12-09", at: null, reference: "声明时刻未提供" }] },
  ], limitations: ["后台使用说明"],
  states: [
    { group: "趋势与波动", state: "趋势偏弱", detail: "" },
    { group: "资金需求", state: "现货主动买卖较均衡", detail: "" },
    { group: "杠杆拥挤", state: "部分数据或基线不足", detail: "" },
    { group: "宏观环境", state: "数据不足", detail: "" },
    { group: "流动性风险", state: "部分数据或基线不足", detail: "" },
  ],
  metrics: METRICS.map((m) => {
    const values: Record<string, number> = { intradayPrice: 80000, dayReturn: 1.5, dayRange: 2.2, dayVolume: 200000000, mvrv: 1.44, sthCost: 75760.55, supply1y: 64, price: 80000, return7: -2.5, ma20gap: -1.2, funding: 0.01, cvd7Ratio: 0.1, volumeDay: 200000000, volumeRatio20: 1.4, rangeLow20: 70000, rangeHigh20: 80000, rangePosition20: 110, rsi14: 75, fearGreed: 30 };
    const value = values[m.key] ?? null;
    return { ...m, value, at: value === null ? null : at, collectedAt: at, quality: value === null ? "missing" : "fresh", percentile: null,
      history: m.source === "intraday" ? [
        { at: "2026-10-27T16:00:00Z", value: m.key === "intradayPrice" ? 79000 : 0 },
        { at: "2026-10-28T03:44:59.999Z", value: value ?? 0 },
      ] : m.key === "cvd7Ratio" ? Array.from({ length: 90 }, (_, i) => ({ at: new Date(Date.parse(at) - (i + 1) * 86400000).toISOString(), value: 2 })) : [] };
  }),
};
const pendingSignal: AdminMonitor["signals"][number] = {
  key: "weakening", title: "趋势继续恶化且主动卖出占优", severity: "warning", ready: true, active: true,
  evidence: ["7 日收益率：-2.5 %"], confirmation: { status: "pending", since: "2026-10-28T02:00:00.000Z", samples: 2, lastChecked: at, alertId: null },
};
let admin: AdminMonitor;
let web: WebServer;
let browsers: Browser[];
before(async () => {
  web = await startWebServer(fakeApi((url) => {
    if (url.pathname === "/api/v1/btc-monitor") return monitor;
    if (url.pathname === "/api/admin/btc-monitor") return admin;
    if (url.pathname === "/api/admin/me") return { name: "测试管理员", csrf: "test", dev: true };
    if (url.pathname === "/api/admin/nav-counts") return {};
  }));
  browsers = [await chromium.launch({ channel: "chromium" }), await webkit.launch()];
});
after(async () => { await Promise.all((browsers ?? []).map((b) => b.close())); await web?.stop(); });

test("BTC today dashboard exposes key numbers and opens evidence in a focus-restoring drawer", async () => {
  for (const browser of browsers) for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      await visit(page, web.origin + "/btc");
      await expect(page.getByRole("heading", { name: "BTC 市场状态", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "今日上涨 1.5%，振幅 2.2%", exact: true })).toBeVisible();
      await expect(page.getByRole("img", { name: "BTC 当天价格走势（北京时间）", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "当前风险观察", exact: true })).toBeVisible();
      const funding = page.getByRole("button", { name: /永续资金费率/ });
      await funding.click();
      const drawer = page.getByRole("dialog", { name: "永续资金费率", exact: true });
      await expect(drawer.getByText(/每 1 万 USDT 名义仓位，折算每 8 小时多头向空头支付约 1 USDT/)).toBeVisible();
      await expect(drawer.getByRole("heading", { name: "计算口径与使用局限", exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(drawer).toHaveCount(0);
      await expect(funding).toBeFocused();
      await page.getByRole("button", { name: "完整日历 ↗", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "宏观事件日历", exact: true }).getByText("2026-11-10 21:30 北京时间", { exact: true })).toBeVisible();
      await expect(page.getByRole("dialog", { name: "宏观事件日历", exact: true }).getByText("日程已过期，请到官方核实", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "关闭详情", exact: true }).click();
      await page.getByRole("button", { name: /全部指标（/ }).click();
      await page.getByRole("dialog", { name: "全部指标", exact: true }).getByRole("button", { name: /日线 RSI/ }).click();
      await expect(page.getByRole("dialog", { name: "日线 RSI（14）", exact: true }).getByText(/强趋势中可持续处于极端/).first()).toBeVisible();
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: /短期持有者已实现价格（150 天）/ }).click();
      await expect(page.getByRole("dialog", { name: "短期持有者已实现价格（150 天）", exact: true }).getByText(/不同于常见的 155 天口径/)).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("heading", { name: "信号源健康", exact: true })).toHaveCount(0);
      await expect(page.getByText("后台使用说明", { exact: true })).toHaveCount(0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test("BTC admin separates pending observations, confirmed advice and restored alerts with unresolved delivery", async () => {
  for (const browser of browsers) {
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const page = await context.newPage();
    try {
      admin = { monitor, signals: [pendingSignal], alerts: [], email: { enabled: true, configured: true }, rules: "测试规则" };
      await visit(page, web.origin + "/admin/btc");
      await expect(page.getByText("有条件出现，正在等待确认", { exact: true })).toBeVisible();
      await expect(page.getByText("不同证据：2 / 至少 3 次", { exact: true })).toBeVisible();
      await expect(page.getByText("现在可复核什么", { exact: true })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "BTC 市场状态", exact: true })).toHaveCount(0);
      admin = { ...admin, signals: [{ ...pendingSignal, confirmation: { ...pendingSignal.confirmation, status: "confirmed", alertId: 1 } }], alerts: [{ id: 1, rule: "weakening", title: pendingSignal.title, severity: "warning", evidence: ["已保存的触发证据"], advice: "测试建议，仅供已确认告警", createdAt: at, resolvedAt: null, delivery: "sent", deliveryError: null }] };
      await visit(page, web.origin + "/admin/btc");
      await expect(page.getByText("1 项已确认告警需要复核", { exact: true })).toBeVisible();
      await expect(page.getByText("测试建议，仅供已确认告警", { exact: true })).toBeVisible();
      await expect(page.getByText("已保存的触发证据", { exact: true })).not.toBeVisible();
      await page.getByText("为什么提醒 · 查看触发时的证据", { exact: true }).click();
      await expect(page.getByText("已保存的触发证据", { exact: true })).toBeVisible();
      admin = { ...admin, signals: [], alerts: [{ ...admin.alerts[0], resolvedAt: at, delivery: "unknown" }] };
      await visit(page, web.origin + "/admin/btc");
      await expect(page.getByRole("button", { name: "已收到", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "确认未收到，重发", exact: true })).toHaveCount(0);
      await page.getByText("数据来源与使用说明 · 来源均有采集记录", { exact: true }).click();
      await expect(page.getByRole("heading", { name: "信号源健康", exact: true })).toBeVisible();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    } finally { await context.close(); }
  }
});
