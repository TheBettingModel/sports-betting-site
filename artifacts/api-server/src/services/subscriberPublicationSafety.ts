/**
 * A model-market opinion is actionable in subscriber output only when the
 * canonical effective publication decision approves that exact side at 1u.
 */
export function isExactPublishedMarketActionable(input: {
  isPublic: unknown;
  publicationStatus: unknown;
  approvedUnits: unknown;
  publishedSelection: unknown;
  candidateSelection: unknown;
}): boolean {
  return input.isPublic === true
    && input.publicationStatus === "PUBLISHED"
    && Number(input.approvedUnits) === 1
    && input.publishedSelection === input.candidateSelection;
}