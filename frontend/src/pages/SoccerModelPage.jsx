import { useCallback, useEffect, useMemo, useState } from "react";
import TBMHeroPlayCard from "../components/home/TBMHeroPlayCard";
import TBMTopPlayRow from "../components/home/TBMTopPlayRow";
import TBMDataCard from "../components/cards/TBMDataCard";
import TBMPageHeader from "../components/layout/TBMPageHeader";
import TBMSection from "../components/layout/TBMSection";
import "./SoccerModelPage.css";

const API_URL = import.meta.env.VITE_API_URL;

const MARKET_FILTERS = [
  "All",
  "Moneyline",
  "Spread",
  "Total",
  "Draw",
];

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getMarket(play) {
  return normalizeText(play?.market);
}

function getPick(play) {
  return normalizeText(play?.pick);
}

function marketMatches(play, filter) {
  if (!filter || filter === "All") {
    return true;
  }

  const market = getMarket(play);
  const pick = getPick(play);
  const normalizedFilter = normalizeText(filter);

  if (normalizedFilter === "moneyline") {
    return (
      market.includes("moneyline") ||
      market === "ml" ||
      market.includes("match winner")
    );
  }

  if (normalizedFilter === "spread") {
    return (
      market.includes("spread") ||
      market.includes("handicap") ||
      market.includes("asian")
    );
  }

  if (normalizedFilter === "total") {
    return (
      market.includes("total") ||
      market.includes("over") ||
      market.includes("under") ||
      pick.startsWith("over ") ||
      pick.startsWith("under ")
    );
  }

  if (normalizedFilter === "draw") {
    return (
      market.includes("draw") ||
      pick === "draw" ||
      pick.startsWith("draw ") ||
      pick.includes(" draw")
    );
  }

  return market === normalizedFilter;
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
  const value = Number.parseFloat(play?.universal_pod_score);
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
  const recommendation =
    normalizeText(getRecommendation(play));

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

function SoccerModelPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [marketFilter, setMarketFilter] =
    useState("All");
  const [refreshing, setRefreshing] =
    useState(false);

  const loadSoccer = useCallback(
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
          `${API_URL}/model/soccer/today`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error(
            `Soccer request failed: HTTP ${response.status}`
          );
        }

        const json = await response.json();

        setData(json);
        setError("");
      } catch (requestError) {
        if (requestError?.name !== "AbortError") {
          console.error(
            "Soccer model fetch error:",
            requestError
          );

          setError(
            "The Soccer dashboard could not be loaded."
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
    loadSoccer();

    const interval = window.setInterval(() => {
      loadSoccer({
        silent: true,
      });
    }, 120000);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadSoccer]);

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
    <main className="soccer-v2-page">
      <TBMPageHeader
        title="Soccer Model Dashboard"
        badge="Soccer Model"
      />

      <section className="soccer-v2-status">
        <div className="soccer-v2-status-live">
          <i />

          <div>
            <strong>
              Soccer Model Live
            </strong>

            <span>
              Universal market rankings
            </span>
          </div>
        </div>

        <div className="soccer-v2-status-actions">
          <span>{displayMarket}</span>

          <span>
            Updated{" "}
            {getLastUpdated(data)}
          </span>

          <button
            type="button"
            onClick={() =>
              loadSoccer()
            }
            disabled={refreshing}
          >
            {refreshing
              ? "Refreshing..."
              : "Refresh"}
          </button>
        </div>
      </section>

      <nav
        className="soccer-v2-filters"
        aria-label="Soccer market filters"
      >
        {MARKET_FILTERS.map(
          (market) => (
            <button
              key={market}
              type="button"
              className={
                marketFilter === market
                  ? "soccer-v2-filter soccer-v2-filter-active"
                  : "soccer-v2-filter"
              }
              onClick={() =>
                setMarketFilter(market)
              }
            >
              {market}
            </button>
          )
        )}
      </nav>

      {error && !data ? (
        <section className="soccer-v2-state soccer-v2-error">
          <strong>
            Unable to load Soccer model
          </strong>

          <span>{error}</span>

          <button
            type="button"
            onClick={() =>
              loadSoccer()
            }
          >
            Try Again
          </button>
        </section>
      ) : !data ? (
        <section className="soccer-v2-state">
          <strong>
            Loading Soccer model
          </strong>

          <span>
            Pulling today’s matches,
            market prices and model
            edges.
          </span>
        </section>
      ) : (
        <>
          {error ? (
            <div className="soccer-v2-warning">
              {error} Showing the most
              recently loaded results.
            </div>
          ) : null}

          <section className="soccer-v2-kpis">
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

          <section className="soccer-v2-hero">
            <div className="soccer-v2-section-label">
              <div>
                <span>
                  Official Soccer Top Play
                </span>

                <strong>
                  Universal model selection
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
                        "Soccer",
                    }
                  : null
              }
            />
          </section>

          <TBMSection title="Soccer Edge Board">
            <div className="soccer-v2-board-heading">
              <span>
                Ranked by POD score and
                model edge
              </span>

              <strong>
                {filteredPlays.length} Plays
              </strong>
            </div>

            <div className="soccer-v2-play-list">
              {filteredPlays.length > 0 ? (
                filteredPlays.map(
                  (play, index) => (
                    <TBMTopPlayRow
                      key={`${play?.game || "game"}-${play?.pick || "pick"}-${index}`}
                      play={{
                        ...play,
                        sport:
                          play?.sport ||
                          "Soccer",
                      }}
                      index={index}
                    />
                  )
                )
              ) : (
                <div className="soccer-v2-empty">
                  <strong>
                    No Soccer plays
                    available
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

          <footer className="soccer-v2-footer">
            <span>
              Top play:{" "}
              {canonicalTopPlay?.pick ||
                "No Play"}
            </span>

            <span>
              Model:{" "}
              {data?.model_version ||
                canonicalTopPlay?.model_version ||
                "Soccer Universal Model"}
            </span>
          </footer>
        </>
      )}
    </main>
  );
}

export default SoccerModelPage;
