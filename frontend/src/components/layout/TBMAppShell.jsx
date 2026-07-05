import { NavLink, useLocation } from "react-router-dom";
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

const mainLinks = [
  { label: "Dashboard", path: "/", icon: "D" },
  { label: "Play of the Day", path: "/auto-pod", icon: "POD" },
  { label: "Analytics", path: "/analytics", icon: "A" },
  { label: "Admin", path: "/admin", icon: "SET" },
];

const sportsLinks = [
  { label: "MLB", path: "/mlb-model", icon: "MLB" },
  { label: "NBA", path: "/model-board", icon: "NBA" },
  { label: "NFL", path: "/nfl-model", icon: "NFL" },
  { label: "NHL", path: "/nhl-model", icon: "NHL" },
  { label: "WNBA", path: "/wnba-model", icon: "WNBA" },
  { label: "Soccer", path: "/soccer-model", icon: "SOC" },
  { label: "NCAAF", path: "/ncaaf-model", icon: "CFB" },
  { label: "NCAAMB", path: "/model/ncaamb", icon: "CBB" },
  { label: "UFC", path: "/model/ufc", icon: "UFC" },
];

function SidebarLink({ item }) {
  return (
    <NavLink
      to={item.path}
      className={({ isActive }) =>
        isActive ? "tbm-shell-link active" : "tbm-shell-link"
      }
    >
      <span className="tbm-shell-link-icon">{item.icon}</span>
      <strong>{item.label}</strong>
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
            {mainLinks.map((item) => (
              <SidebarLink key={item.path} item={item} />
            ))}
          </div>

          <div className="tbm-app-nav-title">Sports Models</div>
          <div className="tbm-app-nav-group">
            {sportsLinks.map((item) => (
              <SidebarLink key={item.path} item={item} />
            ))}
          </div>
        </nav>

        <div className="tbm-app-pro">
          <span>PRO ACCESS</span>
          <strong>Full Model Dashboard</strong>
          <p>Unlock full card, market intelligence, performance tracking, and advanced model pages.</p>
        </div>
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
            <div className="tbm-app-profile">TBM</div>
          </div>
        </header>

        <div className="tbm-app-content">{children}</div>
      </main>
    </div>
  );
}
