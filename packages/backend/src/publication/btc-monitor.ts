// Public module data crosses the same publication boundary as other public exits.
// Explicit projection prevents a future private field being exposed by a module reader.
import type { PublicMonitor } from "@aihot/contracts/market-monitor";
export function publishBtcMonitor(input: PublicMonitor): PublicMonitor {
  return {
    calendars: input.calendars.map(({ source, updatedAt, quality, events }) => ({
      source, updatedAt, quality,
      events: events.map(({ title, date, at, reference }) => ({ title, date, at, reference })),
    })),
    generatedAt: input.generatedAt,
    enabled: input.enabled,
    coverage: input.coverage,
    states: input.states.map(({ group, state, detail }) => ({
      group,
      state,
      detail,
    })),
    limitations: [...input.limitations],
    sources: input.sources.map(
      ({ id, name, url, intervalMinutes, checkedAt, succeededAt, error }) => ({
        id,
        name,
        url,
        intervalMinutes,
        checkedAt,
        succeededAt,
        error: error ? "最近采集失败" : null,
      }),
    ),
    metrics: input.metrics.map(
      ({
        key,
        name,
        group,
        unit,
        meaning,
        effect,
        source,
        maxAgeHours,
        value,
        at,
        collectedAt,
        quality,
        history,
        percentile,
      }) => ({
        key,
        name,
        group,
        unit,
        meaning,
        effect,
        source,
        maxAgeHours,
        value,
        at,
        collectedAt,
        quality,
        history: history.map(({ at, value }) => ({ at, value })),
        percentile,
      }),
    ),
  };
}
