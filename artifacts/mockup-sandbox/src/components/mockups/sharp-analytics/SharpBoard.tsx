import { useState } from 'react';
import { Activity, CalendarDays, ChevronDown, ChevronRight, CircleHelp, MessageCircle, RefreshCw, UserRound, X } from 'lucide-react';
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
    move: 'Positive · toward Arizona',
    clv: '+4.1%',
    tone: 'lime',
    note: 'Sharp money is following the model.',
    analytics: { projected: 'Arizona · 61%', score: 'ARI 5.1 — MIA 3.8', total: '8.9 runs', marketRead: 'Market moved 17¢ toward Arizona' },
  },
  {
    sport: 'SOCCER',
    time: '3:30 PM',
    away: 'Real Madrid',
    home: 'Elche',
    market: 'RMA -1.5 · -135',
    open: 'Open -110',
    move: 'Negative · past the model',
    clv: '-2.7%',
    tone: 'amber',
    note: 'The market moved first. Value is thinning.',
    analytics: { projected: 'Real Madrid · 64%', score: 'RMA 2.1 — ELC 0.7', total: '2.8 goals', marketRead: 'Market moved 25¢ past the model' },
  },
  {
    sport: 'NFL',
    time: '8:15 PM',
    away: 'Atlanta',
    home: 'New York',
    market: 'NYJ -1.5 · -115',
    open: 'Open -2.5',
    move: 'Positive · toward New York',
    clv: '+0.8%',
    tone: 'lime',
    note: 'A steady move toward the model side.',
    analytics: { projected: 'New York · 54%', score: 'ATL 20 — NYJ 24', total: '44 points', marketRead: 'Market moved 1 point toward New York' },
  },
  {
    sport: 'MLB',
    time: 'FINAL',
    away: 'Cubs',
    home: 'Brewers',
    market: 'MIL -1.5 · -115',
    open: 'Open +105',
    move: 'Positive · toward Milwaukee',
    clv: '+3.2%',
    tone: 'lime',
    note: 'Closed on the model side. Final CLV confirmed.',
    analytics: { projected: 'Milwaukee · 58%', score: 'MIL 5 — CHC 3', total: '8 runs', marketRead: 'Closing line finished 20¢ toward Milwaukee' },
  },
  {
    sport: 'SOCCER',
    time: '2:00 PM',
    away: 'II',
    home: 'Amsterdam',
    market: 'Current unavailable',
    open: 'Open +0.5 · -115',
    move: 'Unavailable · no current snapshot',
    clv: '—',
    tone: 'muted',
    note: 'Market history has not arrived yet.',
    analytics: { projected: 'Unavailable', score: 'Unavailable', total: 'Unavailable', marketRead: 'No current market snapshot' },
  },
];

const tabs = [
  [CalendarDays, 'Games'],
  [Activity, 'Sharp'],
  [MessageCircle, 'Chat'],
  [UserRound, 'Profile'],
] as const;

export function SharpBoard() {
  const [activeSport, setActiveSport] = useState<Sport>('ALL');
  const [activeTab, setActiveTab] = useState('Analytics');
  const [openGame, setOpenGame] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const visibleMarkets = markets.filter((game) => activeSport === 'ALL' || game.sport === activeSport);

  return (
    <main className="tbm-phone relative min-h-[100dvh] overflow-hidden bg-black text-white">
      <div className="tbm-tab-safe px-4 pb-[108px] pt-12">
        <header className="flex items-start justify-between">
          <div>
            <h1 className="text-[30px] font-bold tracking-[-1.5px]">TBM</h1>
            <p className="mt-1 text-[10px] font-bold tracking-[1.8px] text-zinc-500">TBM ANALYTICS · TUE, SEP 15</p>
          </div>
          <button type="button" aria-label="Refresh market movement" className="rounded-full border border-zinc-800 p-2 text-zinc-500">
            <RefreshCw size={15} />
          </button>
        </header>

        <section className="mt-8 border-b border-zinc-900 pb-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-lime-400">TBM Analytics</p>
              <h2 className="mt-1 text-[22px] font-semibold tracking-[-0.7px]">Where the market is going</h2>
            </div>
            <button type="button" aria-label="About market movement and CLV" onClick={() => setShowInfo((value) => !value)} className="rounded-full border border-zinc-800 p-2 text-zinc-500">
              <CircleHelp size={15} />
            </button>
          </div>
          <p className="mt-3 max-w-[330px] text-[12px] leading-5 text-zinc-500">
            Sharp Movement shows where the market is moving. CLV shows whether that movement improved the model’s price.
          </p>
        </section>
        {showInfo && (
          <section className="mt-3 rounded border border-lime-900/70 bg-lime-950/20 p-3 text-[11px] leading-4 text-zinc-400">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p><span className="font-semibold text-lime-400">Positive movement</span> means the market moved toward the team TBM projects. It supports the read, but it is not a guaranteed pick.</p>
                <p className="mt-2"><span className="font-semibold text-lime-400">Positive CLV</span> means TBM captured a better price than the closing market. Open games show projected CLV; final games show confirmed CLV.</p>
              </div>
              <button type="button" aria-label="Close analytics explanation" onClick={() => setShowInfo(false)} className="text-zinc-600"><X size={14} /></button>
            </div>
          </section>
        )}

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filter movement by sport">
          {(['ALL', 'MLB', 'SOCCER', 'NFL'] as Sport[]).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
               aria-selected={item === activeSport}
               onClick={() => setActiveSport(item)}
               className={`shrink-0 rounded px-3 py-2 text-[10px] font-bold tracking-[1px] ${item === activeSport ? 'bg-lime-400 text-black' : 'border border-zinc-800 text-zinc-500'}`}
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
           {visibleMarkets.map((game) => {
             const isOpen = openGame === game.away;
             return (
             <button key={game.away} type="button" onClick={() => setOpenGame(isOpen ? null : game.away)} aria-expanded={isOpen} className="block w-full rounded border border-zinc-900 bg-zinc-950/70 p-3 text-left transition-colors hover:border-zinc-700">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[1.2px] text-zinc-600">
                    <span>{game.sport}</span><span>·</span><span>{game.time}</span>
                  </div>
                  <p className="mt-2 truncate text-[14px] font-semibold">{game.away} <span className="font-normal text-zinc-600">@</span> {game.home}</p>
                </div>
                 {isOpen ? <ChevronDown size={15} className="mt-1 shrink-0 text-zinc-700" /> : <ChevronRight size={15} className="mt-1 shrink-0 text-zinc-700" />}
              </div>

              <div className="mt-3 border-t border-zinc-900 pt-2">
                <div className="flex items-center justify-between py-1">
                  <p className="text-[9px] font-bold uppercase tracking-[1px] text-zinc-600">Sharp movement</p>
                  <p className={`text-[11px] font-semibold ${game.tone === 'lime' ? 'text-lime-400' : game.tone === 'amber' ? 'text-amber-400' : 'text-zinc-600'}`}>{game.move}</p>
                </div>
                <div className="flex items-center justify-between py-1">
                  <p className="text-[9px] font-bold uppercase tracking-[1px] text-zinc-600">CLV</p>
                  <p className={`text-[11px] font-semibold ${game.tone === 'lime' ? 'text-lime-400' : game.tone === 'amber' ? 'text-amber-400' : 'text-zinc-600'}`}>{game.clv === '—' ? 'Unavailable' : `${game.clv} · ${game.clv.startsWith('-') ? 'negative' : 'positive'}`}</p>
                </div>
              </div>
              <p className="mt-2 text-[10px] leading-4 text-zinc-600">{game.note}</p>
               {isOpen && (
                 <div className="mt-3 border-t border-zinc-900 pt-3">
                   <p className="mb-2 text-[9px] font-bold uppercase tracking-[1px] text-zinc-600">Game analytics</p>
                   <div className="grid grid-cols-3 gap-2 text-[10px]">
                     <div><p className="text-zinc-600">Projected side</p><p className="mt-1 font-semibold text-zinc-300">{game.analytics.projected}</p></div>
                     <div><p className="text-zinc-600">Projected score</p><p className="mt-1 font-semibold text-zinc-300">{game.analytics.score}</p></div>
                     <div><p className="text-zinc-600">Expected total</p><p className="mt-1 font-semibold text-zinc-300">{game.analytics.total}</p></div>
                   </div>
                   <p className="mt-3 text-[10px] text-zinc-500">{game.analytics.marketRead}</p>
                 </div>
               )}
            </button>
           )})}
        </div>
      </div>

      <nav className="absolute inset-x-0 bottom-0 flex h-[78px] items-center justify-around border-t border-zinc-900 bg-black/95 pb-2">
        {tabs.map(([Icon, label]) => {
           const active = label === activeTab;
          return (
             <button key={label} type="button" aria-current={active ? 'page' : undefined} onClick={() => setActiveTab(label)} className={`flex flex-col items-center gap-1 text-[11px] ${active ? 'text-lime-400' : 'text-zinc-500'}`}>
              <Icon size={22} strokeWidth={active ? 2.4 : 1.8} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
    </main>
  );
}