import { useEffect, useMemo, useState } from "react";
import TBMHeroPlayCard from "../components/home/TBMHeroPlayCard";
import TBMTopPlayRow from "../components/home/TBMTopPlayRow";
import TBMSportCard from "../components/home/TBMSportCard";
import TBMDataCard from "../components/cards/TBMDataCard";
import TBMTopPlaysTable from "../components/cards/TBMTopPlaysTable";
import TBMPageHeader from "../components/layout/TBMPageHeader";
import TBMSection from "../components/layout/TBMSection";
import "./AutoPODPage.css";

const API_URL = import.meta.env.VITE_API_URL;

const SPORT_ROUTES = {
  MLB: "/mlb-model",
  NBA: "/model-board",
  NFL: "/nfl-model",
  NHL: "/nhl-model",
  WNBA: "/wnba-model",
  NCAAF: "/ncaaf-model",
  NCAAMB: "/model/ncaamb",
  Soccer: "/soccer-model",
  UFC: "/model/ufc",
};

const SPORT_ORDER = [
  "MLB",
  "WNBA",
  "NBA",
  "NFL",
  "NHL",
  "NCAAF",
  "NCAAMB",
  "Soccer",
  "UFC",
];

function normalizeSportName(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  const aliases = {
    mlb: "MLB",
    baseball: "MLB",
    nba: "NBA",
    nfl: "NFL",
    nhl: "NHL",
    wnba: "WNBA",
    ncaaf: "NCAAF",
    "college football": "NCAAF",
    ncaamb: "NCAAMB",
    "college basketball": "NCAAMB",
    soccer: "Soccer",
    football: "Soccer",
    ufc: "UFC",
    mma: "UFC",
  };

  return aliases[normalized] || value;
}

function getPlaySport(play, fallbackSport = "") {
  return normalizeSportName(
    play?.pod_sport ||
      play?.sport ||
      play?.league ||
      fallbackSport
  );
}

function normalizeSportObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce((result, [sport, play]) => {
    if (!play) {
      return result;
    }

    const normalizedSport = getPlaySport(play, sport);

    if (!normalizedSport) {
      return result;
    }

    result[normalizedSport] = {
      ...play,
      sport: getPlaySport(play, sport),
    };

    return result;
  }, {});
}

function normalizeBestBySport(data, overallPlay, topPlays) {
  const bestBySport = normalizeSportObject(data?.best_by_sport);
  const bySport = normalizeSportObject(data?.by_sport);

  const cleaned = {
    ...bySport,
    ...bestBySport,
  };

  if (Array.isArray(topPlays)) {
    topPlays.forEach((play) => {
      const sport = getPlaySport(play);

      if (sport && !cleaned[sport]) {
        cleaned[sport] = {
          ...play,
          sport,
        };
      }
    });
  }

  const overallSport = getPlaySport(overallPlay);

  if (overallPlay && overallSport) {
    cleaned[overallSport] = {
      ...overallPlay,
      sport: overallSport,
    };
  }

  return Object.entries(cleaned)
    .map(([sport, play]) => ({
      sport: normalizeSportName(sport),
      play,
    }))
    .filter(({ sport, play }) => Boolean(sport && play))
    .sort((a, b) => {
      const aIndex = SPORT_ORDER.indexOf(a.sport);
      const bIndex = SPORT_ORDER.indexOf(b.sport);

      const safeA = aIndex === -1 ? SPORT_ORDER.length : aIndex;
      const safeB = bIndex === -1 ? SPORT_ORDER.length : bIndex;

      return safeA - safeB;
    });
}

function getScore(play) {
  return (
    play?.universal_pod_score ??
    play?.pod_score ??
    play?.final_model_score ??
    play?.top_play_score ??
    "N/A"
  );
}

async function fetchJson(path) {
  const response = await fetch(`${API_URL}${path}`);

  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }

  return response.json();
}

function mergeDashboardData(podData, homepageData) {
  return {
    ...(homepageData || {}),
    ...(podData || {}),

    overall_play:
      podData?.overall_play ||
      podData?.play_of_the_day ||
      homepageData?.overall_play ||
      homepageData?.play_of_the_day ||
      null,

    top_5:
      Array.isArray(podData?.top_5) && podData.top_5.length > 0
        ? podData.top_5
        : Array.isArray(homepageData?.top_5)
          ? homepageData.top_5
          : [],

    best_by_sport: {
      ...normalizeSportObject(homepageData?.by_sport),
      ...normalizeSportObject(homepageData?.best_by_sport),
      ...normalizeSportObject(podData?.by_sport),
      ...normalizeSportObject(podData?.best_by_sport),
    },
  };
}

function AutoPODPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadPlayOfTheDay() {
      try {
        setError("");

        const [podResult, homepageResult] =
          await Promise.allSettled([
            fetchJson("/model/play-of-the-day-v2"),
            fetchJson("/homepage"),
          ]);

        const podData =
          podResult.status === "fulfilled"
            ? podResult.value
            : null;

        const homepageData =
          homepageResult.status === "fulfilled"
            ? homepageResult.value
            : null;

        if (!podData && !homepageData) {
          throw new Error(
            "Both Play of the Day endpoints failed."
          );
        }

        if (active) {
          setData(
            mergeDashboardData(podData, homepageData)
          );
        }
      } catch (err) {
        console.error("Auto POD fetch error:", err);

        if (active) {
          setError("Failed to load Play of the Day.");
        }
      }
    }

    loadPlayOfTheDay();

    return () => {
      active = false;
    };
  }, []);

  const overallPlay =
    data?.overall_play ||
    data?.play_of_the_day ||
    null;

  const topPlays = Array.isArray(data?.top_5)
    ? data.top_5
    : [];

  const sportCards = useMemo(
    () =>
      normalizeBestBySport(
        data,
        overallPlay,
        topPlays
      ),
    [data, overallPlay, topPlays]
  );

  return (
    <main className="auto-pod-page">
      <TBMPageHeader
        title="Play of the Day"
        badge="Premium Dashboard"
      />

      {error ? (
        <div className="auto-pod-state auto-pod-error">
          {error}
        </div>
      ) : !data ? (
        <div className="auto-pod-state">
          Loading Play of the Day...
        </div>
      ) : (
        <>
          <section className="auto-pod-kpis">
            <TBMDataCard
              label="Overall Play"
              value={overallPlay?.pick || "No Play"}
              tone="green"
            />

            <TBMDataCard
              label="Premium Plays"
              value={topPlays.length}
              tone="blue"
            />

            <TBMDataCard
              label="POD Score"
              value={getScore(overallPlay)}
              tone="gold"
            />
          </section>

          <TBMHeroPlayCard
            play={overallPlay}
            label="Overall Play of the Day"
          />

          <TBMSection title="Today's Premium Card">
            <div className="auto-pod-premium-list">
              {topPlays.length > 0 ? (
                topPlays.map((play, index) => (
                  <TBMTopPlayRow
                    key={`${play?.game}-${play?.pick}-${index}`}
                    play={play}
                    index={index}
                  />
                ))
              ) : (
                <div className="auto-pod-empty">
                  No premium plays available yet.
                </div>
              )}
            </div>
          </TBMSection>

          <TBMSection title="Best Play by Sport">
            <div className="auto-pod-sport-grid">
              {sportCards.length > 0 ? (
                sportCards.map(({ sport, play }) => (
                  <TBMSportCard
                    key={sport}
                    name={sport}
                    play={play}
                    href={SPORT_ROUTES[sport] || "#"}
                  />
                ))
              ) : (
                <div className="auto-pod-empty">
                  No sport plays available.
                </div>
              )}
            </div>
          </TBMSection>

          <TBMSection title="Top Plays Table">
            <TBMTopPlaysTable plays={topPlays} />
          </TBMSection>
        </>
      )}
    </main>
  );
}

export default AutoPODPage;
