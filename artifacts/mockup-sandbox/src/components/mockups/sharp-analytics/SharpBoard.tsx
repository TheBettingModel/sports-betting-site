import { Activity, CalendarDays, ChevronRight, CircleHelp, MessageCircle, RefreshCw, UserRound } from 'lucide-react';
import './_group.css';

type Sport = 'ALL' | 'MLB' | 'SOCCER' | 'NFL';

const markets = [
  {
    sport: 'MLB',
    time: '9:40 PM',
    away: 'Marlins',
    home: 'Diamondbacks',
    market: 'ARI -1.5 · -105',
    open: 'Open +122',
    move: '17¢ toward Arizona',
    clv: '+4.1%',
    tone: 'lime',
    note: 'Sharp money is following the model.',
  },
  {
    sport: 'SOCCER',
    time: '3:30 PM',
    away: 'Real Madrid',
    home: 'Elche',
    market: 'RMA -1.5 · -135',
    open: 'Open -110',
    move: '25¢ past the model',
    clv: '-2.7%',
    tone: 'amber',
    note: 'The market moved first. Value is thinning.',
  },
  {
    sport: 'NFL',
    time: '8:15 PM',
    away: 'Atlanta',
    home: 'New York',
    market: 'NYJ -1.5 · -115',
    open: 'Open -2.5',
    move: '1 pt toward New York',
    clv: '+0.8%',
    tone: 'lime',
    note: 'A steady move toward the model side.',
  },
  {
    sport: 'MLB',
    time: 'FINAL',
    away: 'Cubs',
    home: 'Brewers',
    market: 'MIL -1.5 · -115',
    open: 'Open +105',
    move: '20¢ toward Milwaukee',
    clv: '+3.2%',
    tone: 'lime',
    note: 'Closed on the model side. Final CLV confirmed.',
  },
  {
    sport: 'SOCCER',
    time: '2:00 PM',
    away: 'II',
    home: 'Amsterdam',
    market: 'Current unavailable',
    open: 'Open +0.5 · -115',
    move: 'No current snapshot',
    clv: '—',
    tone: 'muted',
    note: 'Market history has not arrived yet.',
  },
];

const tabs = [
  [CalendarDays, 'Games'],
  [Activity, 'Sharp'],
  [MessageCircle, 'Chat'],
  [UserRound, 'Profile'],
] as const;

export function SharpBoard() {
  return (
    <main className="tbm-phone relative min-h-[100dvh] overflow-hidden bg-black text-white">
      <div className="tbm-tab-safe px-4 pb-[108px] pt-12">
        <header className="flex items-start justify-between">
          <div>
            <h1 className="text-[30px] font-bold tracking-[-1.5px]">TBM</h1>
            <p className="mt-1 text-[10px] font-bold tracking-[1.8px] text-zinc-500">SHARP MONEY · TUE, SEP 15</p>
          </div>
          <button type="button" aria-label="Refresh market movement" className="rounded-full border border-zinc-800 p-2 text-zinc-500">
            <RefreshCw size={15} />
          </button>
        </header>

        <section className="mt-8 border-b border-zinc-900 pb-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-lime-400">Market direction</p>
              <h2 className="mt-1 text-[22px] font-semibold tracking-[-0.7px]">Where money is going</h2>
            </div>
            <button type="button" aria-label="About sharp money and CLV" className="rounded-full border border-zinc-800 p-2 text-zinc-500">
              <CircleHelp size={15} />
            </button>
          </div>
          <p className="mt-3 max-w-[330px] text-[12px] leading-5 text-zinc-500">
            Follow the market’s direction, then check whether the move is creating or erasing model value.
          </p>
        </section>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filter movement by sport">
          {(['ALL', 'MLB', 'SOCCER', 'NFL'] as Sport[]).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={item === 'ALL'}
              className={`shrink-0 rounded px-3 py-2 text-[10px] font-bold tracking-[1px] ${item === 'ALL' ? 'bg-lime-400 text-black' : 'border border-zinc-800 text-zinc-500'}`}
            >
              {item === 'ALL' ? 'ALL MOVES' : item}
            </button>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-[1.5px] text-zinc-600">Today’s movement</p>
          <p className="text-[10px] text-zinc-600">Updated 2m ago</p>
        </div>

        <div className="mt-3 space-y-2">
          {markets.map((game) => (
            <button key={game.away} type="button" className="block w-full rounded border border-zinc-900 bg-zinc-950/70 p-3 text-left transition-colors hover:border-zinc-700">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[1.2px] text-zinc-600">
                    <span>{game.sport}</span><span>·</span><span>{game.time}</span>
                  </div>
                  <p className="mt-2 truncate text-[14px] font-semibold">{game.away} <span className="font-normal text-zinc-600">@</span> {game.home}</p>
                </div>
                <ChevronRight size={15} className="mt-1 shrink-0 text-zinc-700" />
              </div>

              <div className="mt-3 flex items-end justify-between border-t border-zinc-900 pt-3">
                <div>
                  <p className="text-[9px] uppercase tracking-[1px] text-zinc-600">Market now</p>
                  <p className="mt-1 text-[13px] font-medium text-zinc-200">{game.market}</p>
                  <p className="mt-1 text-[10px] text-zinc-600">{game.open}</p>
                </div>
                <div className="text-right">
                  <p className={`text-[13px] font-bold ${game.tone === 'lime' ? 'text-lime-400' : game.tone === 'amber' ? 'text-amber-400' : 'text-zinc-600'}`}>{game.clv} CLV</p>
                  <p className={`mt-1 text-[10px] ${game.tone === 'lime' ? 'text-lime-400' : game.tone === 'amber' ? 'text-amber-400' : 'text-zinc-600'}`}>{game.move}</p>
                </div>
              </div>
              <p className="mt-3 text-[11px] leading-4 text-zinc-500">{game.note}</p>
            </button>
          ))}
        </div>
      </div>

      <nav className="absolute inset-x-0 bottom-0 flex h-[78px] items-center justify-around border-t border-zinc-900 bg-black/95 pb-2">
        {tabs.map(([Icon, label]) => {
          const active = label === 'Sharp';
          return (
            <button key={label} type="button" aria-current={active ? 'page' : undefined} className={`flex flex-col items-center gap-1 text-[11px] ${active ? 'text-lime-400' : 'text-zinc-500'}`}>
              <Icon size={22} strokeWidth={active ? 2.4 : 1.8} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
    </main>
  );
}