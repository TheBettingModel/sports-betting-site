import { Routes, Route, Link } from "react-router-dom";

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
    <div>
      <nav style={navStyle}>
        <div style={titleStyle}>Sports Betting Analysis</div>

        <div style={linksStyle}>
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

      <main style={{ padding: "20px" }}>
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
      </main>
    </div>
  );
}

const navStyle = {
  backgroundColor: "#111827",
  padding: "16px 32px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: "16px",
};

const titleStyle = {
  color: "white",
  fontSize: "24px",
  fontWeight: "bold",
};

const linksStyle = {
  display: "flex",
  gap: "16px",
  flexWrap: "wrap",
};

const linkStyle = {
  color: "white",
  textDecoration: "none",
  fontWeight: "bold",
};

export default App;
