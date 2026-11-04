import type { Point } from "../contracts";
import { number } from "../readings";
import { beijingTime } from "@aihot/contracts/time";
import { beijingStart, QUARTER } from "../intraday";

export function TrendChart({ points, label, today }: { points: Point[]; label: string; today?: string }) {
  if (points.length < 2)
    return <p className={today ? "flex h-60 items-center justify-center text-sm text-ink-3" : "py-2 text-xs text-ink-3"}>走势样本不足</p>;
  const values = points.map((p) => p.value);
  const low = Math.min(...values), high = Math.max(...values);
  const start = today ? beijingStart(today) : Date.parse(points[0].at);
  const end = today ? start + 86400000 : Date.parse(points.at(-1)!.at);
  const width = 600, height = today ? 220 : 38, left = today ? 65 : 2, right = 8, top = today ? 18 : 3, bottom = today ? 32 : 3;
  const span = high - low || Math.max(Math.abs(high) * 0.001, 1);
  const x = (at: string) => left + (Date.parse(at) - start) / Math.max(1, end - start) * (width - left - right);
  const y = (v: number) => top + (high - v + span * 0.1) / (span * 1.2) * (height - top - bottom);
  const line = points.map((p, i) =>
    `${i === 0 || (today && Date.parse(p.at) - Date.parse(points[i - 1].at) > QUARTER + 1) ? "M" : "L"}${x(p.at)},${y(p.value)}`).join(" ");
  const last = points.at(-1)!;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={today ? "w-full text-accent" : "h-9 w-full text-accent"} preserveAspectRatio={today ? "xMidYMid meet" : "none"} role="img" aria-label={label}>
      <title>{`${label}；${points.length} 个观测，最低 ${number(low)}，最高 ${number(high)}，末值 ${number(last.value)}`}</title>
      {today && [low, (high + low) / 2, high].map((v, i) => (
        <g key={i} className="text-ink-3">
          <line x1={left} x2={width - right} y1={y(v)} y2={y(v)} stroke="currentColor" opacity="0.15" />
          <text x={left - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="currentColor">{number(v, 0)}</text>
        </g>
      ))}
      <path d={line} fill="none" stroke="currentColor" strokeWidth={today ? 2 : 1.5} vectorEffect="non-scaling-stroke" />
      {today && <>
        {points.map((p) => <circle key={p.at} cx={x(p.at)} cy={y(p.value)} r="4" fill="transparent"><title>{`${beijingTime(p.at)} · ${number(p.value)} USDT`}</title></circle>)}
        <circle cx={x(last.at)} cy={y(last.value)} r="3" fill="currentColor" />
        {[0, 6, 12, 18, 24].map((hour) => <text key={hour} x={left + hour / 24 * (width - left - right)} y={height - 6} textAnchor={hour === 24 ? "end" : "middle"} fontSize="11" fill="currentColor" className="text-ink-3">{`${String(hour).padStart(2, "0")}:00`}</text>)}
      </>}
    </svg>
  );
}
