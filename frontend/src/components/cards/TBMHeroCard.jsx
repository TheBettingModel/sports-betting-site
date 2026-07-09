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

function valueOrNA(value) {
  return value === null || value === undefined || value === "" ? "N/A" : value;
}

export default function TBMHeroCard({
  label = "Featured Play",
  play,
  scoreLabel = "POD",
  score,
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

  const metrics = [
    { label: scoreLabel, value: valueOrNA(score) },
    { label: "Market", value: valueOrNA(play?.market) },
    { label: "Units", value: valueOrNA(play?.units) },
    { label: "Book", value: valueOrNA(play?.best_sportsbook || play?.sportsbook) },
  ];

  return (
    <section className="tbm-hero-card">
      <div className="tbm-hero-label">{label}</div>

      <div className="tbm-hero-matchup">
        <TBMTeamLogo team={away} sport={sport} size={46} />
        <span>VS</span>
        <TBMTeamLogo team={home} sport={sport} size={46} />
      </div>

      <h2>{play?.pick || "N/A"}</h2>
      <p>{sport} — {play?.game || "N/A"}</p>

      <div className="tbm-hero-metrics">
        {metrics.map((item) => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
