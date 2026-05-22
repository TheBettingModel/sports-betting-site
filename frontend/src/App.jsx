import { Routes, Route, Link } from "react-router-dom";

import HomePage from "./pages/HomePage";
import ModelBoardPage from "./pages/ModelBoardPage";
import MLBModelBoardPage from "./pages/MLBModelBoardPage";
import MLBF5ModelPage from "./pages/MLBF5ModelPage";

function App() {
  const navStyle = {
    backgroundColor: "#111827",
    padding: "18px 30px",
    display: "flex",
    alignItems: "center",
    gap: "20px",
    borderBottom: "1px solid #374151",
  };

  const linkStyle = {
    color: "white",
    textDecoration: "none",
    fontWeight: "bold",
    fontSize: "15px",
  };

  const logoStyle = {
    color: "#e10600",
    fontWeight: "bold",
    fontSize: "22px",
    marginRight: "20px",
  };

  return (
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

          <Link style={linkStyle} to="/model-board">
            NBA Model
          </Link>

          <Link style={linkStyle} to="/mlb-model">
            MLB Model
          </Link>

          <Link style={linkStyle} to="/mlb-f5">
            MLB F5 Model
          </Link>
        </nav>

        <Routes>
          <Route path="/" element={<HomePage />} />

          <Route
            path="/model-board"
            element={<ModelBoardPage />}
          />

          <Route
            path="/mlb-model"
            element={<MLBModelBoardPage />}
          />

          <Route
            path="/mlb-f5"
            element={<MLBF5ModelPage />}
          />
        </Routes>
      </div>
  );
}

export default App;
