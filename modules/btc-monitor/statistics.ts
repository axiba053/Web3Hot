import type { MetricView } from "./contracts.ts";

export function change(
  metric: MetricView | undefined,
  days: number,
): number | null {
  if (
    !metric ||
    metric.quality !== "fresh" ||
    metric.value === null ||
    !metric.at
  )
    return null;
  const target = Date.parse(metric.at) - days * 86400000;
  const prior = metric.history.filter((p) => Date.parse(p.at) <= target).at(-1);
  if (
    !prior ||
    target - Date.parse(prior.at) > 4 * 86400000 ||
    prior.value === 0
  )
    return null;
  return (metric.value / prior.value - 1) * 100;
}
// Exclude the evaluated day and future samples; one last observation per UTC day.
export function flowBaseline(
  metric: MetricView | undefined,
): { band: number; samples: number } | null {
  if (!metric?.at || metric.quality !== "fresh" || metric.value === null)
    return null;
  const day = Date.parse(metric.at.slice(0, 10));
  const days = new Map<string, number>();
  for (const p of [...metric.history].sort((a, b) =>
    a.at.localeCompare(b.at),
  )) {
    const t = Date.parse(p.at);
    if (t >= day - 90 * 86400000 && t < day)
      days.set(p.at.slice(0, 10), Math.abs(p.value));
  }
  const values = [...days.values()].sort((a, b) => a - b);
  if (values.length < 60) return null;
  const mid = Math.floor(values.length / 2);
  const band =
    values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
  return band > 0 ? { band, samples: values.length } : null;
}
