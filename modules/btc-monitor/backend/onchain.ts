import type { Observation } from "../contracts.ts";

export const AGE_SERIES = [
  "1y_to_18m", "18m_to_2y", "2y_to_3y", "3y_to_4y", "4y_to_5y", "5y_to_6y",
  "6y_to_7y", "7y_to_8y", "8y_to_10y", "10y_to_12y", "12y_to_15y", "over_15y",
].map((age) => `age_${age}_supply_share`);
export const CHAIN_SERIES = ["date", "mvrv", "sth_realized_price", ...AGE_SERIES];
export const CHAIN_URL = `https://bitview.space/api/series/bulk?series=${CHAIN_SERIES.join(",")}&index=day1&start=-181`;

export function parseOnchain(text: string, now: Date): Observation[] {
  const rows = JSON.parse(text);
  if (!Array.isArray(rows) || rows.length !== CHAIN_SERIES.length)
    throw new Error("链上序列数量变化");
  const types = ["Date", "Multiple", "Dollars", ...AGE_SERIES.map(() => "Percent")];
  for (const [i, row] of rows.entries()) {
    if (row.index !== "day1" || row.type !== types[i] ||
        !Number.isSafeInteger(row.start) || row.start < 0 ||
        !Array.isArray(row.data) || row.end - row.start !== row.data.length)
      throw new Error("链上序列格式变化");
  }
  const out: Observation[] = [];
  const valueAt = (series: number, index: number): number | null => {
    const v = rows[series].data[index - rows[series].start];
    if (v == null) return null;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 ||
        (series >= 3 && v > 100)) throw new Error("链上数值无效");
    return v;
  };
  for (const [i, day] of rows[0].data.entries()) {
    if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
        !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day)
      throw new Error("链上日期无效");
    const at = day + "T23:59:59.999Z";
    if (Date.parse(at) >= now.getTime()) continue; // Do not freeze a partial current day.
    const index = rows[0].start + i;
    const mvrv = valueAt(1, index), sth = valueAt(2, index);
    const shares = AGE_SERIES.map((_, j) => valueAt(3 + j, index));
    const oldSupply = shares.every((v) => v !== null) ? shares.reduce<number>((s, v) => s + v!, 0) : null;
    if (oldSupply !== null && oldSupply > 100.001) throw new Error("币龄比例总和无效");
    for (const [key, value] of [["mvrv", mvrv], ["sthCost", sth], ["supply1y", oldSupply]] as const)
      if (value !== null) out.push({ key, value, at, source: "onchain" });
  }
  return out;
}
