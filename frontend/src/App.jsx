import { Routes, Route, Link } from "react-router-dom";

import HomePage from "./pages/HomePage";
import LiveOddsPage from "./pages/LiveOddsPage";
import ModelBoardPage from "./pages/ModelBoardPage";
import MLBModelBoardPage from "./pages/MLBModelBoardPage";
import MLBF5ModelPage from "./pages/MLBF5ModelPage";

function App() {
  const linkStyle = {
    color: "white",
    textDecoration: "none",
    fontWeight: "bold",
    fontSize: "16px",
  };

  return (
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: "#0b0b0b",
          color: "white",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <nav
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "20px",
            borderBottom: "1px solid #222",
            backgroundColor: "#111",
          }}
        >
          <h2
            style={{
              margin: 0,
              color: "#e10600",
            }}
          >
            The Betting Model
          </h2>

          <div
            style={{
              display: "flex",
              gap: "20px",
            }}
          >
            <Link style={linkStyle} to="/">
              Home
            </Link>



            <Link style={linkStyle} to="/model-board">
              NBA Model
            </Link>

            <Link style={linkStyle} to="/mlb-model">
              MLB Model
            </Link>
          </div>
        </nav>

        <Link style={linkStyle} to="/mlb-f5">
          MLB F5
        </Link>


        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/live-odds" element={<LiveOddsPage />} />
          <Route path="/model-board" element={<ModelBoardPage />} />
          <Route path="/mlb-model" element={<MLBModelBoardPage />} />
          <Route path="/mlb-f5" element={<MLBF5ModelPage />} />
        </Routes>
      </div>
  );
}

export default App;