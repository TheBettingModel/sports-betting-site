/** Pure report helpers keep cohort/market arithmetic independently testable. */
export const distinctGameCount = (rows: readonly { gameId: string | null }[]) =>
  new Set(rows.map((row) => row.gameId).filter((id): id is string => id != null)).size;
export const percentage = (numerator: number, denominator: number): number | null =>
  denominator > 0 ? numerator / denominator * 100 : null;
export const isLateMarketState = (state: string): boolean =>
  ["T_MINUS_120", "T_MINUS_60", "T_MINUS_30", "T_MINUS_15", "LATEST_PRE_FIRST_PITCH"].includes(state);
export const isTrueClosingMarketState = (state: string): boolean => state === "CLOSING";