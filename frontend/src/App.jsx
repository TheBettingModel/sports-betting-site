import ModelPerformancePage from "./pages/ModelPerformancePage";
import { Routes, Route, Link } from "react-router-dom";
import HomePage from "./pages/HomePage";
import ResultsPage from "./pages/ResultsPage";
import SavedPicksPage from "./pages/SavedPicksPage";
import AddPickPage from "./pages/AddPickPage";
import PlayOfTheDayPage from "./pages/PlayOfTheDayPage";
import LiveOddsPage from "./pages/LiveOddsPage";
import ModelBoardPage from "./pages/ModelBoardPage";
import "./App.css";

import MLBModelBoardPage from "./pages/MLBModelBoardPage";
<Route path="/mlb-model" element={<MLBModelBoardPage />} />



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
          <Link to="/model-board">Model Board</Link>
          <Link to="/model-performance">Model Performance</Link>
        </div>
      </nav>
      
<Link to="/mlb-model">MLB Model</Link>
<nav>
  <Link to="/">Home</Link>
  <Link to="/saved-picks">Saved Picks</Link>
  <Link to="/results">Results</Link>
  <Link to="/live-odds">Live Odds</Link>
  <Link to="/model-board">Model Board</Link>
  <Link to="/mlb-model">MLB Model</Link>
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
      </Routes>
    </div>
  );
}

export default App;
