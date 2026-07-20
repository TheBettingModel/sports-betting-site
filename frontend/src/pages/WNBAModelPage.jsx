import { useCallback, useEffect, useMemo, useState } from "react";
import WNBATabs from "../components/WNBATabs";
import TBMHeroPlayCard from "../components/home/TBMHeroPlayCard";
import TBMTopPlayRow from "../components/home/TBMTopPlayRow";
import TBMDataCard from "../components/cards/TBMDataCard";
import TBMPageHeader from "../components/layout/TBMPageHeader";
import TBMSection from "../components/layout/TBMSection";
import "./WNBAModelPage.css";

const API_URL = import.meta.env.VITE_API_URL;

function normalizeMarket(value) {
  return String(value || "").trim().toLowerCase();
}

function marketMatches(play, marketFilter) {
  if (!marketFilter || marketFilter === "All") {
    return true;
  }

  const playMarket = normalizeMarket(play?.market);
  const targetMarket = normalizeMarket(marketFilter);

  if (targetMarket === "moneyline") {
    return playMarket.includes("moneyline") || playMarket === "ml";
  }

  if (targetMarket === "spread") {
    return playMarket.includes("spread") || playMarket.includes("point");
  }

  if (targetMarket === "total") {
    return (
      playMarket.includes("total") ||
      playMarket.includes("over") ||
      playMarket.includes("under")
    );
  }

  return playMarket === targetMarket;
}

function getEdge(play) {
  const value = Number(play?.edge);
  return Number.isFinite(value) ? value : 0;
}

function getConfidence(play) {
  const value = Number(play?.confidence);
  return Number.isFinite(value) ? value : 0;
}

function getOdds(play) {
  return play?.best_odds ?? play?.odds ?? null;
}

function formatOdds(value) {
  if (value === null || value === undefined || value === "") {
    return "N/A";
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return String(value);
  }

  return number > 0 ? `+${number}` : String(number);
}

function average(values) {
  const validValues = values.filter(Number.isFinite);

  if (!validValues.length) {
    return 0;
  }

  return (
    validValues.reduce((sum, value) => sum + value, 0) /
    validValues.length
  );
}

function getRecommendation(play) {
  return String(
    play?.final_recommendation || play?.recommendation || ""
  ).trim();
}

function isQualifiedPlay(play) {
  const recommendation = getRecommendation(play).toLowerCase();

  return (
    recommendation === "play" ||
    recommendation === "best bet" ||
    recommendation === "strong play"
  );
}

function getLastUpdated(data) {
  const raw =
    data?.last_updated ||
    data?.updated_at ||
    data?.generated_at;

  if (!raw) {
    return "Live";
  }

  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) {
    return "Live";
  }

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function WNBAModelPage({
  marketFilter = "All",
  title = "WNBA Model Dashboard",
}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const loadWNBA = useCallback(async ({ silent = false } = {}) => {
    const controller = new AbortController();

    const timeout = window.setTimeout(() => {
      controller.abort();
    }, 30000);

    try {
      if (!silent) {
        setRefreshing(true);
      }

      const response = await fetch(`${API_URL}/model/wnba/today`, {
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`WNBA request failed: HTTP ${response.status}`);
      }

      const json = await response.json();

      setData(json);
      setError("");
    } catch (requestError) {
      if (requestError?.name !== "AbortError") {
        console.error("WNBA model fetch error:", requestError);
        setError("The WNBA dashboard could not be loaded.");
      }
    } finally {
      window.clearTimeout(timeout);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadWNBA();

    const interval = window.setInterval(() => {
      loadWNBA({ silent: true });
    }, 120000);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadWNBA]);

  const allPlays = useMemo(() => {
    return Array.isArray(data?.plays)
      ? data.plays.filter(
          (play) => play && typeof play === "object"
        )
      : [];
  }, [data]);

  const filteredPlays = useMemo(() => {
    return allPlays
      .filter((play) => marketMatches(play, marketFilter))
      .sort((a, b) => getEdge(b) - getEdge(a));
  }, [allPlays, marketFilter]);

  const canonicalTopPlay = useMemo(() => {
    const backendTopPlay = data?.top_play;

    if (
      backendTopPlay &&
      typeof backendTopPlay === "object" &&
      marketMatches(backendTopPlay, marketFilter)
    ) {
      return backendTopPlay;
    }

    return filteredPlays[0] || null;
  }, [data, filteredPlays, marketFilter]);

  const averageEdge = useMemo(() => {
    return average(filteredPlays.map(getEdge));
  }, [filteredPlays]);

  const averageConfidence = useMemo(() => {
    return average(filteredPlays.map(getConfidence));
  }, [filteredPlays]);

  const qualifiedCount = useMemo(() => {
    return filteredPlays.filter(isQualifiedPlay).length;
  }, [filteredPlays]);

  const displayMarket =
    marketFilter === "All" ? "All Markets" : marketFilter;

  return (
    <main className="wnba-v2-page">
      <TBMPageHeader
        title={title}
        badge="WNBA Model"
      />

      <section className="wnba-v2-status">
        <div className="wnba-v2-status-live">
          <i />

          <div>
            <strong>WNBA Model Live</strong>
            <span>Ranked by model edge</span>
          </div>
        </div>

        <div className="wnba-v2-status-actions">
          <span>{displayMarket}</span>

          <span>
            Updated {getLastUpdated(data)}
          </span>

          <button
            type="button"
            onClick={() => loadWNBA()}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </section>

      <WNBATabs />

      {error && !data ? (
        <section className="wnba-v2-state wnba-v2-error">
          <strong>Unable to load WNBA model</strong>
          <span>{error}</span>

          <button
            type="button"
            onClick={() => loadWNBA()}
          >
            Try Again
          </button>
        </section>
      ) : !data ? (
        <section className="wnba-v2-state">
          <strong>Loading WNBA model</strong>

          <span>
            Pulling today’s games, market prices and model edges.
          </span>
        </section>
      ) : (
        <>
          {error ? (
            <div className="wnba-v2-warning">
              {error} Showing the most recently loaded results.
            </div>
          ) : null}

          <section className="wnba-v2-kpis">
            <TBMDataCard
              label="Available Plays"
              value={filteredPlays.length}
              tone="blue"
            />

            <TBMDataCard
              label="Qualified Plays"
              value={qualifiedCount}
              tone="green"
            />

            <TBMDataCard
              label="Average Edge"
              value={`${averageEdge.toFixed(2)}%`}
              tone="green"
            />

            <TBMDataCard
              label="Average Confidence"
              value={`${averageConfidence.toFixed(1)}%`}
              tone="gold"
            />
          </section>

          <section className="wnba-v2-hero">
            <div className="wnba-v2-section-label">
              <div>
                <span>Official WNBA Top Play</span>
                <strong>Canonical dashboard selection</strong>
              </div>

              {canonicalTopPlay ? (
                <em>{formatOdds(getOdds(canonicalTopPlay))}</em>
              ) : null}
            </div>

            <TBMHeroPlayCard play={canonicalTopPlay} />
          </section>

          <TBMSection title="WNBA Edge Board">
            <div className="wnba-v2-board-heading">
              <span>
                Compact rankings across {displayMarket.toLowerCase()}
              </span>

              <strong>{filteredPlays.length} Plays</strong>
            </div>

            <div className="wnba-v2-play-list">
              {filteredPlays.length > 0 ? (
                filteredPlays.map((play, index) => (
                  <TBMTopPlayRow
                    key={`${play?.game || "game"}-${play?.pick || "pick"}-${index}`}
                    play={{
                      ...play,
                      sport: play?.sport || "WNBA",
                    }}
                    index={index}
                  />
                ))
              ) : (
                <div className="wnba-v2-empty">
                  <strong>No WNBA plays available</strong>

                  <span>
                    The current slate has no plays for this market filter.
                  </span>
                </div>
              )}
            </div>
          </TBMSection>

          <footer className="wnba-v2-footer">
            <span>
              Top play: {canonicalTopPlay?.pick || "No Play"}
            </span>

            <span>
              Model: {data?.model_version || "WNBA Universal Model"}
            </span>
          </footer>
        </>
      )}
    </main>
  );
}

export default WNBAModelPage;
