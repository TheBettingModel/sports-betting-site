/** Format installed metadata without inventing a missing version or build. */
export function formatAppVersionLabel(
  version: string | null | undefined,
  build: string | null | undefined,
  isPreview = false,
): string {
  const label = version?.trim() || 'Unavailable';
  if (isPreview) return `${label} (preview)`;
  return build?.trim() ? `${label} (${build.trim()})` : label;
}
