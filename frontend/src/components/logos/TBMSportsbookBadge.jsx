import "./TBMSportsbookBadge.css";

const bookMap = {
  fanduel: "FanDuel",
  draftkings: "DraftKings",
  betmgm: "BetMGM",
  caesars: "Caesars",
  betrivers: "BetRivers",
  fanatics: "Fanatics",
  bovada: "Bovada",
  "espn bet": "ESPN BET",
  pointsbet: "PointsBet",
};

function normalizeBook(book = "") {
  return String(book).trim().toLowerCase();
}

export default function TBMSportsbookBadge({ book }) {
  const key = normalizeBook(book);
  const label = bookMap[key] || book || "Best Available";

  return (
    <span className={`tbm-sportsbook-badge ${key.replaceAll(" ", "-")}`}>
      {label}
    </span>
  );
}
