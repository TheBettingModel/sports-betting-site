import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";

import HomePage from "./pages/HomePage";
import ModelBoardPage from "./pages/ModelBoardPage";
import MLBModelBoardPage from "./pages/MLBModelBoardPage";
import MLBF5Page from "./pages/MLBF5Page";
import MLBNRFIPage from "./pages/MLBNRFIPage";
import SharpMarketPage from "./pages/SharpMarketPage";

function App() {
  return (
    <Router>
      <div
        style={{
          backgroundColor: "#0b0b0b",
          minHeight: "100vh",
          color: "white",
        }}
      >
        <nav style={navStyle}>
          <div style={logoStyle}>The Betting Model</div>

          <Link style={linkStyle} to="/">
            Home
          </Link>

          {/* NBA Dropdown */}
          <div
            style={dropdownStyle}
            onMouseEnter={(e) => {
              e.currentTarget.querySelector(".dropdown-menu").style.display =
                "block";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.querySelector(".dropdown-menu").style.display =
                "none";
            }}
          >
            <span style={linkStyle}>NBA ▾</span>

            <div className="dropdown-menu" style={dropdownMenuStyle}>
              <Link style={dropdownLinkStyle} to="/model-board">
                Full Game
              </Link>

              <Link style={dropdownLinkStyle} to="/model-board">
                1Q Bets
              </Link>

              <Link style={dropdownLinkStyle} to="/model-board">
                1H Bets
              </Link>

              <Link style={dropdownLinkStyle} to="/model-board">
                Totals
              </Link>
            </div>
          </div>

          {/* MLB Dropdown */}
          <div
            style={dropdownStyle}
            onMouseEnter={(e) => {
              e.currentTarget.querySelector(".dropdown-menu").style.display =
                "block";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.querySelector(".dropdown-menu").style.display =
                "none";
            }}
          >
            <span style={linkStyle}>MLB ▾</span>

            <div className="dropdown-menu" style={dropdownMenuStyle}>
              <Link style={dropdownLinkStyle} to="/mlb-model">
                Full Game
              </Link>

              <Link style={dropdownLinkStyle} to="/mlb-f5">
                F5 Model
              </Link>

              <Link style={dropdownLinkStyle} to="/mlb-nrfi">
                NRFI/YRFI
              </Link>

              <Link style={dropdownLinkStyle} to="/mlb-model">
                Team Totals
              </Link>
            </div>
          </div>

          {/* Sharp Market Dropdown */}
          <div
            style={dropdownStyle}
            onMouseEnter={(e) => {
              e.currentTarget.querySelector(".dropdown-menu").style.display =
                "block";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.querySelector(".dropdown-menu").style.display =
                "none";
            }}
          >
            <span style={linkStyle}>Sharp Market ▾</span>

            <div className="dropdown-menu" style={dropdownMenuStyle}>
              <Link style={dropdownLinkStyle} to="/sharp-market">
                Sharp Board
              </Link>

              <Link style={dropdownLinkStyle} to="/sharp-market">
                Steam Moves
              </Link>

              <Link style={dropdownLinkStyle} to="/sharp-market">
                CLV Tracker
              </Link>

              <Link style={dropdownLinkStyle} to="/sharp-market">
                Line Shopping
              </Link>
            </div>
          </div>
        </nav>

        <Routes>
          <Route path="/" element={<HomePage />} />

          <Route path="/model-board" element={<ModelBoardPage />} />

          <Route path="/mlb-model" element={<MLBModelBoardPage />} />

          <Route path="/mlb-f5" element={<MLBF5Page />} />

          <Route path="/mlb-nrfi" element={<MLBNRFIPage />} />

          <Route path="/sharp-market" element={<SharpMarketPage />} />
        </Routes>
      </div>
    </Router>
  );
}

const navStyle = {
  display: "flex",
  alignItems: "center",
  gap: "20px",
  padding: "18px 30px",
  borderBottom: "1px solid #1f2937",
  backgroundColor: "#111827",
  position: "sticky",
  top: 0,
  zIndex: 1000,
};

const logoStyle = {
  fontSize: "22px",
  fontWeight: "bold",
  marginRight: "20px",
};

const linkStyle = {
  color: "white",
  textDecoration: "none",
  cursor: "pointer",
  fontSize: "15px",
  fontWeight: "500",
};

const dropdownStyle = {
  position: "relative",
  display: "inline-block",
};

const dropdownMenuStyle = {
  display: "none",
  position: "absolute",
  top: "100%",
  left: 0,
  backgroundColor: "#111827",
  minWidth: "190px",
  border: "1px solid #374151",
  borderRadius: "10px",
  padding: "8px 0",
  zIndex: 1000,
  boxShadow: "0 8px 20px rgba(0,0,0,0.35)",
};

const dropdownLinkStyle = {
  display: "block",
  color: "white",
  textDecoration: "none",
  padding: "10px 14px",
  fontSize: "14px",
};

export default App;
