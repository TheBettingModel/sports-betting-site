import "./TBMDashboardGrid.css";

export function DashboardRow({ children }) {
  return <section className="tbm-dashboard-row">{children}</section>;
}

export function DashboardMain({ left, right }) {
  return (
    <section className="tbm-dashboard-main">
      <div className="tbm-dashboard-left">{left}</div>
      <aside className="tbm-dashboard-right">{right}</aside>
    </section>
  );
}

export function DashboardBottom({ left, right }) {
  return (
    <section className="tbm-dashboard-bottom">
      <div>{left}</div>
      <div>{right}</div>
    </section>
  );
}
