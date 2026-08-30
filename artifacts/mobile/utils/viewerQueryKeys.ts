export function subscriptionStatusQueryKey(userId: string | null | undefined) {
  return ["/api/subscriptions/status", { viewerId: userId ?? "signed-out" }] as const;
}

export function gamesTodayQueryKey(userId: string | null | undefined) {
  return ["/api/games/today", { viewerId: userId ?? "signed-out" }] as const;
}