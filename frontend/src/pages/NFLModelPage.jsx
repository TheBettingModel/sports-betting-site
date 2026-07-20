import { useCallback, useEffect, useMemo, useState } from "react";
import NFLTabs from "../components/NFLTabs";
import TBMHeroPlayCard from "../components/home/TBMHeroPlayCard";
import TBMTopPlayRow from "../components/home/TBMTopPlayRow";
import TBMDataCard from "../components/cards/TBMDataCard";
import TBMPageHeader from "../components/layout/TBMPageHeader";
import TBMSection from "../components/layout/TBMSection";
import "./NFLModelPage.css";

const API_URL = import.meta.env.VITE_API_URL;

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getMarket(play) {
  return normalizeText(play?.market);
}

function marketMatches(play, marketFilter) {
  if (!marketFilter || marketFilter === "All") {
    return true;
  }

  const playMarket = getMarket(play);
  const targetMarket = normalizeText(marketFilter);

  if (targetMarket === "moneyline") {
    return (
      playMarket.includes("moneyline") ||
      playMarket === "ml"
    );
  }

  if (targetMarket === "spread") {
    return (
      playMarket.includes("spread") ||
      playMarket.includes("point spread")
    );
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
  const value = Number.parseFloat(play?.edge);
  return Number.isFinite(value) ? value : 0;
}

function getConfidence(play) {
  const value = Number.parseFloat(play?.confidence);
  return Number.isFinite(value) ? value : 0;
}

function getPodScore(play) {
  const value = Number.parseFloat(
    play?.universal_pod_score ??
      play?.auto_pod_score
  );

  return Number.isFinite(value) ? value : 0;
}

function getOdds(play) {
  return (
    play?.best_odds ??
    play?.odds ??
    null
  );
}

function formatOdds(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "N/A";
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return String(value);
  }

  return numericValue > 0
    ? `+${numericValue}`
    : String(numericValue);
}

function average(values) {
  const validValues = values.filter(Number.isFinite);

  if (!validValues.length) {
    return 0;
  }

  return (
    validValues.reduce(
      (sum, value) => sum + value,
      0
    ) / validValues.length
  );
}

function getRecommendation(play) {
  return String(
    play?.final_recommendation ||
      play?.recommendation ||
      ""
  ).trim();
}

function isQualifiedPlay(play) {
  const recommendation = normalizeText(
    getRecommendation(play)
  );

  return (
    recommendation === "play" ||
    recommendation === "best bet" ||
    recommendation === "strong play" ||
    recommendation === "official play"
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

function NFLModelPage({
  marketFilter = "All",
  title = "NFL Moneyline Model",
}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const loadNFL = useCallback(
    async ({ silent = false } = {}) => {
      const controller = new AbortController();

      const timeout = window.setTimeout(() => {
        controller.abort();
      }, 30000);

      try {
        if (!silent) {
          setRefreshing(true);
        }

        const response = await fetch(
          `${API_URL}/model/nfl/today`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error(
            `NFL request failed: HTTP ${response.status}`
          );
        }

        const json = await response.json();

        setData(json);
        setError("");
      } catch (requestError) {
        if (requestError?.name !== "AbortError") {
          console.error(
            "NFL model fetch error:",
            requestError
          );

          setError(
            "The NFL dashboard could not be loaded."
          );
        }
      } finally {
        window.clearTimeout(timeout);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    loadNFL();

    const interval = window.setInterval(() => {
      loadNFL({
        silent: true,
      });
    }, 120000);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadNFL]);

  const allPlays = useMemo(() => {
    if (!Array.isArray(data?.plays)) {
      return [];
    }

    return data.plays.filter(
      (play) =>
        play &&
        typeof play === "object"
    );
  }, [data]);

  const filteredPlays = useMemo(() => {
    return allPlays
      .filter((play) =>
        marketMatches(
          play,
          marketFilter
        )
      )
      .sort((a, b) => {
        const podDifference =
          getPodScore(b) -
          getPodScore(a);

        if (podDifference !== 0) {
          return podDifference;
        }

        return (
          getEdge(b) -
          getEdge(a)
        );
      });
  }, [allPlays, marketFilter]);

  const canonicalTopPlay = useMemo(() => {
    const backendTopPlay =
      data?.top_play;

    if (
      backendTopPlay &&
      typeof backendTopPlay === "object" &&
      marketMatches(
        backendTopPlay,
        marketFilter
      )
    ) {
      return backendTopPlay;
    }

    return filteredPlays[0] || null;
  }, [
    data,
    filteredPlays,
    marketFilter,
  ]);

  const qualifiedCount = useMemo(() => {
    return filteredPlays.filter(
      isQualifiedPlay
    ).length;
  }, [filteredPlays]);

  const averageEdge = useMemo(() => {
    return average(
      filteredPlays.map(getEdge)
    );
  }, [filteredPlays]);

  const averageConfidence = useMemo(() => {
    return average(
      filteredPlays.map(
        getConfidence
      )
    );
  }, [filteredPlays]);

  const displayMarket =
    marketFilter === "All"
      ? "All Markets"
      : marketFilter;

  return (
    <main className="nfl-v2-page">
      <TBMPageHeader
        title={title}
        badge="NFL Model"
      />

      <section className="nfl-v2-status">
        <div className="nfl-v2-status-live">
          <i />

          <div>
            <strong>
              NFL Model Live
            </strong>

            <span>
              Ranked by POD score and edge
            </span>
          </div>
        </div>

        <div className="nfl-v2-status-actions">
          <span>{displayMarket}</span>

          <span>
            Updated{" "}
            {getLastUpdated(data)}
          </span>

          <button
            type="button"
            onClick={() =>
              loadNFL()
            }
            disabled={refreshing}
          >
            {refreshing
              ? "Refreshing..."
              : "Refresh"}
          </button>
        </div>
      </section>

      <NFLTabs />

      {error && !data ? (
        <section className="nfl-v2-state nfl-v2-error">
          <strong>
            Unable to load NFL model
          </strong>

          <span>{error}</span>

          <button
            type="button"
            onClick={() =>
              loadNFL()
            }
          >
            Try Again
          </button>
        </section>
      ) : !data ? (
        <section className="nfl-v2-state">
          <strong>
            Loading NFL model
          </strong>

          <span>
            Pulling today’s games,
            market prices and model
            edges.
          </span>
        </section>
      ) : (
        <>
          {error ? (
            <div className="nfl-v2-warning">
              {error} Showing the most
              recently loaded results.
            </div>
          ) : null}

          <section className="nfl-v2-kpis">
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
              value={`${averageEdge.toFixed(
                2
              )}%`}
              tone="green"
            />

            <TBMDataCard
              label="Average Confidence"
              value={`${averageConfidence.toFixed(
                1
              )}%`}
              tone="gold"
            />
          </section>

          <section className="nfl-v2-hero">
            <div className="nfl-v2-section-label">
              <div>
                <span>
                  Official NFL Top Play
                </span>

                <strong>
                  Canonical model selection
                </strong>
              </div>

              {canonicalTopPlay ? (
                <em>
                  {formatOdds(
                    getOdds(
                      canonicalTopPlay
                    )
                  )}
                </em>
              ) : null}
            </div>

            <TBMHeroPlayCard
              play={
                canonicalTopPlay
                  ? {
                      ...canonicalTopPlay,
                      sport:
                        canonicalTopPlay?.sport ||
                        "NFL",
                    }
                  : null
              }
            />
          </section>

          <TBMSection title="NFL Edge Board">
            <div className="nfl-v2-board-heading">
              <span>
                Compact rankings across{" "}
                {displayMarket.toLowerCase()}
              </span>

              <strong>
                {filteredPlays.length} Plays
              </strong>
            </div>

            <div className="nfl-v2-play-list">
              {filteredPlays.length > 0 ? (
                filteredPlays.map(
                  (play, index) => (
                    <TBMTopPlayRow
                      key={`${play?.game || "game"}-${play?.pick || "pick"}-${index}`}
                      play={{
                        ...play,
                        sport:
                          play?.sport ||
                          "NFL",
                      }}
                      index={index}
                    />
                  )
                )
              ) : (
                <div className="nfl-v2-empty">
                  <strong>
                    No NFL plays available
                  </strong>

                  <span>
                    The current slate has
                    no plays for this market
                    filter.
                  </span>
                </div>
              )}
            </div>
          </TBMSection>

          <footer className="nfl-v2-footer">
            <span>
              Top play:{" "}
              {canonicalTopPlay?.pick ||
                "No Play"}
            </span>

            <span>
              Model:{" "}
              {data?.model_version ||
                canonicalTopPlay?.model_version ||
                "NFL Universal Model"}
            </span>
          </footer>
        </>
      )}
    </main>
  );
}

export default NFLModelPage;
