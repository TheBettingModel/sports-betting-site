/** Synthetic regressions, NOT downloaded payloads or verified historical scores.
 * 90000000x are deliberately fictional event IDs. Seattle scores are illustrative.
 */
export function finalEvent(input: {
  id?: string; date?: string; homeId?: string; awayId?: string;
  homeName?: string; awayName?: string; homeScore?: unknown; awayScore?: unknown;
  seasonType?: number;
} = {}) {
  const id = input.id ?? "900000001";
  const date = input.date ?? "2026-09-14T00:20:00Z";
  return {
    id, date, season: { year: 2026, type: input.seasonType ?? 2 },
    status: { type: { state: "post", completed: true, name: "STATUS_FINAL" } },
    competitions: [{
      id, date,
      competitors: [
        { id: input.awayId ?? "7", homeAway: "away",
          team: { id: input.awayId ?? "7", displayName: input.awayName ?? "Denver Broncos" },
          score: input.awayScore === undefined ? "10" : input.awayScore },
        { id: input.homeId ?? "12", homeAway: "home",
          team: { id: input.homeId ?? "12", displayName: input.homeName ?? "Kansas City Chiefs" },
          score: input.homeScore === undefined ? "31" : input.homeScore },
      ],
    }],
  };
}

export function seattleNewEnglandEvent() {
  return finalEvent({
    id: "900000002", date: "2026-09-09T00:20:00Z",
    homeId: "17", awayId: "26", homeName: "New England Patriots", awayName: "Seattle Seahawks",
    homeScore: "24", awayScore: "17",
  });
}
