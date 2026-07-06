import { useEffect, useMemo, useState } from "react";
import MLBTabs from "../components/MLBTabs";
import TBMTeamLogo from "../components/logos/TBMTeamLogo";
import TBMSportsbookBadge from "../components/logos/TBMSportsbookBadge";
import { TBMPage, TBMCard, TBMBadge, TBMMetric, TBMGrid } from "../components/ui";

const API_URL = import.meta.env.VITE_API_URL;

function formatOdds(value) {
  if (value === null || value === undefined || value === "") return "N/A";
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return num > 0 ? `+${num}` : `${num}`;
}

function splitGame(game = "") {
  if (game.includes(" vs ")) {
    const [away, home] = game.split(" vs ");
    return { away, home };
  }

  if (game.includes(" at ")) {
    const [away, home] = game.split(" at ");
    return { away, home };
  }

  return { away: "Away", home: "Home" };
}

function getBook(play) {
  return play?.best_sportsbook || play?.sportsbook || "Best Available";
}

function getRecommendationTone(recommendation) {
  if (recommendation === "Play") return "green";
  if (recommendation === "Lean") return "gold";
  if (recommendation === "Pass") return "red";
  return "dark";
}

function avgValue(plays, key) {
  if (!plays.length) return 0;
  const values = plays.map((play) => Number(play?.[key])).filter(Number.isFinite);
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function MLBPlayCard({ play, label, featured = false }) {
  const { away, home } = splitGame(play.game);

  return (
    <TBMCard glow={featured} className="mlb-v3-play-card">
      <div className="mlb-v3-card-top">
        <div>
          {label && <TBMBadge tone={featured ? "green" : "blue"}>{label}</TBMBadge>}
          <h2>{play.pick || play.recommendation}</h2>
          <p>{play.game}</p>
        </div>

        <TBMSportsbookBadge book={getBook(play)} />
      </div>

      <div className="mlb-v3-matchup">
        <div>
          <TBMTeamLogo team={away} sport="MLB" size={54} />
          <span>{away}</span>
        </div>

        <strong>VS</strong>

        <div>
          <TBMTeamLogo team={home} sport="MLB" size={54} />
          <span>{home}</span>
        </div>
      </div>

      <div className="mlb-v3-metrics">
        <TBMMetric label="Market" value={play.market || "N/A"} />
        <TBMMetric label="Odds" value={formatOdds(play.odds)} accent />
        <TBMMetric label="Edge" value={`${play.edge ?? "N/A"}%`} accent />
        <TBMMetric label="Confidence" value={`${play.confidence ?? "N/A"}%`} />
        <TBMMetric label="Units" value={play.units ?? "N/A"} />
        <TBMMetric label="CLV" value={play.clv_status || "N/A"} />
      </div>

      <div className="mlb-v3-signals">
        <div>
          <span>Market</span>
          <strong>{play.sharp_signal || "N/A"}</strong>
          <small>{play.market_timing_signal || "Timing N/A"}</small>
        </div>

        <div>
          <span>Pitching</span>
          <strong>{play.starting_pitcher || play.away_starter || "N/A"}</strong>
          <small>Rating {play.pitcher_rating || play.combined_pitcher_rating || "N/A"}</small>
        </div>

        <div>
          <span>Offense</span>
          <strong>{play.lineup_status || "N/A"}</strong>
          <small>Power {play.statcast_power_rating || "N/A"}</small>
        </div>

        <div>
          <span>Risk</span>
          <strong>{play.weather_risk || "N/A"}</strong>
          <small>{play.ballpark || "Park N/A"}</small>
        </div>
      </div>

      <div className="mlb-v3-footer">
        <TBMBadge tone={getRecommendationTone(play.recommendation)}>
          {play.recommendation || "Model Play"}
        </TBMBadge>
        <p>{play.reason || play.sharp_reason || "No model reason available."}</p>
      </div>
    </TBMCard>
  );
}

export default function MLBTotalsPage() {
  const [plays, setPlays] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);

    setError("");

    fetch(`${API_URL}/model/mlb/today`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data.plays)) {
          setPlays(data.plays);
        } else {
          setError(data.error || "Failed to load MLB model.");
        }
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        console.error("MLB model fetch error:", err);
        setError("Failed to load MLB model.");
      })
      .finally(() => clearTimeout(timer));

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  const filteredPlays = useMemo(() => {
    return [...plays]
      .filter((play) => play.market === "Total")
      .sort((a, b) => (parseFloat(b.edge) || 0) - (parseFloat(a.edge) || 0));
  }, [plays]);

  const topPlay = filteredPlays[0];
  const avgEdge = avgValue(filteredPlays, "edge");
  const avgConfidence = avgValue(filteredPlays, "confidence");
  const playCount = filteredPlays.length;
  const sharpCount = filteredPlays.filter((play) =>
    String(play.sharp_signal || "").toLowerCase().includes("sharp")
  ).length;

  return (
    <TBMPage className="mlb-v3-page">
      <div className="mlb-v3-header">
        <div>
          <span>MLB Model</span>
          <h1>MLB Totals Dashboard</h1>
          <p>
            Pitching, bullpen, lineup quality, Statcast, weather, sharp action,
            CLV, sportsbook pricing, and market timing.
          </p>
        </div>
      </div>

      <MLBTabs />

      <TBMGrid columns={4} className="mlb-v3-kpis">
        <TBMMetric label="Totals Plays" value={playCount} />
        <TBMMetric label="Average Edge" value={`${avgEdge.toFixed(2)}%`} accent />
        <TBMMetric label="Average Confidence" value={`${avgConfidence.toFixed(0)}%`} />
        <TBMMetric label="Sharp Signals" value={sharpCount} accent />
      </TBMGrid>

      {error ? (
        <p className="mlb-v3-error">{error}</p>
      ) : filteredPlays.length === 0 ? (
        <TBMCard className="mlb-v3-empty">No MLB totals plays available.</TBMCard>
      ) : (
        <>
          {topPlay && (
            <section className="mlb-v3-section">
              <div className="mlb-v3-section-header">
                <span>Top Play</span>
                <h2>Best MLB Totals Edge</h2>
              </div>
              <MLBPlayCard play={topPlay} label="Top Totals Play" featured />
            </section>
          )}

          <section className="mlb-v3-section">
            <div className="mlb-v3-section-header">
              <span>Model Board</span>
              <h2>All MLB Totals Plays</h2>
            </div>

            <div className="mlb-v3-play-grid">
              {filteredPlays.map((play, index) => (
                <MLBPlayCard
                  key={`${play.game}-${play.pick || play.recommendation}-${index}`}
                  play={play}
                  label={index < 3 ? "Top Play" : null}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </TBMPage>
  );
}
