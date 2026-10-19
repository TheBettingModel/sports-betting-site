export const PROJECTION_REFRESH_MS = 2 * 60_000;

export function retryProjectionQuery(failureCount: number, error: unknown): boolean {
  const value = error as { status?: number; statusCode?: number; response?: { status?: number } } | null;
  const status = value?.status ?? value?.statusCode ?? value?.response?.status;
  // Auth and malformed requests need correction, not repeated premium reads.
  if (status === 401 || status === 403 || status === 400 || status === 404) return false;
  return failureCount < 2;
}

export function projectionQueryKey(sport: string, date: string, viewerId: string | null | undefined,
  entitled: boolean, source: string) {
  return ['/api/model/v4/projections', {
    sport, date, viewerId: viewerId ?? 'signed-out', entitled, source,
  }] as const;
}

export function nextSlateDate(date: string): string {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}