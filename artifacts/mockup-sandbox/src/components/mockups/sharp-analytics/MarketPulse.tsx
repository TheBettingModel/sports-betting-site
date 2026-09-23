import { useMemo, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  ChevronDown,
  Clock3,
  MessageCircle,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react';
import './_group.css';

type Sport = 'ALL' | 'MLB' | 'SOCCER' | 'NFL';
type Movement = 'up' | 'down' | 'flat';

type Market = {
  id: string;
  sport: Exclude<Sport, 'ALL'>;
  time: string;
  matchup: string;
  market: string;
  open: string;
  current: string;
  model: string;
  move: string;
  movement: Movement;
  signal: string;
  note: string;
  updated: string;
  status: 'OPEN' | 'CLOSED';
};

const markets: Market[] = [
  {
    id: 'mia-ari',
    sport: 'MLB',
    time: '9:40 PM',
    matchup: 'Marlins at Diamondbacks',
    market: 'Moneyline',
    open: 'ARI -142',
    current: 'ARI -158',
    model: 'ARI -171',
    move: '16¢',
    movement: 'down',
    signal: 'Toward model',
    note: 'Price tightened on Arizona. Model still shows 13¢ of room.',
    updated: '4 min ago',
    status: 'OPEN',
  },
  {
    id: 'at-nyj',
    sport: 'NFL',
    time: 'THU · 8:15 PM',
    matchup: 'Atlanta at New York',
    market: 'Spread',
    open: 'NYJ -2.5',
    current: 'NYJ -1.5',
    model: 'NYJ -4.0',
    move: '1.0 pt',
    movement: 'up',
    signal: 'Away from model',
    note: 'The market has given Atlanta a point. Your model remains stronger on New York.',
    updated: '18 min ago',
    status: 'OPEN',
  },
  {
    id: 'esp-rayo',
    sport: 'SOCCER',
    time: '2:30 PM',
    matchup: 'Espanyol at Vallecano',
    market: '3-way moneyline',
    open: 'RAYO +145',
    current: 'RAYO +124',
    model: 'RAYO +110',
    move: '21¢',
    movement: 'down',
    signal: 'Toward model',
    note: 'Rayo shortened sharply across tracked books. Match kicks off in 38 minutes.',
    updated: '2 min ago',
    status: 'OPEN',
  },
  {
    id: 'bos-nyy',
    sport: 'MLB',
    time: '7:05 PM',
    matchup: 'Boston at New York',
    market: 'Run line',
    open: 'BOS +1.5 -155',
    current: 'BOS +1.5 -140',
    model: 'BOS +1.5 -118',
    move: '15¢',
    movement: 'up',
    signal: 'Away from model',
    note: 'Boston protection is cheaper, but model probability has not moved with it.',
    updated: '41 min ago',
    status: 'OPEN',
  },
  {
    id: 'val-ala',
    sport: 'SOCCER',
    time: 'FINAL · 12:00 PM',
    matchup: 'Valencia 0, Alavés 0',
    market: 'Moneyline',
    open: 'VAL -105',
    current: 'VAL -118',
    model: 'VAL -120',
    move: '15¢',
    movement: 'down',
    signal: 'Final CLV +2¢',
    note: 'Closed 2¢ better than the model line. Market confirmed the pregame lean.',
    updated: 'Closed',
    status: 'CLOSED',
  },
];

function MovementIcon({ movement }: { movement: Movement }) {
  if (movement === 'up') return <ArrowUpRight size={16} strokeWidth={2.5} />;
  if (movement === 'down') return <ArrowDownRight size={16} strokeWidth={2.5} />;
  return <span className="h-px w-3 bg-zinc-500" />;
}

export function MarketPulse() {
  const [sport, setSport] = useState<Sport>('ALL');
  const [expanded, setExpanded] = useState<string | null>('mia-ari');
  const [showClosed, setShowClosed] = useState(false);

  const visibleMarkets = useMemo(
    () =>
      markets.filter((item) => (sport === 'ALL' || item.sport === sport) && (showClosed || item.status !== 'CLOSED')),
    [showClosed, sport],
  );

  return (
    <main className="tbm-phone relative overflow-hidden bg-black px-4 pt-11">
      <div className="tbm-tab-safe">
        <header className="flex items-start justify-between">
          <div>
            <h1 className="text-[29px] font-bold tracking-[-1.3px]">TBM</h1>
            <p className="mt-1 text-[10px] font-bold tracking-[1.75px] text-zinc-500">MARKET PULSE · TUE, SEP 15</p>
          </div>
          <button
            aria-label="Market filters"
            className="mt-1 rounded-md border border-zinc-800 p-2 text-zinc-400 transition hover:border-zinc-600 hover:text-white"
            onClick={() => setShowClosed((value) => !value)}
          >
            <SlidersHorizontal size={17} />
          </button>
        </header>

        <section className="mt-6 border-y border-zinc-900 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-lime-400" />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-[1.2px] text-lime-400">Live intelligence</span>
            </div>
            <span className="text-[10px] text-zinc-600">Updated just now</span>
          </div>
          <p className="mt-2 text-[12px] leading-5 text-zinc-400">Ranked by meaningful movement, not market noise.</p>
        </section>

        <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Sports">
          {(['ALL', 'MLB', 'SOCCER', 'NFL'] as Sport[]).map((item) => (
            <button
              key={item}
              role="tab"
              aria-selected={sport === item}
              onClick={() => setSport(item)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold tracking-[.8px] transition ${
                sport === item ? 'bg-lime-400 text-black' : 'border border-zinc-800 text-zinc-500 hover:border-zinc-600'
              }`}
            >
              {item === 'ALL' ? 'ALL MOVES' : item}
            </button>
          ))}
          <button
            onClick={() => setShowClosed((value) => !value)}
            className={`ml-auto shrink-0 text-[10px] font-semibold ${showClosed ? 'text-lime-400' : 'text-zinc-600'}`}
          >
            {showClosed ? 'Hide closed' : 'Include closed'}
          </button>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-[1.15px] text-zinc-300">Largest moves</p>
          <span className="text-[10px] text-zinc-600">{visibleMarkets.length} tracked</span>
        </div>

        <div className="mt-2 space-y-2.5">
          {visibleMarkets.map((item, index) => {
            const isExpanded = expanded === item.id;
            const toward = item.signal.includes('Toward') || item.signal.includes('Final');
            return (
              <button
                key={item.id}
                onClick={() => setExpanded(isExpanded ? null : item.id)}
                className="block w-full text-left"
                aria-expanded={isExpanded}
              >
                <article className={`rounded-lg border p-3 transition ${isExpanded ? 'border-zinc-700 bg-[#101010]' : 'border-zinc-900 bg-[#080808] hover:border-zinc-700'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-1 flex items-center gap-2 text-[9px] font-bold tracking-[1px] text-zinc-600">
                        <span>{item.sport}</span><span>·</span><span>{item.time}</span>
                      </div>
                      <h2 className="truncate text-[14px] font-semibold text-zinc-100">{item.matchup}</h2>
                      <p className="mt-1 text-[10px] text-zinc-500">{item.market}</p>
                    </div>
                    <div className={`flex shrink-0 items-center gap-1 rounded px-2 py-1 text-[11px] font-bold ${toward ? 'bg-lime-950/80 text-lime-400' : 'bg-zinc-900 text-zinc-300'}`}>
                      <MovementIcon movement={item.movement} />{item.move}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 border-t border-zinc-900 pt-2.5">
                    <div><p className="text-[9px] uppercase tracking-[.7px] text-zinc-600">Open</p><p className="mt-1 text-[12px] text-zinc-400">{item.open}</p></div>
                    <div><p className="text-[9px] uppercase tracking-[.7px] text-zinc-600">Current</p><p className="mt-1 text-[12px] font-semibold text-zinc-100">{item.current}</p></div>
                    <div><p className="text-[9px] uppercase tracking-[.7px] text-zinc-600">Model</p><p className="mt-1 text-[12px] font-semibold text-lime-400">{item.model}</p></div>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between">
                    <span className={`text-[10px] font-bold ${toward ? 'text-lime-400' : 'text-zinc-400'}`}>{item.signal}</span>
                    <span className="flex items-center gap-1 text-[9px] text-zinc-600"><Clock3 size={11} />{item.updated}</span>
                  </div>
                  {isExpanded && (
                    <div className="mt-3 border-t border-zinc-800 pt-2.5 text-[11px] leading-4 text-zinc-400">
                      <span className="mr-1 font-bold text-zinc-200">Why it matters.</span>{item.note}
                      {item.status === 'OPEN' && <span className="mt-1 block text-[9px] uppercase tracking-[.5px] text-zinc-600">Projected CLV only · close not established</span>}
                    </div>
                  )}
                </article>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-2 border border-zinc-900 bg-[#080808] px-3 py-2.5 text-[10px] leading-4 text-zinc-500">
          <Activity size={14} className="shrink-0 text-zinc-600" />
          <span>Lines are aggregated from tracked books. A missing or stale history is never inferred.</span>
        </div>
      </div>

      <nav className="absolute inset-x-0 bottom-0 flex h-[78px] items-center justify-around border-t border-zinc-900 bg-black/95 pb-2" aria-label="Primary navigation">
        {[
          [CalendarDays, 'Games'],
          [BarChart3, 'Sharp'],
          [MessageCircle, 'Chat'],
          [UserRound, 'Profile'],
        ].map(([Icon, label]) => {
          const TabIcon = Icon as typeof CalendarDays;
          const active = label === 'Sharp';
          return (
            <button key={label as string} className={`flex flex-col items-center gap-1 text-[11px] ${active ? 'text-lime-400' : 'text-zinc-500'}`}>
              <TabIcon size={21} /><span>{label as string}</span>
            </button>
          );
        })}
      </nav>
    </main>
  );
}