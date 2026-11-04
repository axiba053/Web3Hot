import { beijingDate, beijingTime } from "@aihot/contracts/time";
import type { PublicMonitor } from "../contracts";

export function MacroCalendar({ data }: { data: PublicMonitor }) {
  return (
    <section aria-labelledby="btc-calendar">
      <h2 id="btc-calendar" className="text-base font-semibold">宏观事件日历</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">
        每 12 小时同步官方日程。CPI、非农时间已换算为北京时间；FOMC 仅提供美国东部的会议结束日期，不推测声明时刻。日程可能调整。
      </p>
      <div className="mt-3 grid items-start gap-3">
        {data.calendars.map((calendar) => {
          const source = data.sources.find((s) => s.id === calendar.source);
          return (
            <article key={calendar.source} className="min-w-0 rounded-panel border border-line bg-surface p-4">
              <h3 className="text-sm font-semibold">{source?.name}</h3>
              <p className="mt-2 text-xs text-ink-3">
                {calendar.quality === "missing" ? "尚未获取日程" : calendar.quality === "stale" ? "日程已过期，请到官方核实" : "已同步官方日程"}
                {source?.error && " · 最近同步失败"}
              </p>
              {calendar.events.map((event) => (
                <div key={event.title + event.date} className="mt-3 border-t border-line pt-3 text-sm">
                  <p className="font-medium">{event.title}</p>
                  <p className="mt-1 tabular-nums">{event.at ? `${beijingDate(event.at)} ${beijingTime(event.at)} 北京时间` : `${event.date} 美国东部日期`}</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-3">{event.reference}</p>
                </div>
              ))}
              {calendar.quality !== "missing" && !calendar.events.length && <p className="mt-3 text-sm text-ink-3">已同步日程中暂无后续事件，请查看官方更新。</p>}
              <p className="mt-3 text-xs text-ink-3">最近同步：{calendar.updatedAt ? `${beijingDate(calendar.updatedAt)} ${beijingTime(calendar.updatedAt)} 北京时间` : "尚未获取"}</p>
              <a className="mt-3 block text-sm text-accent" href={source?.url} target="_blank" rel="noreferrer">查看官方日历 ↗</a>
            </article>
          );
        })}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-3">FOMC 关注政策路径，CPI 关注整体与核心通胀，非农同时看就业、工资、失业率和修正值。公布值相对预期的偏差更值得关注；本页仅提供日程，不采集市场预期或推断涨跌方向。</p>
    </section>
  );
}
