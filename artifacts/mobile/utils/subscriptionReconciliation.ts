export interface ActiveEntitlement {
  expirationDate: string | null;
}

interface SyncResult {
  synced: boolean;
  isSubscribed: boolean;
}

interface StatusResult {
  isSubscribed: boolean;
}

interface ReconciliationDependencies<TStatus extends StatusResult> {
  entitlement: ActiveEntitlement | undefined;
  sync: (expiresAt: string | null) => Promise<SyncResult>;
  getStatus: () => Promise<TStatus>;
  refreshGames: () => Promise<void>;
}

export async function completeSubscriptionReconciliation<TStatus extends StatusResult>({
  entitlement,
  sync,
  getStatus,
  refreshGames,
}: ReconciliationDependencies<TStatus>): Promise<TStatus> {
  if (!entitlement) {
    throw new Error("No active Pro purchase was found for this account.");
  }

  const synced = await sync(entitlement.expirationDate);
  if (!synced.synced || !synced.isSubscribed) {
    throw new Error("The server could not confirm your Pro access.");
  }

  const status = await getStatus();
  if (!status.isSubscribed) {
    throw new Error(
      "Your purchase is active, but Pro access is not ready yet. Please tap Restore Purchases to retry.",
    );
  }

  await refreshGames();
  return status;
}