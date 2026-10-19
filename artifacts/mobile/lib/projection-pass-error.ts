/** A transport failure can happen after commit; never promise it did not spend a pass. */
export function projectionPassErrorMessage(error: unknown): string {
  const response = error as { status?: number; data?: { code?: string } } | null;
  if (response?.status === 409) {
    switch (response.data?.code) {
      case "PROJECTION_UNAVAILABLE":
        return "A saved projection is not available for this game yet. Your pass has not been used. Please choose another game.";
      case "GAME_STARTED":
      case "GAME_NOT_UPCOMING":
        return "This game is no longer available for a free unlock. Your pass has not been used. Please choose another upcoming game.";
      case "PASS_ALREADY_USED":
        return "Your Projection Pass is already active. Open your unlocked game, or wait until your next pass is available.";
      case "PRO_NOT_REQUIRED":
        return "Your Pro plan already includes every projection. Refresh your account to continue.";
    }
  }
  return "We couldn't confirm the unlock. Your pass status is being refreshed. Please check it before trying again.";
}
