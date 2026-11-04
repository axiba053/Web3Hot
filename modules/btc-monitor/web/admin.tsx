import { useLoaderData, useRevalidator, Link } from "react-router";
import { adminGet } from "../../../apps/web/app/lib/admin.server";
import { useAdminAction } from "../../../apps/web/app/features/admin/action";
import type { AdminMonitor } from "../contracts";
import { Diagnostics, time } from "./dashboard";
import {
  metricReading,
  missingReason,
  RULE_GUIDE,
  signalMetrics,
} from "../readings";
export const meta = () => [{ title: "BTC 告警 · 后台" }];
export const headers = () => ({ "Cache-Control": "no-store" });
export async function loader({ request }: { request: Request }) {
  return adminGet<AdminMonitor>(request, "/api/admin/btc-monitor");
}
const delivery: Record<string, string> = {
  pending: "待发送",
  sending: "发送中",
  sent: "SMTP 已接受",
  unknown: "投递结果待核查",
  expired: "已过期或恢复，未发送",
  dropped: "人工忽略",
};
function Evidence({
  signal,
  monitor,
}: {
  signal: AdminMonitor["signals"][number];
  monitor: AdminMonitor["monitor"];
}) {
  return (
    <div className="mt-3 space-y-3">
      <p className="text-sm leading-relaxed">
        <span className="font-medium">需要同时满足：</span>
        {RULE_GUIDE[signal.key] ?? signal.title}
      </p>
      {signalMetrics(signal, monitor).map((m) => {
        const r = metricReading(m);
        return (
          <div key={m.key} className="border-l-2 border-line pl-3 text-sm">
            <p className="font-medium">
              {r.title} · {r.value}
            </p>
            <p className="mt-1 leading-relaxed text-ink-3">{r.explanation}</p>
          </div>
        );
      })}
      <details className="text-xs text-ink-3">
        <summary className="cursor-pointer py-1">完整数值与时间</summary>
        {signal.evidence.map((e) => (
          <p className="mt-2 break-words" key={e}>
            {e}
          </p>
        ))}
      </details>
      <p className="text-xs text-ink-3">
        最近规则检查：{time(signal.confirmation.lastChecked)}
      </p>
    </div>
  );
}
export default function Page() {
  const data = useLoaderData<typeof loader>();
  const { run, pending } = useAdminAction();
  const revalidator = useRevalidator();
  const activeAlerts = data.alerts.filter(
    (a) => !a.resolvedAt || a.delivery === "unknown",
  );
  const history = data.alerts.filter(
    (a) => a.resolvedAt && a.delivery !== "unknown",
  );
  const observations = data.signals.filter(
    (s) => s.confirmation.status === "pending",
  );
  const other = data.signals.filter((s) =>
    ["inactive", "insufficient"].includes(s.confirmation.status),
  );
  const insufficient = data.signals.filter((s) => !s.ready).length;
  const confirmed = data.alerts.filter((a) => !a.resolvedAt).length;
  const overdue = data.signals.some(
    (s) =>
      !s.confirmation.lastChecked ||
      Date.parse(data.monitor.generatedAt) -
        Date.parse(s.confirmation.lastChecked) >
        45 * 60000,
  );
  const alertCard = (a: AdminMonitor["alerts"][number]) => {
    const signal = data.signals.find((s) => s.confirmation.alertId === a.id);
    return (
      <article
        key={a.id}
        className="rounded-panel border border-line bg-surface p-4 md:p-5"
      >
        <p className="text-xs font-medium text-accent">
          {a.resolvedAt ? "已恢复 · 邮件仍待核查" : "已确认告警"} · #{a.id}
        </p>
        <h3 className="mt-2 text-lg font-semibold">{a.title}</h3>
        <p className="mt-2 text-xs text-ink-3">
          形成于 {time(a.createdAt)} · 邮件：
          {delivery[a.delivery] ?? a.delivery}
        </p>
        {a.resolvedAt && (
          <p className="mt-2 text-xs text-ink-3">恢复于 {time(a.resolvedAt)}</p>
        )}
        {signal && (!signal.ready || !signal.active) && (
          <p className="mt-3 text-sm text-ink-2">
            {!signal.ready
              ? "当前数据不足，尚不能确认这项风险已恢复。"
              : "当前已不满足触发条件，正在等待恢复确认。"}
          </p>
        )}
        <div className="mt-4 rounded-card bg-accent-softer p-3 text-sm leading-relaxed">
          <p className="font-semibold">
            {a.resolvedAt ? "告警当时的建议" : "现在可复核什么"}
          </p>
          <p className="mt-1">{a.advice}</p>
        </div>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer py-1 text-accent">
            为什么提醒 · 查看触发时的证据
          </summary>
          <p className="mt-2 text-xs text-ink-3">
            以下是告警形成时保存的证据；当前市场数据可从公开状态页查看。
          </p>
          {a.evidence.map((e) => (
            <p
              key={e}
              className="mt-2 break-words text-xs leading-relaxed text-ink-3"
            >
              {e}
            </p>
          ))}
        </details>
        {a.deliveryError && <p className="mt-3 text-sm">{a.deliveryError}</p>}
        {a.delivery === "unknown" && (
          <div className="mt-3 flex flex-wrap gap-3">
            {[
              ["sent", "已收到"],
              ["drop", "忽略"],
              ...(!a.resolvedAt ? [["retry", "确认未收到，重发"]] : []),
            ].map(([action, label]) => (
              <button
                disabled={!!pending}
                key={action}
                className="rounded-control border border-line px-3 py-2 text-sm text-accent"
                onClick={() =>
                  run("POST", "/api/admin/btc-monitor/delivery", {
                    id: a.id,
                    action,
                  })
                }
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </article>
    );
  };
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-accent">管理员 · 异常与通知</p>
          <h1 className="mt-2 text-2xl font-semibold">BTC 告警</h1>
        </div>
        <div className="flex gap-3 text-sm">
          <Link
            to="/btc"
            className="rounded-control border border-line px-3 py-2 text-accent"
          >
            查看市场状态 ↗
          </Link>
          <button
            className="rounded-control border border-line px-3 py-2 text-accent"
            onClick={() => revalidator.revalidate()}
          >
            {revalidator.state === "loading" ? "刷新中…" : "刷新"}
          </button>
        </div>
      </header>
      <section
        aria-label="告警概览"
        className="rounded-panel border border-line bg-surface p-5"
      >
        <h2 className="text-xl font-semibold">
          {confirmed
            ? `${confirmed} 项已确认告警需要复核`
            : observations.length
              ? "有条件出现，正在等待确认"
              : "当前没有已确认行情告警"}
        </h2>
        <div className="mt-4 grid grid-cols-3 divide-x divide-line text-center">
          {[
            ["已确认", confirmed],
            ["待确认观察", observations.length],
            ["暂不能评估", insufficient],
          ].map(([label, count]) => (
            <div key={label} className="px-1">
              <p className="text-2xl font-semibold tabular-nums">{count}</p>
              <p className="mt-1 text-xs text-ink-3">{label}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm leading-relaxed text-ink-3">
          {insufficient
            ? `${insufficient} 项规则缺少有效数据或历史对照，暂无告警不代表这些风险已排除。`
            : "按现有监测规则持续确认，单项数值变化不会直接成为仓位建议。"}
        </p>
        {overdue && (
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
            部分规则超过 45 分钟未检查或尚未开始检查，请展开数据来源核查。
          </p>
        )}
      </section>
      {activeAlerts.length > 0 && (
        <section aria-labelledby="btc-confirmed">
          <h2 id="btc-confirmed" className="mb-3 text-base font-semibold">
            优先处理 · 告警与投递核查
          </h2>
          <div className="space-y-3">{activeAlerts.map(alertCard)}</div>
        </section>
      )}
      <section aria-labelledby="btc-observations">
        <h2 id="btc-observations" className="mb-3 text-base font-semibold">
          待确认观察 · {observations.length} 项
        </h2>
        {!observations.length ? (
          <p className="rounded-panel border border-line p-4 text-sm text-ink-3">
            目前没有正在持续确认的异常条件。
          </p>
        ) : (
          <div className="space-y-3">
            {observations.map((s) => {
              const c = s.confirmation;
              const minutes = c.since
                ? Math.max(
                    0,
                    Math.floor(
                      (Date.parse(data.monitor.generatedAt) -
                        Date.parse(c.since)) /
                        60000,
                    ),
                  )
                : 0;
              const required =
                s.severity === "critical"
                  ? { minutes: 15, samples: 2 }
                  : { minutes: 360, samples: 3 };
              return (
                <article
                  key={s.key}
                  className="rounded-panel border border-line bg-surface p-4"
                >
                  <p className="text-xs text-ink-3">待确认 · 尚未形成告警</p>
                  <h3 className="mt-2 font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed">
                    {RULE_GUIDE[s.key]}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                    <p>
                      持续观察：
                      {minutes >= 60
                        ? `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`
                        : `${minutes} 分钟`}{" "}
                      / 至少 {required.minutes === 360 ? "6 小时" : "15 分钟"}
                    </p>
                    <p>
                      不同证据：{c.samples} / 至少 {required.samples} 次
                    </p>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-ink-3">
                    两个条件均满足后才确认；重复读取相同数据不增加次数，日频指标可能需要数日。
                    {!c.since && "等待采集任务开始记录。"}
                  </p>
                  <details className="mt-3">
                    <summary className="cursor-pointer py-1 text-sm text-accent">
                      查看当前数据怎么支持这个观察
                    </summary>
                    <Evidence signal={s} monitor={data.monitor} />
                  </details>
                </article>
              );
            })}
          </div>
        )}
      </section>
      <details className="rounded-panel border border-line p-4">
        <summary className="cursor-pointer text-sm font-medium">
          其他监测项目 · {other.length} 项（含{" "}
          {other.filter((s) => !s.ready).length} 项暂不能评估）
        </summary>
        <div className="mt-3 divide-y divide-line">
          {other.map((s) => (
            <details key={s.key} className="py-3">
              <summary className="cursor-pointer text-sm">
                <span className="font-medium">{s.title}</span>
                <span className="ml-2 text-ink-3">
                  · {s.ready ? "条件未满足" : "暂不能评估"}
                </span>
              </summary>
              {!s.ready && (
                <p className="mt-3 text-sm leading-relaxed text-ink-3">
                  {missingReason(s, data.monitor)}
                </p>
              )}
              <Evidence signal={s} monitor={data.monitor} />
            </details>
          ))}
        </div>
      </details>
      <details className="rounded-panel border border-line p-4">
        <summary className="cursor-pointer text-sm font-medium">
          已恢复的历史告警 · {history.length} 条
        </summary>
        <p className="mt-3 text-xs text-ink-3">
          展示最近 100 条记录中的已恢复项。历史建议只反映当时情况。
        </p>
        {history.length ? (
          <div className="mt-3 space-y-3">
            {history.map((a) => (
              <details key={a.id} className="border-t border-line pt-3">
                <summary className="cursor-pointer text-sm">
                  {a.title} · 恢复于 {time(a.resolvedAt)}
                </summary>
                <p className="mt-3 text-sm">当时的建议：{a.advice}</p>
                <p className="mt-2 text-xs text-ink-3">
                  形成于 {time(a.createdAt)} · 邮件：
                  {delivery[a.delivery] ?? a.delivery}
                </p>
                {a.evidence.map((e) => (
                  <p key={e} className="mt-2 break-words text-xs text-ink-3">
                    {e}
                  </p>
                ))}
              </details>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-3">暂无已恢复的历史告警。</p>
        )}
      </details>
      <details className="rounded-panel border border-line p-4">
        <summary className="cursor-pointer text-sm font-medium">
          邮件与确认规则 ·{" "}
          {data.email.enabled && data.email.configured
            ? "邮件已启用"
            : "邮件未就绪"}
        </summary>
        <p className="mt-3 text-sm">
          邮件：
          {!data.email.configured
            ? "未配置"
            : data.email.enabled
              ? "已启用"
              : "已配置，未启用"}
          。仅在告警确认后发送；SMTP 接受不等于已核实进入收件箱。
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ink-3">{data.rules}</p>
      </details>
      <Diagnostics data={data.monitor} />
      <p className="text-xs text-ink-3">
        页面读取 {time(data.monitor.generatedAt)}（北京时间）
      </p>
    </main>
  );
}
