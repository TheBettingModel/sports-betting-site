export type SeasonContext = {
  targetDate: string;
  startYear: number;
  endYear: number;
  seasonId: string;
  startDate: string;
};

function toDateOnly(value: string | Date): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error("Invalid modeled game date");
    return value.toISOString().slice(0, 10);
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) throw new Error(`Invalid modeled game date: ${value}`);
  const dateOnly = `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(`${dateOnly}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dateOnly) {
    throw new Error(`Invalid modeled game date: ${value}`);
  }
  return dateOnly;
}

function splitSeasonStartMonth(sport: string, league?: string | null): number | null {
  const normalizedSport = sport.toUpperCase();
  const normalizedLeague = league?.toLowerCase() ?? "";

  if (normalizedSport === "NBA" || normalizedSport === "NHL" || normalizedSport === "NCAAB") return 10;
  if (normalizedSport === "NFL" || normalizedSport === "NCAAF") return 8;
  if (normalizedSport === "SOCCER" && normalizedLeague !== "mls") return 7;
  return null;
}

export function getSeasonContext(
  sport: string,
  modeledGameDate: string | Date,
  league?: string | null,
): SeasonContext {
  const targetDate = toDateOnly(modeledGameDate);
  const year = Number(targetDate.slice(0, 4));
  const month = Number(targetDate.slice(5, 7));
  const normalizedSport = sport.toUpperCase();
  const splitMonth = splitSeasonStartMonth(normalizedSport, league);

  let startYear = year;
  let startMonth = 1;

  if (normalizedSport === "WNBA") {
    startMonth = 3;
    if (month < startMonth) startYear -= 1;
  } else if (splitMonth !== null) {
    startMonth = splitMonth;
    if (month < splitMonth) startYear -= 1;
  }

  const endYear = startMonth === 1 || normalizedSport === "WNBA" ? startYear : startYear + 1;
  const seasonId = normalizedSport === "NHL"
    ? `${startYear}${endYear}`
    : String(startYear);

  return {
    targetDate,
    startYear,
    endYear,
    seasonId,
    startDate: `${startYear}-${String(startMonth).padStart(2, "0")}-01`,
  };
}
