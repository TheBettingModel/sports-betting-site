/** Pure ESPN field parsing. No provider, database, clock, or filesystem access. */
export type JsonRecord = Record<string, unknown>;
export type NflSeasonPhase = "PRESEASON" | "REGULAR_SEASON" | "POSTSEASON" | "UNKNOWN";

export function record(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord : {};
}

export function providerId(value: unknown): string | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  return typeof value === "string" && /^[1-9]\d*$/.test(value.trim()) ? value.trim() : null;
}

export function score(value: unknown): number | null {
  if (typeof value === "string") {
    if (!/^\d+$/.test(value.trim())) return null;
    value = Number(value.trim());
  }
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function timestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d, h, min, sec, zone] = match;
  const year = Number(y), month = Number(m), day = Number(d);
  if (year < 1900 || month < 1 || month > 12 || day < 1
    || day > new Date(Date.UTC(year, month, 0)).getUTCDate()
    || Number(h) > 23 || Number(min) > 59 || Number(sec) > 59) return null;
  if (zone !== "Z" && (Number(zone.slice(1, 3)) > 14 || Number(zone.slice(4)) > 59
    || (Number(zone.slice(1, 3)) === 14 && Number(zone.slice(4)) !== 0))) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** ESPN scheduled kickoffs may use explicit-zone minute precision (…T00:20Z).
 * Only kickoff fields receive this normalization; evidence capture cutoffs keep
 * the stricter timestamp parser and are never rounded/backdated.
 */
export function kickoffTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const minute = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(Z|[+-]\d{2}:\d{2})$/.exec(value);
  return timestamp(minute ? `${minute[1]}:00${minute[2]}` : value);
}

export function classifyNflSeason(value: unknown): {
  year: number | null; phase: NflSeasonPhase; conflict: boolean;
} {
  const season = record(value);
  const year = typeof season.year === "number" && Number.isInteger(season.year)
    && season.year >= 1920 && season.year <= 9999 ? season.year : null;
  const byType: Record<string, NflSeasonPhase> = {
    "1": "PRESEASON", "2": "REGULAR_SEASON", "3": "POSTSEASON",
  };
  const byLabel: Record<string, NflSeasonPhase> = {
    preseason: "PRESEASON", "pre-season": "PRESEASON",
    "regular-season": "REGULAR_SEASON", postseason: "POSTSEASON", "post-season": "POSTSEASON",
  };
  const type = (typeof season.type === "number" || typeof season.type === "string")
    && Object.hasOwn(byType, String(season.type)) ? byType[String(season.type)] : undefined;
  const labels = [season.slug, season.name].filter((x): x is string => typeof x === "string")
    .map(x => x.trim().toLowerCase().replaceAll(" ", "-"))
    .filter(x => Object.hasOwn(byLabel, x)).map(x => byLabel[x]!).filter(Boolean);
  const known = new Set([...(type ? [type] : []), ...labels]);
  // Explicit unknown provider type must not be rescued by a stale label.
  const unknownType = season.type !== undefined && !type;
  return {
    year,
    phase: unknownType || known.size !== 1 ? "UNKNOWN" : [...known][0]!,
    conflict: known.size > 1,
  };
}

export function completion(value: unknown): "FINAL" | "NONFINAL" | "UNKNOWN" {
  const type = record(record(value).type);
  if (typeof type.completed !== "boolean" || !["pre", "in", "post"].includes(String(type.state))) return "UNKNOWN";
  const name = typeof type.name === "string" ? type.name : "";
  if (/CANCEL|POSTPON|SUSPEND|DELAY/.test(name)) return "NONFINAL";
  if (type.completed === false && type.state !== "post") return "NONFINAL";
  if (type.completed === true && type.state === "post"
    && /^STATUS_FINAL(?:_OVERTIME|_OT)?$/.test(name)) return "FINAL";
  return "UNKNOWN";
}
