import MLBMarketDashboard from "../components/mlb/MLBMarketDashboard";

export default function MLBRunLinePage() {
  return (
    <MLBMarketDashboard
      marketKey="runline"
      marketLabel="Run Line"
      title="MLB Run Line Dashboard"
      premiumTitle="Today's Premium Run Line Card"
      route="/mlb-runline"
      emptyMessage="No qualified MLB Run Line plays are currently available."
    />
  );
}
