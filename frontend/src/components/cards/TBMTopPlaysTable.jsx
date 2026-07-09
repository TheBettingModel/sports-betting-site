import "./TBMTopPlaysTable.css";

function getSport(play) {
  return play?.pod_sport || play?.sport || "MODEL";
}

function getScore(play) {
  return play?.universal_pod_score ?? play?.final_model_score ?? "N/A";
}

export default function TBMTopPlaysTable({ plays = [] }) {
  if (!plays.length) {
    return <div className="tbm-top-table-empty">No qualified top plays available.</div>;
  }

  return (
    <div className="tbm-top-table-wrap">
      <table className="tbm-top-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Sport</th>
            <th>Game</th>
            <th>Pick</th>
            <th>Score</th>
          </tr>
        </thead>

        <tbody>
          {plays.map((play, index) => (
            <tr key={`${play?.game}-${play?.pick}-${index}`}>
              <td>#{index + 1}</td>
              <td>{getSport(play)}</td>
              <td>{play?.game || "N/A"}</td>
              <td>{play?.pick || "N/A"}</td>
              <td>
                <strong>{getScore(play)}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
