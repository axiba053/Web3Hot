export interface Point {
  at: string;
  value: number;
}
export interface Observation extends Point {
  key: string;
  source: string;
}
export interface MetricSpec {
  key: string;
  name: string;
  group: string;
  unit: string;
  meaning: string;
  effect: string;
  source: string;
  maxAgeHours: number;
}
export interface MetricView extends MetricSpec {
  value: number | null;
  at: string | null;
  collectedAt: string | null;
  quality: "fresh" | "stale" | "missing";
  history: Point[];
  percentile: number | null;
}
export interface SourceView {
  id: string;
  name: string;
  url: string;
  intervalMinutes: number;
  checkedAt: string | null;
  succeededAt: string | null;
  error: string | null;
}
export interface CalendarEvent {
  title: string;
  date: string;
  at: string | null;
  reference: string;
}
export interface CalendarView {
  source: string;
  updatedAt: string | null;
  quality: "fresh" | "stale" | "missing";
  events: CalendarEvent[];
}
export interface PublicMonitor {
  calendars: CalendarView[];
  generatedAt: string;
  enabled: boolean;
  metrics: MetricView[];
  sources: SourceView[];
  states: Array<{ group: string; state: string; detail: string }>;
  coverage: string;
  limitations: string[];
}
export interface Signal {
  key: string;
  title: string;
  severity: "warning" | "critical";
  evidence: string[];
  advice: string;
  ready: boolean;
  active: boolean;
}
export interface AlertView {
  id: number;
  rule: string;
  title: string;
  severity: string;
  evidence: string[];
  advice: string;
  createdAt: string;
  resolvedAt: string | null;
  delivery: string;
  deliveryError: string | null;
}
export interface AdminMonitor {
  monitor: PublicMonitor;
  signals: Array<Omit<Signal, "advice"> & {
    confirmation: {
      status: "insufficient" | "inactive" | "pending" | "confirmed";
      since: string | null;
      samples: number;
      lastChecked: string | null;
      alertId: number | null;
    };
  }>;
  alerts: AlertView[];
  email: { enabled: boolean; configured: boolean };
  rules: string;
}
