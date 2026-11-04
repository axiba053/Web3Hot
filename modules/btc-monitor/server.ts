import { defineServerModule } from "@aihot/backend/modules";
import { sql } from "@aihot/backend/db";
import { audit } from "@aihot/backend/audit";
import { actorOf } from "@aihot/backend/admin/auth";
import { publishBtcMonitor } from "@aihot/backend/publication/btc-monitor";
import { adminHandler } from "@aihot/api/routes/admin-auth";
import { readMonitor } from "./backend/store.ts";
import { analyze } from "./backend/analysis.ts";
import { collectMonitor } from "./backend/worker.ts";
import { emailStatus } from "./backend/email.ts";
import { RULES, RULE_VERSIONS } from "./catalog.ts";
import type { AdminMonitor, AlertView } from "./contracts.ts";
export async function readAdminMonitor(): Promise<AdminMonitor> {
  const monitor = await readMonitor();
  const alerts = await sql<
    AlertView[]
  >`SELECT id,rule,title,severity,evidence,advice,created_at AS "createdAt",resolved_at AS "resolvedAt",delivery,delivery_error AS "deliveryError" FROM btc_alerts WHERE resolved_at IS NULL OR id IN (SELECT id FROM btc_alerts ORDER BY id DESC LIMIT 100) ORDER BY id DESC`;
  const states = await sql<{
    rule: string; candidate_since: Date | null; samples: number;
    last_checked: Date | null; active_alert: number | null; signature: string | null;
  }[]>`SELECT s.* FROM btc_rule_states s`;
  return {
    monitor,
    signals: analyze(monitor.metrics).map(({ advice: _advice, ...signal }) => {
      const state = states.find((s) => s.rule === signal.key);
      const confirmed = alerts.find((a) => a.id === state?.active_alert && !a.resolvedAt);
      const version = RULE_VERSIONS[signal.key];
      const tracking = (!version || state?.signature?.startsWith(`${version}|`)) &&
        signal.ready && signal.active && state?.candidate_since &&
        state.last_checked && Date.parse(monitor.generatedAt) - state.last_checked.getTime() <= 45 * 60000;
      return {
        ...signal,
        confirmation: {
          status: confirmed ? "confirmed" : !signal.ready ? "insufficient" : signal.active ? "pending" : "inactive",
          since: tracking ? state.candidate_since!.toISOString() : null,
          samples: tracking ? state.samples : 0,
          lastChecked: state?.last_checked?.toISOString() ?? null,
          alertId: confirmed?.id ?? null,
        },
      };
    }),
    alerts,
    email: emailStatus(),
    rules: RULES,
  };
}
export default defineServerModule({
  name: "btc-monitor",
  http(app) {
    app.get("/api/v1/btc-monitor", async (_req, reply) =>
      reply
        .header("Cache-Control", "no-store")
        .send(publishBtcMonitor(await readMonitor())),
    );
    app.get(
      "/api/admin/btc-monitor",
      adminHandler(async () => readAdminMonitor()),
    );
    app.post(
      "/api/admin/btc-monitor/delivery",
      adminHandler(async (req, _reply, admin) => {
        const body = req.body as { id?: number; action?: string };
        if (
          !Number.isSafeInteger(body?.id) ||
          !["sent", "retry", "drop"].includes(body?.action ?? "")
        )
          throw Object.assign(new Error("无效的投递处理"), { statusCode: 400 });
        const result = await sql.begin(async (tx) => {
          const rows =
            await tx`UPDATE btc_alerts SET delivery=${body.action === "retry" ? "pending" : body.action === "sent" ? "sent" : "dropped"},delivery_error=NULL WHERE id=${body.id!} AND delivery='unknown' AND (${body.action!} != 'retry' OR resolved_at IS NULL) RETURNING id`;
          if (rows.length)
            await audit(
              actorOf(admin),
              "btc.delivery.resolve",
              `btc_alert:${body.id}`,
              "核查邮件投递",
              null,
              { action: body.action },
              { db: tx },
            );
          return { updated: rows.length };
        });
        return result;
      }),
    );
  },
  schedules: [
    {
      name: "btc-monitor.collect",
      cron: "*/15 * * * *",
      run: () => collectMonitor(),
      when: () =>
        process.env.BTC_MONITOR_ENABLED === "true" &&
        process.env.COLLECT_ENABLED === "true",
    },
  ],
  retention: async (now) => {
    const before = new Date(now.getTime() - 190 * 86400000);
    const points =
      await sql`DELETE FROM btc_observations WHERE observed_at < ${before}`;
    return { btcObservations: points.count };
  },
  sourceHealth: async () => {
    const m = await readMonitor();
    return [
      `BTC：${m.coverage}；${m.sources.filter((s) => s.error).length} 个数据源最近失败`,
    ];
  },
});
