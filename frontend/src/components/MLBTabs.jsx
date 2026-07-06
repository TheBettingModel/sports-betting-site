import { Link, useLocation } from "react-router-dom";
import "./MLBTabs.css";

function MLBTabs() {
  const location = useLocation();

  const tabs = [
    { label: "Overview", path: "/mlb-overview" },
    { label: "Moneyline", path: "/mlb-model" },
    { label: "Run Line", path: "/mlb-runline" },
    { label: "Totals", path: "/mlb-totals" },
    { label: "First 5", path: "/mlb-f5" },
    { label: "NRFI/YRFI", path: "/mlb-nrfi" },
  ];

  return (
    <div className="mlb-tabs-v4">
      {tabs.map((tab) => (
        <Link
          key={tab.path}
          to={tab.path}
          className={location.pathname === tab.path ? "active" : ""}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

export default MLBTabs;
