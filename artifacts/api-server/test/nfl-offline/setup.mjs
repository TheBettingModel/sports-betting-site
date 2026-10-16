import { afterAll, afterEach, beforeEach } from "vitest";
import { state } from "./guard.mjs";

function assertNoUnexpectedIo() {
  const unexpected = state.attempts.filter(attempt => !attempt.expected);
  if (unexpected.length) throw new Error(`Unexpected offline I/O: ${unexpected.map(x => x.kind).join(", ")}`);
}
beforeEach(() => {
  // Also catch swallowed side effects during module collection/import.
  assertNoUnexpectedIo();
  state.attempts.length = 0;
});
afterEach(assertNoUnexpectedIo);
afterAll(() => {
  assertNoUnexpectedIo();
  console.log("[NFL OFFLINE] Guards active; any unapproved DB/network/startup attempt fails the suite.");
});
