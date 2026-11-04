import { load } from "cheerio";
import type { CalendarEvent } from "../contracts.ts";

const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
function date(year: number, month: string, day: number): string {
  const m = months.indexOf(month.toLowerCase().slice(0, 3));
  const d = new Date(Date.UTC(year, m, day));
  if (m < 0 || d.getUTCMonth() !== m || d.getUTCDate() !== day || year < 2000 || year > 2100)
    throw new Error("日程日期无效");
  return d.toISOString().slice(0, 10);
}
export function easternTime(day: string, hour: number, minute: number): string {
  const local = Date.parse(day + "T00:00:00Z") + (hour * 60 + minute) * 60000;
  const format = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  let utc = local;
  for (let i = 0; i < 2; i++)
    utc += local - Date.parse(format.format(new Date(utc)).replace(" ", "T") + "Z");
  if (Date.parse(format.format(new Date(utc)).replace(" ", "T") + "Z") !== local)
    throw new Error("日程时间无效");
  return new Date(utc).toISOString();
}
export function parseBlsCalendar(text: string, title: string): CalendarEvent[] {
  const $ = load(text);
  const events: CalendarEvent[] = [];
  $("table.release-list tbody tr").each((_, row) => {
    const cells = $(row).find("td").map((_, cell) => $(cell).text().trim()).get();
    if (!cells.length) return;
    const d = cells[1]?.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),\s+(\d{4})$/);
    const t = cells[2]?.match(/^(\d{1,2}):(\d{2})\s+(AM|PM)$/i);
    if (!d || !t || +t[1] < 1 || +t[1] > 12 || +t[2] > 59)
      throw new Error("BLS 日程格式变化");
    const day = date(+d[3], d[1], +d[2]);
    events.push({ title, date: day, at: easternTime(day, +t[1] % 12 + (t[3].toUpperCase() === "PM" ? 12 : 0), +t[2]), reference: cells[0] });
  });
  if (!events.length) throw new Error("BLS 日程为空");
  return events;
}
export function parseFomcCalendar(text: string): CalendarEvent[] {
  const $ = load(text);
  const events: CalendarEvent[] = [];
  $(".panel").each((_, panel) => {
    const year = $(panel).find(".panel-heading").first().text().match(/(\d{4}) FOMC Meetings/);
    if (!year) return;
    $(panel).find(".fomc-meeting").each((_, row) => {
      const month = $(row).find(".fomc-meeting__month").text().trim().split("/").at(-1)!;
      const days = $(row).find(".fomc-meeting__date").text().trim();
      // Historical notation votes are not scheduled policy meetings.
      if (/notation vote/i.test(days)) return;
      const end = days.match(/^(?:\d{1,2}\s*[-–]\s*)?(\d{1,2})\s*\*?$/);
      if (!end) throw new Error("FOMC 日程格式变化");
      events.push({ title: "FOMC 会议结束日", date: date(+year[1], month, +end[1]), at: null, reference: days.includes("*") ? "含经济预测；美国东部日期，声明时刻未提供" : "美国东部日期，声明时刻未提供" });
    });
  });
  if (!events.length) throw new Error("FOMC 日程为空");
  return events;
}
export const CALENDAR_SOURCES = [
  { id: "fomcCalendar", name: "美联储 FOMC 日历", url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm", intervalMinutes: 720, parseEvents: parseFomcCalendar },
  { id: "cpiCalendar", name: "BLS CPI 日历", url: "https://www.bls.gov/schedule/news_release/cpi.htm", intervalMinutes: 720, parseEvents: (text: string) => parseBlsCalendar(text, "美国 CPI 发布") },
  { id: "jobsCalendar", name: "BLS 非农就业日历", url: "https://www.bls.gov/schedule/news_release/empsit.htm", intervalMinutes: 720, parseEvents: (text: string) => parseBlsCalendar(text, "美国非农就业报告") },
];
