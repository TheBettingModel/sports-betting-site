import './_group.css';
import { useState } from 'react';

type Team = {
  name: string;
  abbr: string;
  record: string;
  logoUrl?: string;
};

type Game = {
  sport: string;
  gameTime: string;
  homeTeam: Team;
  awayTeam: Team;
  projection: {
    homeWinPct: number;
    valueRating: string;
    modelScore: number;
    edge: number;
    units?: number;
    confidence: string;
    sharpSignal?: string;
  };
  vegasLine: {
    homeOdds: number;
    awayOdds: number;
    openingHomeOdds?: number;
    openingAwayOdds?: number;
  };
};

const game: Game = {
  sport: 'WNBA',
  gameTime: '9:00 PM ET',
  awayTeam: {
    name: 'Liberty',
    abbr: 'NYL',
    record: '22-10',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/wnba/500/nyl.png',
  },
  homeTeam: {
    name: 'Aces',
    abbr: 'LVA',
    record: '24-8',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/wnba/500/lv.png',
  },
  projection: {
    homeWinPct: 64,
    valueRating: 'Strong Buy',
    modelScore: 87,
    edge: 4.4,
    units: 2.5,
    confidence: 'High',
    sharpSignal: 'Sharp Play',
  },
  vegasLine: {
    homeOdds: -160,
    awayOdds: 140,
    openingHomeOdds: -145,
    openingAwayOdds: 125,
  },
};

function american(odds: number) {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function implied(odds: number) {
  return odds < 0
    ? (Math.abs(odds) / (Math.abs(odds) + 100)) * 100
    : (100 / (odds + 100)) * 100;
}

function fairOdds(probability: number) {
  return probability >= 50
    ? Math.round(-((probability / 100) / (1 - probability / 100)) * 100)
    : Math.round(((1 - probability / 100) / (probability / 100)) * 100);
}

function Logo({ team }: { team: Team }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="tbm-logo" aria-label={`${team.name} logo`}>
      {team.logoUrl && !failed ? (
        <img src={team.logoUrl} alt="" onError={() => setFailed(true)} />
      ) : (
        team.abbr
      )}
    </div>
  );
}

export function ScanFirst() {
  const [expanded, setExpanded] = useState(false);
  const pick = game.homeTeam;
  const odds = game.vegasLine.homeOdds;
  const model = game.projection.homeWinPct;
  const market = implied(odds);

  return (
    <main className="tbm-preview" style={{ padding: '32px 14px' }}>
      <article
        className="tbm-card"
        style={{ borderLeftWidth: 3, maxWidth: 390 }}
        aria-label={`${game.sport} recommendation`}
      >
        <header
          style={{
            padding: '15px 16px 14px',
            borderBottom: '1px solid var(--tbm-line-soft)',
            boxShadow: 'inset 3px 0 0 rgba(183,243,74,.28)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="tbm-label">
              <span style={{ color: 'var(--tbm-lime)' }}>MODEL BOARD</span>
              <span style={{ color: 'var(--tbm-dim)', margin: '0 6px' }}>/</span>
              {game.sport}
            </div>
            <div className="tbm-label" style={{ letterSpacing: '.08em' }}>
              {game.gameTime}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 15 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <Logo team={game.awayTeam} />
              <div>
                <b style={{ display: 'block', fontSize: 14 }}>{game.awayTeam.abbr}</b>
                <span className="tbm-label" style={{ display: 'block', marginTop: 3, color: 'var(--tbm-dim)', letterSpacing: '.08em' }}>
                  {game.awayTeam.record} · AWAY
                </span>
              </div>
            </div>
            <span className="tbm-mono" style={{ color: 'var(--tbm-dim)', fontSize: 10, letterSpacing: '.12em' }}>
              AT
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, textAlign: 'right' }}>
              <div>
                <b style={{ display: 'block', fontSize: 14 }}>{game.homeTeam.abbr}</b>
                <span className="tbm-label" style={{ display: 'block', marginTop: 3, color: 'var(--tbm-dim)', letterSpacing: '.08em' }}>
                  {game.homeTeam.record} · HOME
                </span>
              </div>
              <Logo team={game.homeTeam} />
            </div>
          </div>
        </header>

        <section style={{ padding: '17px 16px 12px' }}>
          <div className="tbm-label" style={{ color: 'var(--tbm-lime)' }}>
            TBM recommendation
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginTop: 5 }}>
            <h1 style={{ margin: 0, color: 'var(--tbm-text)', fontSize: 28, letterSpacing: '-.055em', lineHeight: 1.05 }}>
              {pick.name} ML
            </h1>
            <strong className="tbm-mono" style={{ color: 'var(--tbm-text)', fontSize: 20 }}>
              {american(odds)}
            </strong>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 11 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--tbm-lime)' }} />
            <span style={{ color: 'var(--tbm-lime)', fontSize: 11, fontWeight: 700, letterSpacing: '.1em' }}>
              {game.projection.valueRating.toUpperCase()}
            </span>
            <span style={{ color: 'var(--tbm-dim)' }}>·</span>
            <span className="tbm-mono" style={{ color: 'var(--tbm-muted)', fontSize: 11 }}>
              {game.projection.units?.toFixed(1)}U
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 6 }}>
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
              style={{
                minHeight: 34,
                padding: '0 0 0 14px',
                border: 0,
                background: 'transparent',
                color: 'var(--tbm-text)',
                cursor: 'pointer',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '.11em',
              }}
            >
              {expanded ? 'HIDE ANALYSIS' : 'VIEW ANALYSIS'}
              <span style={{ color: 'var(--tbm-lime)', marginLeft: 7 }}>{expanded ? '−' : '+'}</span>
            </button>
          </div>
        </section>

        {expanded && (
          <section style={{ padding: '0 16px 17px', animation: 'tbmReveal .24s ease-out' }}>
            <div style={{ paddingTop: 14, borderTop: '1px solid var(--tbm-line)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 13 }}>
                <div className="tbm-label" style={{ color: 'var(--tbm-text)' }}>
                  Why TBM likes {pick.name}
                </div>
                <span className="tbm-label" style={{ color: 'var(--tbm-lime)', letterSpacing: '.08em' }}>
                  LIVE SIGNAL
                </span>
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                <DetailRow label="Win probability" value={`${model.toFixed(1)}%`} />
                <DetailRow label="Confidence" value={game.projection.confidence} />
                <DetailRow label="Fair price" value={american(fairOdds(model))} />
                <DetailRow label="Market price" value={american(odds)} />
                <DetailRow label="Model score" value={`${game.projection.modelScore}/100`} />
                <DetailRow label="Line movement" value={`${american(game.vegasLine.openingHomeOdds ?? odds)} → ${american(odds)}`} />
                <DetailRow label="Market read" value={game.projection.sharpSignal ?? 'No sharp signal'} accent />
              </div>
              <p style={{ margin: '14px 0 0', color: 'var(--tbm-muted)', fontSize: 11, lineHeight: 1.45 }}>
                Higher weighted grades across efficiency, shot quality, and home-court inputs. Current price still clears the model threshold.
              </p>
            </div>
          </section>
        )}
      </article>
    </main>
  );
}

function DetailRow({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 11 }}>
      <span className="tbm-label" style={{ letterSpacing: '.1em' }}>{label}</span>
      <b className={value.includes('%') || value.includes('-') || value.includes('+') ? 'tbm-mono' : undefined} style={{ color: accent ? 'var(--tbm-lime)' : 'var(--tbm-text)', fontWeight: 600 }}>
        {value}
      </b>
    </div>
  );
}