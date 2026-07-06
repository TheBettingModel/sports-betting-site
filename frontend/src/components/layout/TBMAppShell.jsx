import { NavLink, useLocation } from "react-router-dom";
import TBMLeagueIcon from "../logos/TBMLeagueIcon";
import "./TBMAppShell.css";

const pageTitles = {
  "/": "Today’s Dashboard",
  "/auto-pod": "Play of the Day",
  "/analytics": "Analytics",
  "/admin": "Admin",
  "/mlb-model": "MLB Model",
  "/model-board": "NBA Model",
  "/nfl-model": "NFL Model",
  "/nhl-model": "NHL Model",
  "/wnba-model": "WNBA Model",
  "/soccer-model": "Soccer Model",
  "/ncaaf-model": "NCAAF Model",
  "/model/ncaamb": "NCAA Basketball Model",
  "/model/ufc": "UFC Model",
};

const platformLinks = [
  { label: "Dashboard", path: "/", icon: "dashboard" },
  { label: "Play of the Day", path: "/auto-pod", icon: "pod" },
  { label: "Analytics", path: "/analytics", icon: "analytics" },
  { label: "Admin", path: "/admin", icon: "admin" },
];

const sportLinks = [
  { label: "MLB", path: "/mlb-model", icon: "mlb" },
  { label: "NBA", path: "/model-board", icon: "nba" },
  { label: "NFL", path: "/nfl-model", icon: "nfl" },
  { label: "NHL", path: "/nhl-model", icon: "nhl" },
  { label: "WNBA", path: "/wnba-model", icon: "wnba" },
  { label: "Soccer", path: "/soccer-model", icon: "soccer" },
  { label: "NCAAF", path: "/ncaaf-model", icon: "ncaaf" },
  { label: "NCAAMB", path: "/model/ncaamb", icon: "ncaamb" },
  { label: "UFC", path: "/model/ufc", icon: "ufc" },
];

function SidebarLink({ item }) {
  return (
    <NavLink
      to={item.path}
      end={item.path === "/"}
      className={({ isActive }) =>
        isActive ? "tbm-shell-link active" : "tbm-shell-link"
      }
    >
      <TBMLeagueIcon type={item.icon} />
      <span className="tbm-shell-link-label">{item.label}</span>
    </NavLink>
  );
}

export default function TBMAppShell({ children }) {
  const location = useLocation();
  const title = pageTitles[location.pathname] || "The Betting Model";

  return (
    <div className="tbm-app-shell">
      <aside className="tbm-app-sidebar">
        <div className="tbm-app-brand">
          <div className="tbm-app-brand-mark">TBM</div>
          <div>
            <h2>The Betting Model</h2>
            <p>Premium Sports Analytics</p>
          </div>
        </div>

        <nav className="tbm-app-nav">
          <div className="tbm-app-nav-title">Platform</div>
          <div className="tbm-app-nav-group">
            {platformLinks.map((item) => (
              <SidebarLink key={item.path} item={item} />
            ))}
          </div>

          <div className="tbm-app-nav-title">Sports Models</div>
          <div className="tbm-app-nav-group">
            {sportLinks.map((item) => (
              <SidebarLink key={item.path} item={item} />
            ))}
          </div>
        </nav>
      </aside>

      <main className="tbm-app-main">
        <header className="tbm-app-topbar">
          <div>
            <h1>{title}</h1>
            <p>Live model board, market signals, and top-rated betting edges.</p>
          </div>

          <div className="tbm-app-top-actions">
            <span className="tbm-app-market-open">Market Open</span>
            <button type="button">Search</button>
            <button type="button">Alerts</button>
          </div>
        </header>

        <div className="tbm-app-content">{children}</div>
      </main>
    </div>
  );
}
