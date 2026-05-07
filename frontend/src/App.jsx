import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";

import HomePage from "./pages/HomePage";
import ResultsPage from "./pages/ResultsPage";
import SavedPicksPage from "./pages/SavedPicksPage";
import AddPickPage from "./pages/AddPickPage";
import PlayOfTheDayPage from "./pages/PlayOfTheDayPage";
import LiveOddsPage from "./pages/LiveOddsPage";
import ModelBoardPage from "./pages/ModelBoardPage";
import ModelPerformancePage from "./pages/ModelPerformancePage";
import MLBModelBoardPage from "./pages/MLBModelBoardPage";

function App() {
  return (
    <Router>
      <div>
        <nav
          style={{
            backgroundColor: "#111827",
            padding: "16px 40px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h1
            style={{
              color: "white",
              margin: 0,
              fontSize: "28px",
              fontWeight: "bold",
            }}
          >
            Sports Betting Analysis
          </h1>

          <div
            style={{
              display: "flex",
              gap: "24px",
              alignItems: "center",
            }}
          >
            <Link style={linkStyle} to="/">Home</Link>
            <Link style={linkStyle} to="/results">Results</Link>
            <Link style={linkStyle} to="/saved-picks">Saved Picks</Link>
            <Link style={linkStyle} to="/add-pick">Add Pick</Link>
            <Link style={linkStyle} to="/play-of-the-day">Play of the Day</Link>
            <Link style={linkStyle} to="/live-odds">Live Odds</Link>
            <Link style={linkStyle} to="/model-board">Model Board</Link>
            <Link style={linkStyle} to="/model-performance">Model Performance</Link>
            <Link style={linkStyle} to="/mlb-model">MLB Model</Link>
          </div>
        </nav>

        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/results" element={<ResultsPage />} />
          <Route path="/saved-picks" element={<SavedPicksPage />} />
          <Route path="/add-pick" element={<AddPickPage />} />
          <Route path="/play-of-the-day" element={<PlayOfTheDayPage />} />
          <Route path="/live-odds" element={<LiveOddsPage />} />
          <Route path="/model-board" element={<ModelBoardPage />} />
          <Route path="/model-performance" element={<ModelPerformancePage />} />
          <Route path="/mlb-model" element={<MLBModelBoardPage />} />
        </Routes>
      </div>
    </Router>
  );
}

const linkStyle = {
  color: "white",
  textDecoration: "none",
  fontWeight: "bold",
  fontSize: "16px",
};

export default App;
