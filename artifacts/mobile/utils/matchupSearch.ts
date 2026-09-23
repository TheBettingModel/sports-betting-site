type SearchParticipant = {
  name?: string | null;
  abbreviation?: string | null;
};

type SearchableFixture = {
  awayParticipant: SearchParticipant;
  homeParticipant: SearchParticipant;
};

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function fixtureMatchesTeamSearch(fixture: SearchableFixture, query: string): boolean {
  const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const searchableText = normalizeSearchText([
    fixture.awayParticipant.name,
    fixture.awayParticipant.abbreviation,
    fixture.homeParticipant.name,
    fixture.homeParticipant.abbreviation,
  ].filter(Boolean).join(' '));

  return terms.every((term) => searchableText.includes(term));
}