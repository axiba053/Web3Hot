import { CALENDAR_SOURCES } from "./calendar.ts";
import { SITE } from "../../../site/site.ts";
import { sql } from "@aihot/backend/db";
import type { Db } from "@aihot/backend/db";
import { SOURCES, readText, type ReadText } from "./collectors.ts";
import { readMonitor } from "./store.ts";
import { analyze } from "./analysis.ts";
import { emailStatus, sendEmail } from "./email.ts";
import type { Signal } from "../contracts.ts";
import { RULES, RULE_VERSIONS } from "../catalog.ts";

interface RuleRow {
  rule: string;
  candidate_since: Date | null;
  last_checked: Date | null;
  samples: number;
  active_alert: number | null;
  recovery_since: Date | null;
  recovery_samples: number;
  signature: string | null;
}
export async function updateAlerts(
  db: Db,
  signals: Signal[],
  now: Date,
  signature: string,
): Promise<void> {
  for (const signal of signals) {
    await db`INSERT INTO btc_rule_states(rule) VALUES(${signal.key}) ON CONFLICT DO NOTHING`;
    const [state] = await db<
      RuleRow[]
    >`SELECT * FROM btc_rule_states WHERE rule=${signal.key} FOR UPDATE`;
    const version = RULE_VERSIONS[signal.key];
    const currentSignature = version ? `${version}|${signature}` : signature;
    const gap =
      (version !== undefined && !state.signature?.startsWith(`${version}|`)) ||
      !state.last_checked ||
      now.getTime() - state.last_checked.getTime() > 45 * 60000;
    if (!signal.ready) {
      await db`UPDATE btc_rule_states SET candidate_since=NULL,samples=0,recovery_since=NULL,recovery_samples=0,last_checked=${now},signature=${currentSignature} WHERE rule=${signal.key}`;
      continue;
    }
    // Re-reading an identical observation does not confirm another sample, especially for stale quotes.
    const changed = state.signature !== currentSignature;
    if (signal.active) {
      const since = !gap && state.candidate_since ? state.candidate_since : now;
      const samples =
        !gap && state.candidate_since ? state.samples + (changed ? 1 : 0) : 1;
      const minimum = signal.severity === "critical" ? 15 * 60000 : 6 * 3600000;
      let alert = state.active_alert;
      if (
        !alert &&
        samples >= (signal.severity === "critical" ? 2 : 3) &&
        now.getTime() - since.getTime() >= minimum
      ) {
        const [row] =
          await db`INSERT INTO btc_alerts(rule,title,severity,evidence,advice,created_at) VALUES(${signal.key},${signal.title},${signal.severity},${db.json(signal.evidence)},${signal.advice},${now}) RETURNING id`;
        alert = row.id;
      }
      await db`UPDATE btc_rule_states SET candidate_since=${since},samples=${samples},active_alert=${alert},recovery_since=NULL,recovery_samples=0,last_checked=${now},signature=${currentSignature} WHERE rule=${signal.key}`;
    } else {
      const since = !gap && state.recovery_since ? state.recovery_since : now;
      const samples =
        !gap && state.recovery_since
          ? state.recovery_samples + (changed ? 1 : 0)
          : 1;
      let alert = state.active_alert;
      if (
        alert &&
        samples >= 3 &&
        now.getTime() - since.getTime() >= 6 * 3600000
      ) {
        await db`UPDATE btc_alerts SET resolved_at=${now},delivery=CASE WHEN delivery='pending' THEN 'expired' ELSE delivery END WHERE id=${alert}`;
        alert = null;
      }
      await db`UPDATE btc_rule_states SET candidate_since=NULL,samples=0,active_alert=${alert},recovery_since=${since},recovery_samples=${samples},last_checked=${now},signature=${currentSignature} WHERE rule=${signal.key}`;
    }
  }
}
export async function deliverEmails(
  eligible: string[],
  sender = sendEmail,
  now = new Date(),
): Promise<void> {
  if (!emailStatus().enabled || !emailStatus().configured) return;
  // SMTP can accept DATA before the client loses its connection. Never blindly retry an uncertain send.
  await sql`UPDATE btc_alerts SET delivery='unknown',delivery_error='发送进程中断，需核查邮箱后处理' WHERE delivery='sending' AND delivery_at < ${new Date(now.getTime() - 10 * 60000)}`;
  await sql`UPDATE btc_alerts SET delivery='expired' WHERE delivery='pending' AND created_at < ${new Date(now.getTime() - 86400000)}`;
  if (!eligible.length) return;
  const pending =
    await sql`UPDATE btc_alerts SET delivery='sending',delivery_at=${now} WHERE id IN (SELECT id FROM btc_alerts WHERE delivery='pending' AND resolved_at IS NULL AND rule IN ${sql(eligible)} ORDER BY id LIMIT 10 FOR UPDATE SKIP LOCKED) RETURNING *`;
  if (!pending.length) return;
  try {
    await sender(
      `[${SITE.name} BTC] ${pending.length} 项状态变化`,
      pending
        .map(
          (a) =>
            `${a.title}\n时间：${new Date(a.created_at).toISOString()}\n${(a.evidence as string[]).join("\n")}\n建议：${a.advice}`,
        )
        .join("\n\n") +
        `\n\n${RULES}\n后台：${process.env.SITE_URL || "http://localhost:3000"}/admin/btc`,
    );
    await sql`UPDATE btc_alerts SET delivery='sent',delivery_error=NULL WHERE id IN ${sql(pending.map((a) => a.id))}`;
  } catch {
    await sql`UPDATE btc_alerts SET delivery='unknown',delivery_error='SMTP 结果未知，核查收件箱后再决定是否重发' WHERE id IN ${sql(pending.map((a) => a.id))}`;
  }
}
export async function collectMonitor(
  read: ReadText = readText,
  now = new Date(),
) {
  if (
    process.env.BTC_MONITOR_ENABLED !== "true" ||
    process.env.COLLECT_ENABLED !== "true"
  )
    return { skipped: true };
  const started = Date.now();
  const currentTime = () => new Date(now.getTime() + Date.now() - started);
  // Scheduled work can overlap across worker processes; one session owns collection and state transitions.
  const lock = await sql.reserve();
  const [held] = await lock`SELECT pg_try_advisory_lock(72625001) AS acquired`;
  if (!held.acquired) {
    lock.release();
    return { skipped: true };
  }
  try {
    const health = await sql<
      { id: string; checked_at: Date | null }[]
    >`SELECT id,checked_at FROM btc_sources`;
    for (const source of [...SOURCES, ...CALENDAR_SOURCES]) {
      const last = health.find((h) => h.id === source.id)?.checked_at;
      if (
        last &&
        Math.floor(now.getTime() / (source.intervalMinutes * 60000)) <=
        Math.floor(last.getTime() / (source.intervalMinutes * 60000))
      )
        continue;
      try {
        const text = await read(source.url);
        const collectedAt = currentTime();
        const events = "parseEvents" in source ? source.parseEvents(text) : null;
        const rows = "parse" in source ? source.parse(text, collectedAt).filter(
          (p) => Date.parse(p.at) <= collectedAt.getTime() &&
            Date.parse(p.at) >= collectedAt.getTime() - 180 * 86400000,
        ) : [];
        if (!events && !rows.length) throw new Error("没有有效时间范围内的观测");
        if (rows.some((p) => !Number.isFinite(p.value))) throw new Error("数值无效");
        await sql.begin(async (tx) => {
          if (events)
            await tx`INSERT INTO btc_calendar_snapshots(source,events,collected_at) VALUES(${source.id},${tx.json(events.map((event) => ({ ...event })))},${collectedAt}) ON CONFLICT(source) DO UPDATE SET events=excluded.events,collected_at=excluded.collected_at`;
          for (const p of rows)
            await tx`INSERT INTO btc_observations(metric,observed_at,value,source,collected_at) VALUES(${p.key},${p.at},${p.value},${p.source},${collectedAt}) ON CONFLICT DO NOTHING`;
          await tx`INSERT INTO btc_sources(id,checked_at,succeeded_at,error) VALUES(${source.id},${collectedAt},${collectedAt},NULL) ON CONFLICT(id) DO UPDATE SET checked_at=excluded.checked_at,succeeded_at=excluded.succeeded_at,error=NULL`;
        });
      } catch (error) {
        // Do not persist URLs, credentials, response bodies or provider-specific stack traces.
        const message =
          error instanceof Error && /^HTTP \d{3}$/.test(error.message)
            ? error.message
            : "采集或解析失败，请检查网络和源格式";
        await sql`INSERT INTO btc_sources(id,checked_at,error) VALUES(${source.id},${currentTime()},${message}) ON CONFLICT(id) DO UPDATE SET checked_at=excluded.checked_at,error=excluded.error`;
      }
    }
    const evaluatedAt = currentTime();
    const monitor = await readMonitor(evaluatedAt);
    const signals = analyze(monitor.metrics);
    await sql.begin(async (tx) => {
      for (const signal of signals) {
        // Only timestamps of this signal's evidence count, not unrelated source updates.
        const evidenceKeys = monitor.metrics.filter((m) =>
          signal.evidence.some((e) => e.startsWith(`${m.name}：`)),
        );
        await updateAlerts(
          tx,
          [signal],
          evaluatedAt,
          evidenceKeys.map((m) => `${m.key}:${m.at}:${m.value}`).join("|"),
        );
      }
    });
    await deliverEmails(
      signals.filter((s) => s.ready && s.active).map((s) => s.key),
    );
    return { coverage: monitor.coverage };
  } finally {
    await lock`SELECT pg_advisory_unlock(72625001)`;
    lock.release();
  }
}
