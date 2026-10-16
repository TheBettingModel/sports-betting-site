import { deny } from "./guard.mjs";

export function fetchSportGamesByDate() {
  return deny("espn.request");
}
