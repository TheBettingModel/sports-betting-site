/**
 * Weather Service — Open-Meteo API (free, no key required)
 *
 * Fetches forecast at each MLB/NFL venue's coordinates for game time.
 * Weather is only meaningful for outdoor/open-roof stadiums.
 *
 * Model impact:
 *   - projectedTotal adjustment (wind/precip/cold reduce scoring in MLB and NFL)
 *   - High-wind MLB games have more variance; used in edge/confidence reporting
 *
 * Cache TTL: 2 hours (forecasts update hourly, precision beyond that unnecessary)
 */

import { logger } from "../lib/logger";
import type { MlbSignalCacheMeta } from "./mlbPitchers";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VenueWeather {
  windSpeedMph: number;
  windDirectionDeg: number;   // 0=N, 90=E, 180=S, 270=W
  precipitationMm: number;    // mm in the hour around game start
  temperatureCelsius: number;
  isDome: boolean;            // if true, skip all adjustments
}

export interface WeatherEffect {
  /** Applied to projectedTotal. Negative = fewer expected runs/points. */
  totalAdjustment: number;
  /** Summary for logging/display, e.g. "Strong wind, high variance" */
  summary: string;
}

// ── Venue map ─────────────────────────────────────────────────────────────────

interface Venue {
  lat: number;
  lon: number;
  /** True = fixed dome OR retractable roof (game conditions unaffected by weather) */
  isDome: boolean;
  name: string;
}

const MLB_VENUES: Record<string, Venue> = {
  ARI: { lat: 33.4453, lon: -112.0667, isDome: true,  name: "Chase Field" },
  ATH: { lat: 38.5803, lon: -121.5067, isDome: false, name: "Sutter Health Park" },
  ATL: { lat: 33.8909, lon: -84.4678,  isDome: false, name: "Truist Park" },
  BAL: { lat: 39.2840, lon: -76.6218,  isDome: false, name: "Camden Yards" },
  BOS: { lat: 42.3467, lon: -71.0972,  isDome: false, name: "Fenway Park" },
  CHC: { lat: 41.9484, lon: -87.6553,  isDome: false, name: "Wrigley Field" },
  CWS: { lat: 41.8300, lon: -87.6339,  isDome: false, name: "Guaranteed Rate Field" },
  CHW: { lat: 41.8300, lon: -87.6339,  isDome: false, name: "Guaranteed Rate Field" }, // ESPN abbr
  CIN: { lat: 39.0979, lon: -84.5068,  isDome: false, name: "Great American Ball Park" },
  CLE: { lat: 41.4963, lon: -81.6852,  isDome: false, name: "Progressive Field" },
  COL: { lat: 39.7559, lon: -104.9942, isDome: false, name: "Coors Field" },
  DET: { lat: 42.3390, lon: -83.0485,  isDome: false, name: "Comerica Park" },
  HOU: { lat: 29.7573, lon: -95.3555,  isDome: true,  name: "Minute Maid Park" },
  KC:  { lat: 39.0517, lon: -94.4803,  isDome: false, name: "Kauffman Stadium" },
  LAA: { lat: 33.8003, lon: -117.8827, isDome: false, name: "Angel Stadium" },
  LAD: { lat: 34.0739, lon: -118.2400, isDome: false, name: "Dodger Stadium" },
  MIA: { lat: 25.7781, lon: -80.2197,  isDome: true,  name: "loanDepot Park" },
  MIL: { lat: 43.0280, lon: -87.9712,  isDome: true,  name: "American Family Field" },
  MIN: { lat: 44.9817, lon: -93.2781,  isDome: false, name: "Target Field" },
  NYM: { lat: 40.7571, lon: -73.8458,  isDome: false, name: "Citi Field" },
  NYY: { lat: 40.8296, lon: -73.9262,  isDome: false, name: "Yankee Stadium" },

  PHI: { lat: 39.9057, lon: -75.1665,  isDome: false, name: "Citizens Bank Park" },
  PIT: { lat: 40.4469, lon: -80.0057,  isDome: false, name: "PNC Park" },
  SD:  { lat: 32.7073, lon: -117.1566, isDome: false, name: "Petco Park" },
  SF:  { lat: 37.7786, lon: -122.3893, isDome: false, name: "Oracle Park" },
  SEA: { lat: 47.5914, lon: -122.3325, isDome: true,  name: "T-Mobile Park" },
  STL: { lat: 38.6226, lon: -90.1928,  isDome: false, name: "Busch Stadium" },
  TB:  { lat: 27.7683, lon: -82.6534,  isDome: true,  name: "Tropicana Field" },
  TEX: { lat: 32.7499, lon: -97.0829,  isDome: true,  name: "Globe Life Field" },
  TOR: { lat: 43.6414, lon: -79.3891,  isDome: true,  name: "Rogers Centre" },
  WSH: { lat: 38.8730, lon: -77.0074,  isDome: false, name: "Nationals Park" },
};

const NFL_VENUES: Record<string, Venue> = {
  ARI: { lat: 33.5277, lon: -112.2626, isDome: true,  name: "State Farm Stadium" },
  ATL: { lat: 33.7553, lon: -84.4006,  isDome: true,  name: "Mercedes-Benz Stadium" },
  BAL: { lat: 39.2779, lon: -76.6227,  isDome: false, name: "M&T Bank Stadium" },
  BUF: { lat: 42.7738, lon: -78.7870,  isDome: false, name: "Highmark Stadium" },
  CAR: { lat: 35.2258, lon: -80.8528,  isDome: false, name: "Bank of America Stadium" },
  CHI: { lat: 41.8623, lon: -87.6167,  isDome: false, name: "Soldier Field" },
  CIN: { lat: 39.0955, lon: -84.5160,  isDome: false, name: "Paycor Stadium" },
  CLE: { lat: 41.5061, lon: -81.6995,  isDome: false, name: "Huntington Bank Field" },
  DAL: { lat: 32.7480, lon: -97.0929,  isDome: true,  name: "AT&T Stadium" },
  DEN: { lat: 39.7439, lon: -105.0201, isDome: false, name: "Empower Field" },
  DET: { lat: 42.3400, lon: -83.0456,  isDome: true,  name: "Ford Field" },
  GB:  { lat: 44.5013, lon: -88.0622,  isDome: false, name: "Lambeau Field" },
  HOU: { lat: 29.6847, lon: -95.4107,  isDome: true,  name: "NRG Stadium" },
  IND: { lat: 39.7601, lon: -86.1639,  isDome: true,  name: "Lucas Oil Stadium" },
  JAX: { lat: 30.3239, lon: -81.6373,  isDome: false, name: "EverBank Stadium" },
  KC:  { lat: 39.0489, lon: -94.4839,  isDome: false, name: "Arrowhead Stadium" },
  LAC: { lat: 33.9535, lon: -118.3392, isDome: true,  name: "SoFi Stadium" },
  LAR: { lat: 33.9535, lon: -118.3392, isDome: true,  name: "SoFi Stadium" },
  LV:  { lat: 36.0909, lon: -115.1833, isDome: true,  name: "Allegiant Stadium" },
  MIA: { lat: 25.9580, lon: -80.2389,  isDome: false, name: "Hard Rock Stadium" },
  MIN: { lat: 44.9736, lon: -93.2575,  isDome: true,  name: "U.S. Bank Stadium" },
  NE:  { lat: 42.0909, lon: -71.2643,  isDome: false, name: "Gillette Stadium" },
  NO:  { lat: 29.9511, lon: -90.0812,  isDome: true,  name: "Caesars Superdome" },
  NYG: { lat: 40.8135, lon: -74.0745,  isDome: false, name: "MetLife Stadium" },
  NYJ: { lat: 40.8135, lon: -74.0745,  isDome: false, name: "MetLife Stadium" },
  PHI: { lat: 39.9008, lon: -75.1675,  isDome: false, name: "Lincoln Financial Field" },
  PIT: { lat: 40.4468, lon: -80.0158,  isDome: false, name: "Acrisure Stadium" },
  SEA: { lat: 47.5952, lon: -122.3316, isDome: false, name: "Lumen Field" },
  SF:  { lat: 37.4033, lon: -121.9694, isDome: false, name: "Levi's Stadium" },
  TB:  { lat: 27.9759, lon: -82.5033,  isDome: false, name: "Raymond James Stadium" },
  TEN: { lat: 36.1665, lon: -86.7713,  isDome: false, name: "Nissan Stadium" },
  WSH: { lat: 38.9076, lon: -76.8644,  isDome: false, name: "Northwest Stadium" },
};

// ── Cache ─────────────────────────────────────────────────────────────────────

interface CacheEntry {
  weather: VenueWeather;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>(); // key: "{abbr}:{dateStr}:{hour}"
const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// ── Open-Meteo fetch ──────────────────────────────────────────────────────────

interface OpenMeteoResponse {
  current?: {
    wind_speed_10m: number;
    wind_direction_10m: number;
    precipitation: number;
    temperature_2m: number;
  };
  hourly?: {
    time: string[];
    wind_speed_10m: number[];
    wind_direction_10m: number[];
    precipitation: number[];
    temperature_2m: number[];
  };
}

async function fetchOpenMeteo(lat: number, lon: number, dateStr: string, hourET: number): Promise<VenueWeather | null> {
  try {
    // Use forecast_days=2 (covers today + tomorrow) without start/end date filters,
    // which return empty arrays when the timezone offset clips the requested day.
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", lat.toFixed(4));
    url.searchParams.set("longitude", lon.toFixed(4));
    url.searchParams.set("hourly", "wind_speed_10m,wind_direction_10m,precipitation,temperature_2m");
    url.searchParams.set("wind_speed_unit", "mph");
    url.searchParams.set("timezone", "America/New_York");
    url.searchParams.set("forecast_days", "2");

    const resp = await fetch(url.toString(), { signal: AbortSignal.timeout(8_000) });
    if (!resp.ok) return null;

    const data = (await resp.json()) as OpenMeteoResponse;
    const hourly = data.hourly;
    if (!hourly || !hourly.time.length) return null;

    // Find the slot matching the game date+hour in ET; fallback to the closest available
    const targetStr = `${dateStr}T${String(hourET).padStart(2, "0")}:00`;
    let idx = hourly.time.findIndex((t) => t >= targetStr);
    if (idx === -1) idx = hourly.time.length - 1; // game is beyond forecast window

    return {
      windSpeedMph:       hourly.wind_speed_10m[idx]      ?? 0,
      windDirectionDeg:   hourly.wind_direction_10m[idx]  ?? 0,
      precipitationMm:    hourly.precipitation[idx]       ?? 0,
      temperatureCelsius: hourly.temperature_2m[idx]      ?? 20,
      isDome: false,
    };
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

function getVenue(sport: string, homeTeamAbbr: string): Venue | null {
  if (sport === "MLB") return MLB_VENUES[homeTeamAbbr] ?? null;
  if (sport === "NFL") return NFL_VENUES[homeTeamAbbr] ?? null;
  return null;
}

/** Parse "7:05 PM ET" → hour in Eastern time (24h) */
function parseGameHourET(gameTime: string): number {
  const m = gameTime.match(/(\d+)(?::(\d+))?\s*(AM|PM)/i);
  if (!m) return 19; // default 7 PM
  let h = parseInt(m[1]);
  const ampm = m[3].toUpperCase();
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return h;
}

export function getVenueWeatherCacheMeta(
  sport: string,
  homeTeamAbbr: string,
  gameDate: string,
  gameTime: string,
): MlbSignalCacheMeta {
  const venue = getVenue(sport, homeTeamAbbr);
  if (venue?.isDome) return { sourceCapturedAt: null, cacheAgeMs: 0, stale: false };
  if (!venue) return { sourceCapturedAt: null, cacheAgeMs: null, stale: true };
  const cached = cache.get(`${homeTeamAbbr}:${gameDate}:${parseGameHourET(gameTime)}`);
  if (!cached) return { sourceCapturedAt: null, cacheAgeMs: null, stale: true };
  const cacheAgeMs = Math.max(0, Date.now() - cached.fetchedAt);
  return {
    sourceCapturedAt: new Date(cached.fetchedAt).toISOString(),
    cacheAgeMs,
    stale: cacheAgeMs >= TTL_MS,
  };
}

/**
 * Fetch weather for an MLB or NFL venue.
 * Returns null for indoor stadiums, unsupported sports, or on fetch failure.
 */
export async function getVenueWeather(
  sport: string,
  homeTeamAbbr: string,
  gameDate: string,  // YYYY-MM-DD
  gameTime: string,  // e.g. "7:05 PM ET"
): Promise<VenueWeather | null> {
  const venue = getVenue(sport, homeTeamAbbr);
  if (!venue) return null;

  // Domes: no weather effect; return early with a synthetic "isDome: true" marker
  if (venue.isDome) {
    return { windSpeedMph: 0, windDirectionDeg: 0, precipitationMm: 0, temperatureCelsius: 20, isDome: true };
  }

  const hour = parseGameHourET(gameTime);
  const cacheKey = `${homeTeamAbbr}:${gameDate}:${hour}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached.weather;

  const raw = await fetchOpenMeteo(venue.lat, venue.lon, gameDate, hour);
  if (!raw) return null;

  raw.isDome = false;
  cache.set(cacheKey, { weather: raw, fetchedAt: Date.now() });

  logger.debug(
    { sport, homeTeamAbbr, venue: venue.name, wind: raw.windSpeedMph, precip: raw.precipitationMm },
    "Weather: fetched venue forecast",
  );

  return raw;
}

/**
 * Translate raw weather into a model-level effect.
 *
 * MLB: wind and rain reduce scoring variance signals; precipitation and cold air
 * reduce projected run totals.
 * NFL: strong wind and precipitation reduce both run and pass efficiency.
 *
 * Does NOT adjust win probability — weather hurts both teams equally.
 * The total adjustment IS an edge signal: if the market hasn't updated the
 * total for today's wind, our projected total is more accurate.
 */
export function computeWeatherEffect(weather: VenueWeather, sport: string): WeatherEffect {
  if (weather.isDome) return { totalAdjustment: 0, summary: "Dome – no weather effect" };

  let totalAdj = 0;
  const notes: string[] = [];

  const wind = weather.windSpeedMph;
  const precip = weather.precipitationMm;
  const tempC = weather.temperatureCelsius;

  if (sport === "MLB") {
    // Wind: high wind in ANY direction creates variance; we don't model direction
    // so use a symmetric dampening: extreme wind ≈ -0.3 total (more variance, regression to mean)
    if (wind > 20) {
      totalAdj -= 0.5;
      notes.push(`Strong wind (${wind.toFixed(0)} mph)`);
    } else if (wind > 12) {
      totalAdj -= 0.2;
      notes.push(`Moderate wind (${wind.toFixed(0)} mph)`);
    }

    // Precipitation reduces pitching grip + batting visibility
    if (precip > 2.0) {
      totalAdj -= 0.5;
      notes.push("Heavy rain");
    } else if (precip > 0.5) {
      totalAdj -= 0.2;
      notes.push("Light rain");
    }

    // Cold air: reduces carry on batted balls (<10°C / 50°F)
    if (tempC < 10) {
      totalAdj -= 0.3;
      notes.push(`Cold (${Math.round(tempC * 1.8 + 32)}°F)`);
    }
  } else if (sport === "NFL") {
    // Wind reduces passing efficiency and FG range
    if (wind > 25) {
      totalAdj -= 4.0;
      notes.push(`Very strong wind (${wind.toFixed(0)} mph)`);
    } else if (wind > 15) {
      totalAdj -= 2.0;
      notes.push(`Strong wind (${wind.toFixed(0)} mph)`);
    } else if (wind > 10) {
      totalAdj -= 1.0;
      notes.push(`Wind (${wind.toFixed(0)} mph)`);
    }

    // Rain: both passing and kicking heavily affected
    if (precip > 2.0) {
      totalAdj -= 3.0;
      notes.push("Heavy rain");
    } else if (precip > 0.5) {
      totalAdj -= 1.5;
      notes.push("Rain");
    }

    // Very cold (< -5°C / 23°F): significant scoring reduction
    if (tempC < -5) {
      totalAdj -= 2.0;
      notes.push(`Extreme cold (${Math.round(tempC * 1.8 + 32)}°F)`);
    } else if (tempC < 0) {
      totalAdj -= 1.0;
      notes.push(`Freezing (${Math.round(tempC * 1.8 + 32)}°F)`);
    }
  }

  const summary = notes.length > 0 ? notes.join(", ") : "Clear conditions";
  return { totalAdjustment: Math.max(-6, Math.min(2, totalAdj)), summary };
}
