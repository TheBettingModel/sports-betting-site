import { Link, useLocation } from "react-router-dom";

function NCAAFTabs() {
  const location = useLocation();

  const tabs = [
    { label: "Moneyline", path: "/ncaaf-model" },
    { label: "Spread", path: "/ncaaf-spread" },
    { label: "Total", path: "/ncaaf-totals" },
  ];

  return (
    <div style={tabContainerStyle}>
      {tabs.map((tab) => {
        const active = location.pathname === tab.path;

        return (
          <Link
            key={tab.path}
            to={tab.path}
            style={active ? activeTabStyle : tabStyle}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

const tabContainerStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "12px",
  marginBottom: "28px",
};

const tabStyle = {
  backgroundColor: "#1f2937",
  color: "white",
  textDecoration: "none",
  padding: "10px 16px",
  borderRadius: "999px",
  border: "1px solid #374151",
  fontWeight: "bold",
};

const activeTabStyle = {
  ...tabStyle,
  backgroundColor: "#22c55e",
  color: "black",
};

export default NCAAFTabs;
