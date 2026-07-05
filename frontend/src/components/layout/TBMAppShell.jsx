import { NavLink } from "react-router-dom";
import "./TBMAppShell.css";

const sportsLinks = [
  { label: "MLB", path: "/mlb-model", icon: "⚾" },
  { label: "NBA", path: "/model-board", icon: "🏀" },
  { label: "NFL", path: "/nfl-model", icon: "🏈" },
  { label: "NHL", path: "/nhl-model", icon: "🏒" },
  { label: "WNBA", path: "/wnba-model", icon: "🏀" },
  { label: "Soccer", path: "/soccer-model", icon: "⚽" },
  { label: "NCAAF", path: "/ncaaf-model", icon: "🏈" },
  { label: "NCAAMB", path: "/model/ncaamb", icon: "🏀" },
  { label: "UFC", path: "/model/ufc", icon: "🥊" },
];

const mainLinks = [
  { label: "Dashboard", path: "/", icon: "▣" },
  { label: "Play of the Day", path: "/auto-pod", icon: "★" },
  { label: "Analytics", path: "/analytics", icon: "↗" },
  { label: "Admin", path: "/admin", icon: "⚙" },
];

function SidebarLink({ item }) {
  return (
    <NavLink
      to={item.path}
      className={({ isActive }) =>
        isActive ? "tbm-shell-link active" : "tbm-shell-link"
      }
    >
      <span>{item.icon}</span>
      <strong>{item.label}</strong>
    </NavLink>
  );
}

export default function TBMAppShell({ children }) {
  return (
    <div className="tbm-app-shell">
      <aside className="tbm-app-sidebar">
        <div className="tbm-app-brand">
          <div className="tbm-app-brand-mark">TBM</div>
          <div>
            <h2>The Betting Model</h2>
            <p>Bet Smarter. Win More.</p>
          </div>
        </div>

        <nav className="tbm-app-nav">
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
          <span>PRO</span>
          <strong>Premium Dashboard</strong>
          <p>Full card, market intelligence, model pages, and performance tools.</p>
        </div>
      </aside>

      <main className="tbm-app-main">
        <header className="tbm-app-topbar">
          <div>
            <h1>Today's Dashboard</h1>
            <p>Live model board, market signals, and top-rated betting edges.</p>
          </div>

          <div className="tbm-app-top-actions">
            <span className="tbm-app-market-open">Market Open</span>
            <button>Search</button>
            <button>Alerts</button>
          </div>
        </header>

        <div className="tbm-app-content">{children}</div>
      </main>
    </div>
  );
}
