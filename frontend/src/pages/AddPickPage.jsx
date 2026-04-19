import { useState } from "react";
import { useLocation } from "react-router-dom";

function AddPickPage() {
  const location = useLocation();
  const prefilled = location.state || {};

  const [game, setGame] = useState(prefilled.game || "");
  const [pick, setPick] = useState(prefilled.pick || "");
  const [market, setMarket] = useState(prefilled.market || "");
  const [sportsbook, setSportsbook] = useState(prefilled.sportsbook || "");
  const [units, setUnits] = useState("");
  const [modelProbability, setModelProbability] = useState("");
  const [americanOdds, setAmericanOdds] = useState(prefilled.odds || "");
  const [message, setMessage] = useState("");

  const calculateImpliedProbability = () => {
    const odds = parseFloat(americanOdds);

    if (isNaN(odds) || odds === 0) return "";

    let implied = 0;

    if (odds > 0) {
      implied = 100 / (odds + 100);
    } else {
      implied = Math.abs(odds) / (Math.abs(odds) + 100);
    }

    return (implied * 100).toFixed(1);
  };

  const getEdgeValue = () => {
    const model = parseFloat(modelProbability);
    const implied = parseFloat(calculateImpliedProbability());

    if (isNaN(model) || isNaN(implied)) return null;

    return model - implied;
  };

  const calculateEdge = () => {
    const edgeValue = getEdgeValue();
    if (edgeValue === null) return "";
    return `${edgeValue.toFixed(1)}%`;
  };

  const calculateConfidence = () => {
    const edgeValue = getEdgeValue();
    if (edgeValue === null) return "";

    if (edgeValue >= 7) return "A";
    if (edgeValue >= 5) return "B+";
    if (edgeValue >= 3) return "B";
    if (edgeValue >= 1) return "C";
    return "D";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/save-pick`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          game,
          pick,
          market,
          sportsbook,
          odds: americanOdds,
          confidence: calculateConfidence(),
          units,
          model_probability: `${modelProbability}%`,
          implied_probability: `${calculateImpliedProbability()}%`,
          edge: calculateEdge()
        })
      });

      const data = await response.json();
      setMessage(data.message || "Pick saved");

      if (response.ok) {
        setGame("");
        setPick("");
        setMarket("");
        setSportsbook("");
        setUnits("");
        setModelProbability("");
        setAmericanOdds("");
      }
    } catch (error) {
      setMessage("Error saving pick");
      console.error(error);
    }
  };

  return (
    <div className="app">
      <h1>Add Pick</h1>

      <form className="pick-form" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Game"
          value={game}
          onChange={(e) => setGame(e.target.value)}
          required
        />

        <input
          type="text"
          placeholder="Pick"
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          required
        />

        <input
          type="text"
          placeholder="Market"
          value={market}
          onChange={(e) => setMarket(e.target.value)}
          required
        />

        <input
          type="text"
          placeholder="Sportsbook"
          value={sportsbook}
          onChange={(e) => setSportsbook(e.target.value)}
          required
        />

        <input
          type="text"
          placeholder="Units"
          value={units}
          onChange={(e) => setUnits(e.target.value)}
          required
        />

        <input
          type="number"
          placeholder="Model Probability"
          value={modelProbability}
          onChange={(e) => setModelProbability(e.target.value)}
          required
        />

        <input
          type="number"
          placeholder="American Odds (example: -120 or 150)"
          value={americanOdds}
          onChange={(e) => setAmericanOdds(e.target.value)}
          required
        />

        <input
          type="text"
          value={calculateImpliedProbability() ? `${calculateImpliedProbability()}%` : ""}
          placeholder="Implied Probability"
          readOnly
        />

        <input
          type="text"
          value={calculateEdge()}
          placeholder="Edge"
          readOnly
        />

        <input
          type="text"
          value={calculateConfidence()}
          placeholder="Confidence"
          readOnly
        />

        <button type="submit">Save Pick</button>
      </form>

      {message && <p>{message}</p>}
    </div>
  );
}

export default AddPickPage;
