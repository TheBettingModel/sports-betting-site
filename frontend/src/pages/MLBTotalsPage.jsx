import MLBMarketDashboard from "../components/mlb/MLBMarketDashboard";

export default function MLBTotalsPage() {
  return (
    <MLBMarketDashboard
      marketKey="totals"
      marketLabel="Totals"
      title="MLB Totals Dashboard"
      premiumTitle="Today's Premium Totals Card"
      route="/mlb-totals"
      emptyMessage="No qualified MLB Totals plays are currently available."
    />
  );
}
