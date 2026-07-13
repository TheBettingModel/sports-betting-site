import MLBMarketDashboard from "../components/mlb/MLBMarketDashboard";

export default function MLBModelBoardPage() {
  return (
    <MLBMarketDashboard
      endpoint="/model/mlb/today"
      marketKey="moneyline"
      marketLabel="Moneyline"
      title="MLB Moneyline Dashboard"
      premiumTitle="Today's Premium Moneyline Card"
      route="/mlb-model"
      emptyMessage="No qualified MLB Moneyline plays are currently available."
    />
  );
}
