/** The API returns oldest-first. Copy before reversing to preserve its cache. */
export function newestChatUpdates<T>(messages: readonly T[]): T[] {
  return [...messages].reverse();
}
