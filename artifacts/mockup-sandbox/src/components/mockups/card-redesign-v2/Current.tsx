import './_group.css';
import { useState } from 'react';

type Game = {
  sport: string; gameTime: string; homeTeam: { name: string; abbr: string; record: string; logoUrl?: string };
  awayTeam: { name: string; abbr: string; record: string; logoUrl?: string };
  projection: { homeWinPct: number; valueRating: string; modelScore: number; edge: number; finalModelStars?: number; units?: number };
  vegasLine: { homeOdds: number; awayOdds: number; openingHomeOdds?: number; openingAwayOdds?: number };
};

const game: Game = {
  sport: 'WNBA', gameTime: '9:00 PM ET',
  homeTeam: { name: 'Aces', abbr: 'LVA', record: '24-8', logoUrl: 'https://a.espncdn.com/i/teamlogos/wnba/500/lva.png' },
  awayTeam: { name: 'Liberty', abbr: 'NYL', record: '22-10', logoUrl: 'https://a.espncdn.com/i/teamlogos/wnba/500/nyl.png' },
  projection: { homeWinPct: 64, valueRating: 'Strong Buy', modelScore: 87, edge: 11.6, finalModelStars: 5, units: 2.5 },
  vegasLine: { homeOdds: -190, awayOdds: 160, openingHomeOdds: -180, openingAwayOdds: 155 },
};

function american(odds: number) { return odds > 0 ? `+${odds}` : `${odds}`; }
function implied(odds: number) { return odds < 0 ? Math.abs(odds) / (Math.abs(odds) + 100) * 100 : 100 / (odds + 100) * 100; }

function Logo({ team }: { team: Game['homeTeam'] }) {
  const [failed, setFailed] = useState(false);
  return <div className="tbm-logo">{team.logoUrl && !failed ? <img src={team.logoUrl} alt="" onError={() => setFailed(true)} /> : team.abbr}</div>;
}

export function Current() {
  const pickIsHome = game.projection.homeWinPct >= 50;
  const pick = pickIsHome ? game.homeTeam : game.awayTeam;
  const odds = pickIsHome ? game.vegasLine.homeOdds : game.vegasLine.awayOdds;
  const opening = pickIsHome ? game.vegasLine.openingHomeOdds : game.vegasLine.openingAwayOdds;
  const move = opening && opening !== odds ? (implied(odds) - implied(opening)) * -1 : 0;
  const isPositive = move > 0;
  return (
    <main className="tbm-preview" style={{ padding: '42px 14px' }}>
      <article className="tbm-card" aria-label="Current game pick card">
        <section style={{ padding: '12px 14px 11px', borderBottom: '1px solid #1c2320' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="tbm-label" style={{ color: 'var(--tbm-lime)' }}>The pick</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ padding: '3px 7px', border: '1px solid #ffffff38', borderRadius: 6, color: '#f3f5f2', fontSize: 10, fontWeight: 700, letterSpacing: '.08em' }}>{game.projection.valueRating.toUpperCase()}</span>
              <span className="tbm-mono" style={{ padding: '3px 8px', border: '1px solid #33420f', borderRadius: 5, background: 'var(--tbm-lime-soft)', color: 'var(--tbm-lime)', fontSize: 12, fontWeight: 700 }}>{game.projection.units}u</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8 }}>
            <strong style={{ fontSize: 26, letterSpacing: '-.04em' }}>{pick.abbr}</strong>
            <span style={{ color: 'var(--tbm-muted)', fontSize: 9, fontWeight: 700, letterSpacing: '.08em' }}>{pickIsHome ? 'HOME' : 'AWAY'}</span>
            <span style={{ color: 'var(--tbm-muted)', fontSize: 13, fontWeight: 600 }}>Moneyline</span>
            <span className="tbm-mono" style={{ marginLeft: 'auto', padding: '3px 8px', border: '1px solid #2a302d', borderRadius: 4, color: '#e5e9e5', fontSize: 14, fontWeight: 700 }}>{american(odds)}</span>
          </div>
          {opening && <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 9, padding: '5px 9px', border: '1px solid #1d2421', borderRadius: 6, background: '#0b0e0d', color: 'var(--tbm-muted)', fontSize: 11 }}>
            <b className="tbm-label">CLV</b><span>Open <b style={{ color: '#d1d7d1' }}>{american(opening)}</b></span><span style={{ color: 'var(--tbm-dim)' }}>→</span><b style={{ color: '#e5e9e5' }}>{american(odds)}</b><b style={{ marginLeft: 'auto', color: isPositive ? 'var(--tbm-lime)' : 'var(--tbm-red)' }}>{isPositive ? '▲' : '▼'} {Math.abs(move).toFixed(1)}%</b>
          </div>}
        </section>
        <div style={{ padding: '10px 14px 4px', color: 'var(--tbm-muted)', fontSize: 10, fontWeight: 600 }}>{game.sport} &nbsp;·&nbsp; {game.gameTime}</div>
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 14px 2px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}><Logo team={game.awayTeam} /><div><b style={{ fontSize: 15 }}>{game.awayTeam.abbr}</b><div className="tbm-label" style={{ marginTop: 2, color: 'var(--tbm-dim)' }}>{game.awayTeam.record}</div><div className="tbm-label" style={{ color: 'var(--tbm-dim)', marginTop: 2 }}>AWAY</div></div></div>
          <span style={{ color: '#4b5750', fontSize: 10, fontWeight: 700 }}>vs</span>
          <div style={{ display: 'flex', flexDirection: 'row-reverse', alignItems: 'center', gap: 8, flex: 1, textAlign: 'right' }}><Logo team={game.homeTeam} /><div><b style={{ fontSize: 15 }}>{game.homeTeam.abbr}</b><div className="tbm-label" style={{ marginTop: 2, color: 'var(--tbm-dim)' }}>{game.homeTeam.record}</div><div className="tbm-label" style={{ color: 'var(--tbm-dim)', marginTop: 2 }}>HOME</div></div></div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px 12px' }}>
          <strong className="tbm-mono" style={{ fontSize: 28 }}>{game.projection.modelScore}<small style={{ color: 'var(--tbm-lime)', fontSize: 12 }}>/100</small></strong>
          <i style={{ height: 22, width: 1, margin: '0 12px', background: 'var(--tbm-line)', opacity: .8 }} />
          <div><div className="tbm-label">Edge</div><b className="tbm-mono" style={{ color: 'var(--tbm-lime)', fontSize: 13 }}>+{Math.abs(game.projection.edge).toFixed(1)}%</b></div>
          <i style={{ height: 22, width: 1, margin: '0 12px', background: 'var(--tbm-line)', opacity: .8 }} />
          <div><div className="tbm-label">Conf</div><b style={{ color: 'var(--tbm-lime)', fontSize: 13, letterSpacing: 1 }}>HIGH</b></div>
        </div>
      </article>
    </main>
  );
}