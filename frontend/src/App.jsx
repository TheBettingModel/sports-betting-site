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

  const toggleDropdown = (name) => {
    setOpenDropdown(openDropdown === name ? null : name);
  };

  const closeDropdown = () => {
    setOpenDropdown(null);
  };

  return (
    <div style={appStyle}>
      <nav style={navStyle}>
        <Link style={logoStyle} to="/" onClick={closeDropdown}>
          The Betting Model
        </Link>

        <div style={leftNavStyle}>
          <Link style={linkStyle} to="/" onClick={closeDropdown}>
            Home
          </Link>

          <Link style={linkStyle} to="/auto-pod" onClick={closeDropdown}>
            Play of the Day
          </Link>

          <div style={dropdownStyle}>
            <button
              style={dropdownButtonStyle}
              onClick={() => toggleDropdown("models")}
            >
              Models ▾
            </button>

            {openDropdown === "models" && (
              <div style={dropdownMenuStyle}>
                <div style={dropdownHeaderStyle}>NBA</div>
                <Link style={dropdownLinkStyle} to="/model-board" onClick={closeDropdown}>
                  NBA Full Game
                </Link>
                <Link style={dropdownLinkStyle} to="/nba-totals" onClick={closeDropdown}>
                  NBA Totals
                </Link>
                <Link style={dropdownLinkStyle} to="/nba-1q" onClick={closeDropdown}>
                  NBA 1Q
                </Link>

                <div style={dropdownDividerStyle} />

                <div style={dropdownHeaderStyle}>MLB</div>
                <Link style={dropdownLinkStyle} to="/mlb-model" onClick={closeDropdown}>
                  MLB Full Game
                </Link>
                <Link style={dropdownLinkStyle} to="/mlb-runline" onClick={closeDropdown}>
                  MLB Run Line
                </Link>
                <Link style={dropdownLinkStyle} to="/mlb-f5" onClick={closeDropdown}>
                  MLB F5
                </Link>
                <Link style={dropdownLinkStyle} to="/mlb-nrfi" onClick={closeDropdown}>
                  MLB NRFI/YRFI
                </Link>
                <Link style={dropdownLinkStyle} to="/mlb-totals" onClick={closeDropdown}>
                  MLB Totals
                </Link>
              </div>
            )}
          </div>
        </div>

        <div style={rightNavStyle}>
          <Link style={linkStyle} to="/model-performance" onClick={closeDropdown}>
            Analytics
          </Link>

          <Link style={adminLinkStyle} to="/admin" onClick={closeDropdown}>
            Admin
          </Link>
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

const appStyle = {
  backgroundColor: "#0b0b0b",
  minHeight: "100vh",
  color: "white",
};

const navStyle = {
  display: "flex",
  alignItems: "center",
  gap: "24px",
  padding: "18px 30px",
  borderBottom: "1px solid #1f2937",
  backgroundColor: "#111827",
  position: "sticky",
  top: 0,
  zIndex: 1000,
};

const logoStyle = {
  fontSize: "22px",
  fontWeight: "800",
  marginRight: "12px",
  color: "white",
  textDecoration: "none",
};

const leftNavStyle = {
  display: "flex",
  alignItems: "center",
  gap: "18px",
};

const rightNavStyle = {
  marginLeft: "auto",
  display: "flex",
  alignItems: "center",
  gap: "18px",
};

const linkStyle = {
  color: "white",
  textDecoration: "none",
  cursor: "pointer",
  fontSize: "15px",
  fontWeight: "600",
};

const adminLinkStyle = {
  color: "#f87171",
  textDecoration: "none",
  cursor: "pointer",
  fontSize: "15px",
  fontWeight: "700",
};

const dropdownStyle = {
  position: "relative",
};

const dropdownButtonStyle = {
  background: "transparent",
  border: "none",
  color: "white",
  cursor: "pointer",
  fontSize: "15px",
  fontWeight: "600",
  padding: 0,
};

const dropdownMenuStyle = {
  position: "absolute",
  top: "32px",
  left: 0,
  backgroundColor: "#111827",
  minWidth: "220px",
  border: "1px solid #374151",
  borderRadius: "14px",
  padding: "10px 0",
  zIndex: 1000,
  boxShadow: "0 12px 28px rgba(0,0,0,0.45)",
};

const dropdownHeaderStyle = {
  color: "#9ca3af",
  fontSize: "12px",
  fontWeight: "800",
  padding: "8px 14px 6px",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const dropdownDividerStyle = {
  height: "1px",
  backgroundColor: "#374151",
  margin: "8px 0",
};

const dropdownLinkStyle = {
  display: "block",
  color: "white",
  textDecoration: "none",
  padding: "10px 14px",
  fontSize: "14px",
};

export default App;