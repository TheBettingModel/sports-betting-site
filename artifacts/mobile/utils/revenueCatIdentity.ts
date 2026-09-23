export class StaleSubscriptionIdentityError extends Error {
  constructor() {
    super("The signed-in account changed while subscription access was loading.");
    this.name = "StaleSubscriptionIdentityError";
  }
}

interface IdentityCoordinatorDependencies {
  getCurrentUserId: () => string | null | undefined;
  logIn: (userId: string) => Promise<void>;
  logOut: () => Promise<void>;
}

export function createRevenueCatIdentityCoordinator({
  getCurrentUserId,
  logIn,
  logOut,
}: IdentityCoordinatorDependencies) {
  let identifiedUserId: string | null = null;
  let queue: Promise<void> = Promise.resolve();

  const enqueue = (operation: () => Promise<void>) => {
    const pending = queue.catch(() => undefined).then(operation);
    queue = pending.catch(() => undefined);
    return pending;
  };

  const assertCurrent = (expectedUserId: string) => {
    if (getCurrentUserId() !== expectedUserId) {
      throw new StaleSubscriptionIdentityError();
    }
  };

  const identify = (expectedUserId: string) =>
    enqueue(async () => {
      assertCurrent(expectedUserId);
      if (identifiedUserId !== expectedUserId) {
        await logIn(expectedUserId);
      }
      if (getCurrentUserId() !== expectedUserId) {
        await logOut();
        identifiedUserId = null;
        throw new StaleSubscriptionIdentityError();
      }
      identifiedUserId = expectedUserId;
    });

  const reset = () =>
    enqueue(async () => {
      if (identifiedUserId !== null) {
        await logOut();
      }
      identifiedUserId = null;
    });

  return { identify, reset, assertCurrent };
}