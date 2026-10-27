import net from "node:net";
import http from "node:http";
import https from "node:https";

// Installed before service imports. Only an explicitly named disposable Unix
// socket is permitted; no TCP, provider, Render, or managed PostgreSQL traffic.
const url = process.env.ODDS_BUDGET_TEST_DATABASE_URL;
let socket;
if (url) {
  const parsed = new URL(url);
  socket = parsed.searchParams.get("host");
  if (parsed.hostname !== "localhost" || parsed.username !== "budget_test"
    || parsed.pathname !== "/budget_test" || parsed.password
    || !socket?.startsWith("/tmp/tbm-odds-budget-") || !socket.endsWith("/socket")) {
    throw new Error("Refusing non-disposable odds budget database");
  }
  process.env.DATABASE_URL = url;
} else {
  process.env.DATABASE_URL = "postgresql://budget_test@127.0.0.1:1/budget_test";
}
process.env.ODDS_API_COLLECTION_ENABLED = "false";
process.env.ODDS_API_KEY = "";
process.env.SCHEDULER_ENABLED = "false";
const blocked = () => { throw new Error("Offline odds budget tests forbid network access"); };
globalThis.fetch = async () => blocked();
http.request = blocked;
http.get = blocked;
https.request = blocked;
https.get = blocked;
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let first = args[0];
  if (Array.isArray(first)) first = first[0];
  const path = typeof first === "string" ? first : first?.path;
  if (!socket || typeof path !== "string" || !path.startsWith(`${socket}/.s.PGSQL.`)) blocked();
  return Reflect.apply(connect, this, args);
};
