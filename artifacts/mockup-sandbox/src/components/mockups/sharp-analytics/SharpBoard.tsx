import { useState } from 'react';
import {
  Activity,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  LockKeyhole,
  MessageCircle,
  Radio,
  UserRound,
} from 'lucide-react';
import './_group.css';

type Sport = 'ALL' | 'MLB' | 'SOCCER' | 'NFL';

const markets = [
  {
    sport: 'MLB',
    league: 'MLB',
    time: '6:40 PM',
    away: 'Marlins',
    home: 'Diamondbacks',
    open: 'ARI -1.5  +122',
    current: 'ARI -1.5  -105',
    model: 'ARI -1.5  -128',
    move: '17¢',
    direction: 'toward',
    score: '+4.1%',
    detail: 'Market caught up to the model after Arizona lineup news.',
    note: 'Projected CLV',
  },
  {
    sport: 'SOCCER',
    league: 'LA LIGA',
    time: '3:30 PM',
    away: 'Real Madrid',
    home: 'Elche',
    open: 'RMA -1.5  -110',
    current: 'RMA -1.5  -135',
    model: 'RMA -1.5  -118',
    move: '25¢',
    direction: 'past',
    score: '-2.7%',
    detail: 'Price has moved past the model number. Better value is gone.',
    note: 'Projected CLV',
  },
  {
    sport: 'NFL',
    league: 'NFL · W1',
    time: '8:15 PM',
    away: 'Baltimore',
    home: 'Houston',
    open: 'BAL -3.5  -108',
    current: 'BAL -3  -115',
    model: 'BAL -3.5  -121',
    move: '½ pt',
    direction: 'away',
    score: '+0.0%',
    detail: 'Side moved away from the model. Monitor the number, not the juice.',
    note: 'Projected CLV',
  },
  {
    sport: 'MLB',
    league: 'MLB',
    time: 'FINAL',
    away: 'Cubs',
    home: 'Brewers',
    open: 'MIL -1.5  +105',
    current: 'MIL -1.5  -115',
    model: 'MIL -1.5  -102',
    move: '20¢',
    direction: 'closed',
    score: '+3.2%',
    detail: 'Closing market finished on the model side. Result is graded.',
    note: 'Final CLV',
  },
  {
    sport: 'SOCCER',
    league: 'EREDIVISIE',
    time: '2:00 PM',
    away: 'II',
    home: 'Amsterdam',
    open: 'AMR  +0.5  -115',
    current: '—',
    model: 'AMR  +0.5  -104',
    move: '—',
    direction: 'missing',
    score: '—',
    detail: 'Opening snapshot is available. Current market history has not arrived.',
    note: 'History unavailable',
  },
];

const tabs = [
  [CalendarDays, 'Games'],
  [Activity, 'Sharp'],
  [MessageCircle, 'Chat'],
  [UserRound, 'Profile'],
] as const;

export function SharpBoard() {
  const [sport, setSport] = useState<Sport>('ALL');
  const [expanded, setExpanded] = useState<string | null>('Marlins');
  const [showNote, setShowNote] = useState(false);

  const visible = markets.filter((game) => sport === 'ALL' || game.sport === sport);

  return (
    <main className="tbm-phone relative min-h-[100dvh] overflow-hidden bg-black text-white">
      <div className="tbm-tab-safe px-4 pb-[108px] pt-12">
        <header className="flex items-start justify-between">
          <div>
            <h1 className="text-[30px] font-bold tracking-[-1.5px]">TBM</h1>
            <p className="mt-1 text-[10px] font-bold tracking-[1.8px] text-zinc-500">MARKET INTELLIGENCE · TUE, SEP 15</p>
          </div>
          <button
            type="button"
            aria-label="Market data information"
            onClick={() => setShowNote((current) => !current)}
            className="mt-1 rounded-full border border-zinc-800 p-2 text-zinc-500 transition-colors hover:border-lime-400 hover:text-lime-400"
          >
            <CircleHelp size={16} />
          </button>
        </header>

        {showNote && (
          <div className="mt-4 rounded border border-lime-900/70 bg-lime-950/30 px-3 py-2 text-[11px] leading-4 text-zinc-300">
            Open and current prices are consensus snapshots. Model lines are TBM projections, not bookmaker prices.
          </div>
        )}

        <section className="mt-7 flex items-end justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-lime-400">Sharp board</p>
            <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.5px]">Where the market moved</h2>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-zinc-500">5 tracked</p>
            <p className="mt-1 text-[11px] font-medium text-zinc-300">Updated 2m ago</p>
          </div>
        </section>

        <div className="mt-5 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filter markets by sport">
          {(['ALL', 'MLB', 'SOCCER', 'NFL'] as Sport[]).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={sport === item}
              onClick={() => setSport(item)}
              className={`shrink-0 rounded px-3 py-2 text-[10px] font-bold tracking-[1px] transition-colors ${
                sport === item ? 'bg-lime-400 text-black' : 'border border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-white'
              }`}
            >
              {item === 'ALL' ? 'ALL MARKETS' : item}
            </button>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-[1fr_54px_54px_54px] gap-2 border-b border-zinc-800 pb-2 text-[9px] font-bold uppercase tracking-[1px] text-zinc-600">
          <span>Matchup / status</span><span>Open</span><span>Now</span><span>Model</span>
        </div>

        <div className="divide-y divide-zinc-900">
          {visible.map((game) => {
            const isOpen = expanded === game.away;
            const isMissing = game.direction === 'missing';
            const isClosed = game.direction === 'closed';
            return (
              <section key={game.away} className="py-4">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : game.away)}
                  aria-expanded={isOpen}
                  className="grid w-full grid-cols-[1fr_54px_54px_54px] items-start gap-2 text-left"
                >
                  <div className="min-w-0">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-[9px] font-bold tracking-[1.2px] text-zinc-600">{game.league}</span>
                      {isClosed ? <span className="text-[9px] font-bold text-zinc-500">CLOSED</span> : <span className="text-[9px] text-zinc-500">{game.time}</span>}
                    </div>
                    <p className="truncate text-[13px] font-semibold">{game.away} <span className="font-normal text-zinc-600">@</span> {game.home}</p>
                    <div className="mt-2 flex items-center gap-2">
                      {!isMissing && <span className={`h-1.5 w-1.5 rounded-full ${game.direction === 'past' ? 'bg-amber-400' : game.direction === 'away' ? 'bg-zinc-500' : 'bg-lime-400'}`} />}
                      <span className={`text-[10px] font-semibold ${isMissing ? 'text-zinc-600' : game.direction === 'past' ? 'text-amber-400' : game.direction === 'away' ? 'text-zinc-400' : 'text-lime-400'}`}>
                        {isMissing ? 'NO CURRENT SNAPSHOT' : `${game.move} ${game.direction === 'closed' ? 'movement' : 'movement'}`}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] leading-5 text-zinc-400">{game.open.split('  ')[0]}<br />{game.open.split('  ')[1]}</span>
                  <span className={`text-[10px] leading-5 ${isMissing ? 'text-zinc-700' : 'text-white'}`}>{game.current === '—' ? '—' : <>{game.current.split('  ')[0]}<br />{game.current.split('  ')[1]}</>}</span>
                  <span className="text-[10px] leading-5 text-lime-300">{game.model.split('  ')[0]}<br />{game.model.split('  ')[1]}</span>
                </button>
                {isOpen && (
                  <div className="ml-0 mt-3 border-l border-zinc-800 pl-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] leading-4 text-zinc-400">{game.detail}</p>
                      <span className={`shrink-0 text-[12px] font-bold ${game.score.startsWith('-') ? 'text-amber-400' : game.score === '—' ? 'text-zinc-600' : 'text-lime-400'}`}>{game.score}</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-[9px] font-bold uppercase tracking-[1px]">
                      <span className={isMissing ? 'text-zinc-600' : 'text-zinc-500'}>{game.note}</span>
                      {!isMissing && <span className="flex items-center gap-1 text-zinc-600"><Radio size={11} /> Consensus feed</span>}
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>

      <nav className="absolute inset-x-0 bottom-0 flex h-[78px] items-center justify-around border-t border-zinc-900 bg-black/95 pb-2">
        {tabs.map(([Icon, label]) => {
          const active = label === 'Sharp';
          return (
            <button key={label} type="button" aria-current={active ? 'page' : undefined} onClick={() => undefined} className={`flex flex-col items-center gap-1 text-[11px] ${active ? 'text-lime-400' : 'text-zinc-500'}`}>
              <Icon size={22} strokeWidth={active ? 2.4 : 1.8} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
      <div className="absolute right-3 top-3 flex items-center gap-1 rounded bg-zinc-900 px-2 py-1 text-[9px] font-bold uppercase tracking-[1px] text-zinc-500">
        <LockKeyhole size={10} /> Pro
      </div>
    </main>
  );
}