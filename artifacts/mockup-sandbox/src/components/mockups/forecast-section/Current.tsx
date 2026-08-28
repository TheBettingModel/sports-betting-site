import './_group.css';
import { useState } from 'react';

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
  awayLogo: string;
  homeLogo: string;
};

const forecasts: Forecast[] = [
  { away: 'BOS', home: 'NYY', awayLogo: 'https://a.espncdn.com/i/teamlogos/mlb/500/bos.png', homeLogo: 'https://a.espncdn.com/i/teamlogos/mlb/500/nyy.png', time: '7:15 PM EDT', state: 'model-lean', rank: 1, projectedTeam: 'NYY', edge: '+7.4%', market: '-149' },
  { away: 'ARI', home: 'SF', awayLogo: 'https://a.espncdn.com/i/teamlogos/mlb/500/ari.png', homeLogo: 'https://a.espncdn.com/i/teamlogos/mlb/500/sf.png', time: '10:15 PM EDT', state: 'model-lean', rank: 2, projectedTeam: 'ARI', edge: '+6.1%', market: '-118' },
  { away: 'SD', home: 'TB', awayLogo: 'https://a.espncdn.com/i/teamlogos/mlb/500/sd.png', homeLogo: 'https://a.espncdn.com/i/teamlogos/mlb/500/tb.png', time: '7:10 PM EDT', state: 'model-lean', rank: 3, projectedTeam: 'TB', edge: '+3.3%', market: '-130' },
  { away: 'MIA', home: 'WSH', awayLogo: 'https://a.espncdn.com/i/teamlogos/mlb/500/mia.png', homeLogo: 'https://a.espncdn.com/i/teamlogos/mlb/500/wsh.png', time: '6:45 PM EDT', state: 'model-lean', rank: 4, projectedTeam: 'MIA', edge: '+3.1%', market: '-150' },
  { away: 'CLE', home: 'DET', awayLogo: 'https://a.espncdn.com/i/teamlogos/mlb/500/cle.png', homeLogo: 'https://a.espncdn.com/i/teamlogos/mlb/500/det.png', time: '1:10 PM EDT', state: 'no-bet', projectedTeam: 'DET', edge: '+0.4%', market: '+105' },
  { away: 'SEA', home: 'LAA', awayLogo: 'https://a.espncdn.com/i/teamlogos/mlb/500/sea.png', homeLogo: 'https://a.espncdn.com/i/teamlogos/mlb/500/laa.png', time: '9:38 PM EDT', state: 'awaiting-data', note: 'PROBABLE STARTERS PENDING' },
  { away: 'ATL', home: 'PHI', awayLogo: 'https://a.espncdn.com/i/teamlogos/mlb/500/atl.png', homeLogo: 'https://a.espncdn.com/i/teamlogos/mlb/500/phi.png', time: '7:20 PM EDT', state: 'locked', note: 'UNLOCK TO VIEW' },
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
  const [awayFailed, setAwayFailed] = useState(false);
  const [homeFailed, setHomeFailed] = useState(false);
  return (
    <div className={`forecast-row${locked ? ' forecast-row--locked' : ''}`}>
      <div className="forecast-matchup">
        <div className="forecast-teams">
          <span className="forecast-team"><span className="forecast-logo">{awayFailed ? forecast.away : <img src={forecast.awayLogo} alt="" onError={() => setAwayFailed(true)} />}</span>{forecast.away}</span>
          <span className="forecast-at">@</span>
          <span className="forecast-team">{forecast.home}<span className="forecast-logo">{homeFailed ? forecast.home : <img src={forecast.homeLogo} alt="" onError={() => setHomeFailed(true)} />}</span></span>
        </div>
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