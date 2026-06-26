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
import NFLModelPage from "./pages/NFLModelPage";
import WNBAModelPage from "./pages/WNBAModelPage";
import NHLModelPage from "./pages/NHLModelPage";
import NCAAFModelPage from "./pages/NCAAFModelPage";

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
              onClick={() => toggleDropdown("sports")}
            >
              Sports ▾
            </button>

            {openDropdown === "sports" && (
              <div style={dropdownMenuStyle}>
                <Link
                  style={dropdownLinkStyle}
                  to="/model-board"
                  onClick={closeDropdown}
                >
                  🏀 NBA
                </Link>

                <Link
                  style={dropdownLinkStyle}
                  to="/mlb-model"
                  onClick={closeDropdown}
                >
                  ⚾ MLB
                </Link>

                <div style={dropdownDividerStyle} />

                <Link
                  style={dropdownLinkStyle}
                  to="/nfl-model"
                  onClick={closeDropdown}
                >
                  🏈 NFL
                </Link>

                <Link
                  style={dropdownLinkStyle}
                  to="/wnba-model"
                  onClick={closeDropdown}
                >
                  🏀 WNBA
                </Link>
                <Link
                  style={dropdownLinkStyle}
                  to="/nhl-model"
                  onClick={closeDropdown}
                >
                  🏒 NHL
                </Link>

                <Link
                  style={dropdownLinkStyle}
                  to="/ncaaf-model"
                  onClick={closeDropdown}
                >
                  🏈 NCAAF
                </Link>
              </div>
            )}
          </div>
        </div>

        <div style={rightNavStyle}>
          <Link
            style={linkStyle}
            to="/model-performance"
            onClick={closeDropdown}
          >
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

        <Route path="/nfl-model" element={<NFLModelPage />} />
        <Route
          path="/nfl-moneyline"
          element={<NFLModelPage marketFilter="Moneyline" title="NFL Moneyline Model" />}
        />
        <Route
          path="/nfl-spread"
          element={<NFLModelPage marketFilter="Spread" title="NFL Spread Model" />}
        />
        <Route
          path="/nfl-totals"
          element={<NFLModelPage marketFilter="Total" title="NFL Totals Model" />}
        />

        <Route path="/wnba-model" element={<WNBAModelPage />} />
        <Route
          path="/wnba-moneyline"
          element={<WNBAModelPage marketFilter="Moneyline" title="WNBA Moneyline Model" />}
        />
        <Route
          path="/wnba-spread"
          element={<WNBAModelPage marketFilter="Spread" title="WNBA Spread Model" />}
        />
        <Route
          path="/wnba-totals"
          element={<WNBAModelPage marketFilter="Total" title="WNBA Totals Model" />}
        />

        <Route path="/nhl-model" element={<NHLModelPage />} />

        <Route
          path="/nhl-puckline"
          element={<NHLModelPage marketFilter="Puck Line" title="NHL Puck Line Model" />}
        />

        <Route
          path="/nhl-totals"
          element={<NHLModelPage marketFilter="Total" title="NHL Total Model" />}
        />

        <Route path="/ncaaf-model" element={<NCAAFModelPage />} />

        <Route
          path="/ncaaf-spread"
          element={<NCAAFModelPage marketFilter="Spread" title="NCAA Football Spread Model" />}
        />

        <Route
          path="/ncaaf-totals"
          element={<NCAAFModelPage marketFilter="Total" title="NCAA Football Total Model" />}
        />

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

const comingSoonStyle = {
  color: "#6b7280",
  padding: "10px 14px",
  fontSize: "14px",
};

export default App;