import { useEffect, useMemo, useState } from "react";
import "./PlayOfTheDayPage.css";

const API_URL = import.meta.env.VITE_API_URL;

const SPORT_META = {
  MLB: { label: "MLB", icon: "⚾" },
  NBA: { label: "NBA", icon: "🏀" },
  NFL: { label: "NFL", icon: "🏈" },
  NHL: { label: "NHL", icon: "🏒" },
  WNBA: { label: "WNBA", icon: "🏀" },
  NCAAF: { label: "NCAAF", icon: "🏈" },
  Soccer: { label: "Soccer", icon: "⚽" },
};

function cleanTeamName(name = "") {
  return String(name)
    .replace(/\s+/g, " ")
    .replace(/^\d+\s*/, "")
    .trim();
}

function slugTeam(name = "") {
  return cleanTeamName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function splitTeams(game = "") {
  const text = String(game || "");
  const parts = text.split(/\s+vs\.?\s+|\s+@\s+/i);
  return {
    away: cleanTeamName(parts[0] || "Team"),
    home: cleanTeamName(parts[1] || "Team"),
  };
}

function TeamLogo({ team }) {
  const [failed, setFailed] = useState(false);
  const slug = slugTeam(team);
  const initials = cleanTeamName(team)
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();

  if (!slug || failed) {
    return <div className="pod-team-fallback">{initials || "TBM"}</div>;
  }

  return (
    <img
      className="pod-team-logo"
      src={`/logos/teams/${slug}.png`}
      alt={`${team} logo`}
      onError={() => setFailed(true)}
    />
  );
}

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
              <span>Featured Play</span>
              <strong>{overall?.pick || "No Play"}</strong>
            </div>
            <div className="pod-kpi">
              <span>Sport Cards</span>
              <strong>{sportCards.length}</strong>
            </div>
            <div className="pod-kpi">
              <span>Status</span>
              <strong>{overall ? "Active" : "Waiting"}</strong>
            </div>
          </section>

          <section className="pod-feature-card">
            <div className="pod-feature-top">
              <span className="pod-sport-badge">
                {SPORT_META[overall?.sport]?.icon || "📊"} {overall?.sport || "Top Play"}
              </span>
            </div>

            <h2>{overall?.game || "No Play Of The Day Available"}</h2>
            <p>{overall?.pick || "Check back after the model refreshes."}</p>
          </section>

          <section className="pod-section-title">
            <h3>Best Play by Sport</h3>
          </section>

          <section className="pod-sport-grid">
            {sportCards.map(({ sport, play }) => {
              const teams = splitTeams(play?.game);
              const meta = SPORT_META[sport] || { label: sport, icon: "📊" };

              return (
                <button className="pod-sport-card" key={sport} type="button">
                  <div className="pod-sport-label">
                    <span>{meta.icon}</span>
                    <strong>{meta.label}</strong>
                  </div>

                  <div className="pod-matchup">
                    <TeamLogo team={teams.away} />
                    <span className="pod-vs">VS</span>
                    <TeamLogo team={teams.home} />
                  </div>

                  <div className="pod-pick">{play?.pick || "No Pick"}</div>
                </button>
              );
            })}
          </section>
        </>
      )}
    </main>
  );
}

export default PlayOfTheDayPage;
