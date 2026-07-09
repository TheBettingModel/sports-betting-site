import TBMTeamLogo from "../logos/TBMTeamLogo";
import "./TBMHeroCard.css";

function splitGame(game = "") {
  const clean = String(game || "").trim();

  if (clean.includes(" vs ")) {
    const [away, home] = clean.split(" vs ");
    return { away, home };
  }

  if (clean.includes(" at ")) {
    const [away, home] = clean.split(" at ");
    return { away, home };
  }

  if (clean.includes(" @ ")) {
    const [away, home] = clean.split(" @ ");
    return { away, home };
  }

  return { away: "Away", home: "Home" };
}

export default function TBMHeroCard({
  label = "Featured Play",
  play,
  scoreLabel = "Score",
  score,
  actionLabel = "View Analysis",
  href = "#",
}) {
  if (!play) {
    return (
      <section className="tbm-hero-card">
        <div className="tbm-hero-label">{label}</div>
        <h2>No Qualified Play</h2>
        <p>No play met the model threshold today.</p>
      </section>
    );
  }

  const sport = play?.pod_sport || play?.sport || "MODEL";
  const { away, home } = splitGame(play?.game || "");

  return (
    <section className="tbm-hero-card">
      <div className="tbm-hero-label">{label}</div>

      <div className="tbm-hero-layout">
        <div className="tbm-hero-main">
          <div className="tbm-hero-matchup">
            <TBMTeamLogo team={away} sport={sport} size={58} />
            <span>VS</span>
            <TBMTeamLogo team={home} sport={sport} size={58} />
          </div>

          <h2>{play?.pick || "N/A"}</h2>
          <p>{sport} — {play?.game || "N/A"}</p>

          <a className="tbm-hero-action" href={href}>
            {actionLabel}
          </a>
        </div>

        <div className="tbm-hero-score">
          <span>{scoreLabel}</span>
          <strong>{score ?? "N/A"}</strong>
        </div>
      </div>
    </section>
  );
}
