import "./TBMKpiRow.css";

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function avg(items, key) {
  if (!Array.isArray(items) || items.length === 0) return 0;
  const values = items.map((item) => num(item?.[key])).filter((v) => Number.isFinite(v));
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function getSport(play) {
  return play?.pod_sport || play?.sport || play?.league || "N/A";
}

function getScore(play) {
  return num(
    play?.universal_pod_score ??
      play?.pod_score ??
      play?.final_model_score ??
      play?.top_play_score
  );
}

function KpiCard({ label, value, sub, tone = "green" }) {
  return (
    <div className={`tbm-kpi-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </div>
  );
}

export default function TBMKpiRow({ flagship, topPlays = [] }) {
  const todayCount = Array.isArray(topPlays) ? topPlays.length : 0;
  const avgEdge = avg(topPlays, "edge");
  const avgConfidence = avg(topPlays, "confidence");
  const bestSport = getSport(flagship);
  const podScore = getScore(flagship);

  return (
    <section className="tbm-kpi-row">
      <KpiCard
        label="Today's Card"
        value={todayCount}
        sub="Top graded plays"
      />

      <KpiCard
        label="Average Edge"
        value={`${avgEdge.toFixed(2)}%`}
        sub="Across top plays"
      />

      <KpiCard
        label="Average Confidence"
        value={`${avgConfidence.toFixed(0)}%`}
        sub="Model confidence"
        tone="blue"
      />

      <KpiCard
        label="Top Sport"
        value={bestSport}
        sub="Best current edge"
        tone="gold"
      />

      <KpiCard
        label="POD Score"
        value={podScore ? podScore.toFixed(2) : "N/A"}
        sub="Flagship rating"
      />
    </section>
  );
}
