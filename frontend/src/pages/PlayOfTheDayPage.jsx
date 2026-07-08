import { useEffect, useMemo, useState } from "react";
import TBMSportCard from "../components/home/TBMSportCard";
import "./PlayOfTheDayPage.css";

const API_URL = import.meta.env.VITE_API_URL;

const SPORT_ROUTES = {
  MLB: "/mlb",
  NBA: "/nba",
  NFL: "/nfl",
  NHL: "/nhl",
  WNBA: "/wnba",
  NCAAF: "/ncaaf",
  Soccer: "/soccer",
};

function normalizeSportPlays(data) {
  const bySport = data?.by_sport || {};

  return Object.entries(bySport)
    .map(([sport, play]) => ({ sport, play }))
    .filter((item) => item.play);
}

function PlayOfTheDayPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/model/play-of-the-day`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load Play Of The Day");
        return res.json();
      })
      .then((json) => {
        setData(json);
        setError("");
      })
      .catch((err) => setError(err.message || "Unable to load data"))
      .finally(() => setLoading(false));
  }, []);

  const overall = data?.overall_play || null;
  const sportCards = useMemo(() => normalizeSportPlays(data), [data]);

  return (
    <main className="pod-page">
      <section className="pod-header">
        <div>
          <p className="pod-eyebrow">The Betting Model</p>
          <h1>Play Of The Day</h1>
        </div>
        <div className="pod-status-pill">Live Model</div>
      </section>

      {loading && <div className="pod-state-card">Loading model card...</div>}
      {error && <div className="pod-state-card pod-error">{error}</div>}

      {!loading && !error && (
        <>
          <section className="pod-kpi-row">
            <div className="pod-kpi">
              <span>Featured</span>
              <strong>{overall?.pick || "No Play"}</strong>
            </div>
            <div className="pod-kpi">
              <span>Sports</span>
              <strong>{sportCards.length}</strong>
            </div>
            <div className="pod-kpi">
              <span>Status</span>
              <strong>{overall ? "Active" : "Waiting"}</strong>
            </div>
          </section>

          <section className="pod-feature-card">
            <div className="pod-feature-label">{overall?.sport || "Top Play"}</div>
            <h2>{overall?.game || "No Play Of The Day Available"}</h2>
            <p>{overall?.pick || "Check back after model refresh."}</p>
          </section>

          <section className="pod-section-title">
            <h3>Best Play by Sport</h3>
          </section>

          <section className="pod-sport-grid">
            {sportCards.map(({ sport, play }) => (
              <TBMSportCard
                key={sport}
                name={sport}
                play={play}
                href={SPORT_ROUTES[sport] || "#"}
              />
            ))}
          </section>
        </>
      )}
    </main>
  );
}

export default PlayOfTheDayPage;
