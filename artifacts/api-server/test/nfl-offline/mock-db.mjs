import { deny } from "./guard.mjs";

// No real schema index, driver, pool, or connection module is imported.
export const gamesTable = Object.freeze({});
export const gameResultsTable = Object.freeze({});
export const db = new Proxy({}, { get() { return deny("database.query"); } });
export const pool = new Proxy({}, { get() { return deny("database.pool"); } });
