/** Publication is reserved for an actionable, positive-risk wager. */
export function isActionablePublication(recommendation: string, units: number): boolean {
  return (recommendation === "Strong Buy" || recommendation === "Buy")
    && Number.isFinite(units)
    && units > 0;
}