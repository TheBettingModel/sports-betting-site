import './_group.css';

const game = {
  sport: 'MLB',
  gameTime: '7:05 PM ET',
  homeTeam: {
    city: 'New York',
    name: 'Yankees',
    abbr: 'NYY',
    record: '62-38',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/mlb/500/nyy.png',
  },
  awayTeam: {
    city: 'Boston',
    name: 'Red Sox',
    abbr: 'BOS',
    record: '54-46',
    logoUrl: 'https://a.espncdn.com/i/teamlogos/mlb/500/bos.png',
  },
  projection: {
    valueRating: 'Strong Buy',
    modelScore: 91,
    edge: 14.2,
    finalModelTier: 'Top Pick',
    finalModelStars: 5,
    units: 2.5,
    awayStarter: { name: 'Garrett Crochet', era: 2.85 },
    homeStarter: { name: 'Max Fried', era: 2.50 },
    bestLineBook: 'FanDuel',
    bestLineOdds: -140,
  },
  vegasLine: { homeOdds: -145, total: 8.5, spread: -1.5 },
  insights: ['Yankees bullpen edge', 'Red Sox 3-7 in last 10'],
};

function fmtOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function TeamLogo({
  abbr,
  logoUrl,
}: {
  abbr: string;
  logoUrl: string;
}) {
  return (
    <span className="featured-pick-current__logo">
      <img
        src={logoUrl}
        alt={`${abbr} logo`}
        onError={(event) => {
          event.currentTarget.style.display = 'none';
          const fallback = event.currentTarget.nextElementSibling as HTMLElement;
          fallback.style.display = 'grid';
        }}
      />
      <span>{abbr}</span>
    </span>
  );
}

function ValueBadge({ rating }: { rating: string }) {
  return <span className="featured-pick-current__badge">{rating.toUpperCase()}</span>;
}

export function Current() {
  const { homeTeam, awayTeam, gameTime, sport, projection, vegasLine, insights } = game;
  const pickTeam = homeTeam;
  const edgeAbs = Math.abs(projection.edge);

  return (
    <main className="featured-pick-current">
      <article className="featured-pick-current__card" aria-label="Featured MLB pick">
        <header className="featured-pick-current__band">
          <span>{sport} · {projection.finalModelTier.toUpperCase()}</span>
          <span>{gameTime}</span>
        </header>

        <div className="featured-pick-current__body">
          <section className="featured-pick-current__matchup">
            <div className="featured-pick-current__team">
              <TeamLogo abbr={awayTeam.abbr} logoUrl={awayTeam.logoUrl} />
              <strong>{awayTeam.abbr}</strong>
              <small>{awayTeam.record}</small>
            </div>
            <div className="featured-pick-current__versus">
              <b>vs</b>
              <span>{awayTeam.city} {awayTeam.name}<br />{homeTeam.city} {homeTeam.name}</span>
            </div>
            <div className="featured-pick-current__team">
              <TeamLogo abbr={homeTeam.abbr} logoUrl={homeTeam.logoUrl} />
              <strong>{homeTeam.abbr}</strong>
              <small>{homeTeam.record}</small>
            </div>
          </section>

          <section className="featured-pick-current__pitchers" aria-label="Starting pitcher matchup">
            <div>
              <span>SP</span>
              <strong>{projection.awayStarter.name.split(' ').pop()}</strong>
              <em>{projection.awayStarter.era.toFixed(2)} ERA</em>
            </div>
            <b>vs</b>
            <div>
              <span>SP</span>
              <strong>{projection.homeStarter.name.split(' ').pop()}</strong>
              <em>{projection.homeStarter.era.toFixed(2)} ERA</em>
            </div>
          </section>

          <section className="featured-pick-current__score">
            <div>
              <span className="featured-pick-current__label">MODEL SCORE</span>
              <div className="featured-pick-current__score-number">
                <strong>{projection.modelScore}</strong><b>/100</b>
              </div>
              <div className="featured-pick-current__stars" aria-label="Five stars">★★★★★</div>
            </div>
            <div className="featured-pick-current__badge-column">
              <ValueBadge rating={projection.valueRating} />
              <span className="featured-pick-current__units">{projection.units.toFixed(1)}u</span>
            </div>
          </section>

          <section className="featured-pick-current__pick">
            <span className="featured-pick-current__label">PICK</span>
            <strong>{pickTeam.abbr}</strong>
            <b>EDGE: +{edgeAbs.toFixed(1)}%</b>
          </section>

          <section className="featured-pick-current__vegas" aria-label="Vegas line">
            <span>VEGAS · {fmtOdds(vegasLine.homeOdds)}</span>
            <i>|</i>
            <span>O/U · {vegasLine.total}</span>
            <i>|</i>
            <span>SPREAD · {vegasLine.spread}</span>
          </section>

          <section className="featured-pick-current__best-line">
            <span className="featured-pick-current__label">BEST LINE</span>
            <b>{fmtOdds(projection.bestLineOdds)}</b>
            <span>at</span>
            <strong>{projection.bestLineBook}</strong>
          </section>

          <section className="featured-pick-current__insights">
            {insights.map((insight) => <span key={insight}>{insight}</span>)}
          </section>
        </div>
      </article>
    </main>
  );
}