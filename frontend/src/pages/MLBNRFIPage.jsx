import MLBMarketDashboard from "../components/mlb/MLBMarketDashboard";

export default function MLBNRFIPage() {
  return (
    <MLBMarketDashboard
      endpoint="/model/mlb/nrfi/today"
      marketKey="all"
      marketLabel="NRFI / YRFI"
      title="MLB NRFI / YRFI Dashboard"
      premiumTitle="Today's Premium First-Inning Card"
      route="/mlb-nrfi"
      emptyMessage="No qualified MLB NRFI or YRFI plays are currently available."
    />
  );
}
