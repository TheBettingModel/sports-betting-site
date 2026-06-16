import { useState } from "react";
import { Routes, Route, Link } from "react-router-dom";

import HomePage from "./pages/HomePage";
import ModelBoardPage from "./pages/ModelBoardPage";
import NBATotalsPage from "./pages/NBATotalsPage";
import NBAFirstQuarterPage from "./pages/NBAFirstQuarterPage";

import MLBModelBoardPage from "./pages/MLBModelBoardPage";
import MLBRunLinePage from "./pages/MLBRunLinePage";
import MLBF5Page from "./pages/MLBF5ModelPage";
import MLBNRFIPage from "./pages/MLBNRFIPage";
import MLBTotalsPage from "./pages/MLBTotalsPage";

import ModelPerformancePage from "./pages/ModelPerformancePage";
import AutoPODPage from "./pages/AutoPODPage";
import AdminPage from "./pages/AdminPage";

function App() {
  const [openDropdown, setOpenDropdown] = useState(null);

  return (
    <div style={{ backgroundColor: "#0b0b0b", minHeight: "100vh", color: "white" }}>
      <nav style={navStyle}>
        <div style={logoStyle}>The Betting Model</div>

        <Link style={linkStyle} to="/">Home</Link>
        <Link style={linkStyle} to="/auto-pod">Auto POD</Link>

        <div style={dropdownStyle}>
          <span
            style={linkStyle}
            onClick={() =>
              setOpenDropdown(openDropdown === "nba" ? null : "nba")
            }
          >
            NBA ▾
          </span>

          {openDropdown === "nba" && (
            <div style={dropdownMenuStyle}>
              <Link style={dropdownLinkStyle} to="/model-board">Full Game</Link>
              <Link style={dropdownLinkStyle} to="/nba-totals">Totals</Link>
              <Link style={dropdownLinkStyle} to="/nba-1q">1st Quarter</Link>
            </div>
          )}
        </div>

        <div style={dropdownStyle}>
          <span
            style={linkStyle}
            onClick={() =>
              setOpenDropdown(openDropdown === "mlb" ? null : "mlb")
            }
          >
            MLB ▾
          </span>

          {openDropdown === "mlb" && (
            <div style={dropdownMenuStyle}>
              <Link style={dropdownLinkStyle} to="/mlb-model">Moneyline</Link>
              <Link style={dropdownLinkStyle} to="/mlb-runline">Run Line</Link>
              <Link style={dropdownLinkStyle} to="/mlb-f5">F5 Model</Link>
              <Link style={dropdownLinkStyle} to="/mlb-nrfi">NRFI/YRFI</Link>
              <Link style={dropdownLinkStyle} to="/mlb-totals">Totals</Link>
            </div>
          )}
        </div>

        <div style={rightNavStyle}>
          <Link style={linkStyle} to="/model-performance">Model Analytics</Link>
          <Link style={adminLinkStyle} to="/admin">Admin</Link>
        </div>
      </nav>

      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/auto-pod" element={<AutoPODPage />} />
        <Route path="/model-performance" element={<ModelPerformancePage />} />

        <Route path="/model-board" element={<ModelBoardPage />} />
        <Route path="/nba-totals" element={<NBATotalsPage />} />
        <Route path="/nba-1q" element={<NBAFirstQuarterPage />} />

        <Route path="/mlb-model" element={<MLBModelBoardPage />} />
        <Route path="/mlb-runline" element={<MLBRunLinePage />} />
        <Route path="/mlb-f5" element={<MLBF5Page />} />
        <Route path="/mlb-nrfi" element={<MLBNRFIPage />} />
        <Route path="/mlb-totals" element={<MLBTotalsPage />} />

        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </div>
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

const adminLinkStyle = {
  color: "#f87171",
  textDecoration: "none",
  cursor: "pointer",
  fontSize: "15px",
  fontWeight: "700",
};

const rightNavStyle = {
  marginLeft: "auto",
  display: "flex",
  alignItems: "center",
  gap: "20px",
};

const dropdownStyle = {
  position: "relative",
  display: "inline-block",
};

constropdownMenuStyle = {
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
