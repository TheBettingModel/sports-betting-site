import './_group.css';

type ForecastState = 'model-lean' | 'no-bet' | 'awaiting-data' | 'locked';

type Forecast = {
  away: string;
  home: string;
  time: string;
  state: ForecastState;
  rank?: number;
  projectedTeam?: string;
  edge?: string;
  market?: string;
  note?: string;
};

const forecasts: Forecast[] = [
  { away: 'BOS', home: 'NYY', time: '7:15 PM EDT', state: 'model-lean', rank: 1, projectedTeam: 'NYY', edge: '+7.4%', market: '-149' },
  { away: 'ARI', home: 'SF', time: '10:15 PM EDT', state: 'model-lean', rank: 2, projectedTeam: 'ARI', edge: '+6.1%', market: '-118' },
  { away: 'SD', home: 'TB', time: '7:10 PM EDT', state: 'model-lean', rank: 3, projectedTeam: 'TB', edge: '+3.3%', market: '-130' },
  { away: 'MIA', home: 'WSH', time: '6:45 PM EDT', state: 'model-lean', rank: 4, projectedTeam: 'MIA', edge: '+3.1%', market: '-150' },
  { away: 'CLE', home: 'DET', time: '1:10 PM EDT', state: 'no-bet', projectedTeam: 'DET', edge: '+0.4%', market: '+105' },
  { away: 'SEA', home: 'LAA', time: '9:38 PM EDT', state: 'awaiting-data', note: 'PROBABLE STARTERS PENDING' },
  { away: 'ATL', home: 'PHI', time: '7:20 PM EDT', state: 'locked', note: 'UNLOCK TO VIEW' },
];

function statusFor(forecast: Forecast) {
  if (forecast.state === 'model-lean') return `PICK · #${forecast.rank}`;
  if (forecast.state === 'no-bet') return 'NO BET';
  if (forecast.state === 'awaiting-data') return 'AWAITING DATA';
  return 'PRO FORECAST';
}

function ForecastRow({ forecast }: { forecast: Forecast }) {
  const waiting = forecast.state === 'awaiting-data';
  const locked = forecast.state === 'locked';
  return (
    <div className={`forecast-row${locked ? ' forecast-row--locked' : ''}`}>
      <div className="forecast-matchup">
        <div className="forecast-teams">{forecast.away} <span className="forecast-at">@</span> {forecast.home}</div>
        <div className="forecast-time">{forecast.time}</div>
      </div>
      <div className="forecast-details">
        <div className={`forecast-status${waiting ? ' forecast-status--waiting' : locked || forecast.state === 'no-bet' ? ' forecast-status--muted' : ''}`}>
          {statusFor(forecast)}
        </div>
        {waiting || locked ? (
          <div className="forecast-note">{forecast.note}</div>
        ) : (
          <>
            <div className="forecast-projection">{forecast.projectedTeam} · {forecast.state === 'model-lean' ? 'PICK' : 'NO BET'}</div>
            <div className="forecast-market">VALUE EDGE {forecast.edge} · MARKET {forecast.market}</div>
          </>
        )}
      </div>
    </div>
  );
}

export function Current() {
  return (
    <main className="forecast-preview">
      <section className="forecast-shell" aria-label="Current ranked MLB projections">
        <header className="forecast-section-header">
          <div>
            <h1 className="forecast-title">ALL MLB PROJECTIONS</h1>
            <p className="forecast-subtitle">11 upcoming games</p>
            <p className="forecast-order">RANKED BY VALUE EDGE · HIGHEST FIRST</p>
          </div>
          <div className="forecast-count">11</div>
        </header>
        {forecasts.map((forecast, index) => <ForecastRow key={`${forecast.away}-${index}`} forecast={forecast} />)}
      </section>
    </main>
  );
}