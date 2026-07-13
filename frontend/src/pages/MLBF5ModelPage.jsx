import MLBMarketDashboard from "../components/mlb/MLBMarketDashboard";

export default function MLBF5ModelPage() {
  return (
    <MLBMarketDashboard
      endpoint="/model/mlb/f5/today"
      marketKey="all"
      marketLabel="First 5"
      title="MLB First 5 Dashboard"
      premiumTitle="Today's Premium First 5 Card"
      route="/mlb-f5"
      emptyMessage="No qualified MLB First 5 plays are currently available."
    />
  );
}
