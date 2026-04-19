import { Routes, Route, Link } from "react-router-dom";
import HomePage from "./pages/HomePage";
import ResultsPage from "./pages/ResultsPage";
import SavedPicksPage from "./pages/SavedPicksPage";
import AddPickPage from "./pages/AddPickPage";
import PlayOfTheDayPage from "./pages/PlayOfTheDayPage";
import LiveOddsPage from "./pages/LiveOddsPage";
import "./App.css";

function App() {
  return (
    <div>
      <nav className="navbar">
        <h1>Sports Betting Analysis</h1>
        <div className="nav-links">
          <Link to="/">Home</Link>
          <Link to="/results">Results</Link>
          <Link to="/saved-picks">Saved Picks</Link>
          <Link to="/add-pick">Add Pick</Link>
          <Link to="/play-of-the-day">Play of the Day</Link>
          <Link to="/live-odds">Live Odds</Link>
        </div>
      </nav>

      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/results" element={<ResultsPage />} />
        <Route path="/saved-picks" element={<SavedPicksPage />} />
        <Route path="/add-pick" element={<AddPickPage />} />
        <Route path="/play-of-the-day" element={<PlayOfTheDayPage />} />
        <Route path="/live-odds" element={<LiveOddsPage />} />
      </Routes>
    </div>
  );
}

export default App;
