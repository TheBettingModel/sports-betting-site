import { Activity, ArrowDownRight, ArrowUpRight, CalendarDays, ChevronDown, Clock3, Info, MessageCircle, RefreshCw, UserRound } from 'lucide-react';
import { useState } from 'react';
import './_group.css';

type Sport = 'ALL' | 'MLB' | 'SOCCER' | 'NFL';

const timelineGames = [
  {
    id: 'marlins',
    sport: 'MLB' as Sport,
    league: 'MLB · 09:40 PM ET',
    away: 'Marlins',
    home: 'Diamondbacks',
    status: 'OPEN',
    freshness: 'Updated 3 min ago',
    model: 'ARI -1.5',
    modelPrice: '+108',
    opening: 'ARI -1.5 · +120',
    current: 'ARI -1.5 · +108',
    move: '12¢ toward model',
    moveType: 'positive',
    edge: '+2.8%',
    checkpoints: [
      ['10:18 AM', 'Open', 'ARI -1.5  +120', 'Model: ARI -1.5  +105'],
      ['01:42 PM', 'First move', 'ARI -1.5  +115', 'Model: ARI -1.5  +105'],
      ['04:06 PM', 'Current', 'ARI -1.5  +108', 'Model: ARI -1.5  +105'],
    ],
  },
  {
    id: 'valencia',
    sport: 'SOCCER' as Sport,
    league: 'LA LIGA · 03:30 PM ET',
    away: 'Valencia',
    home: 'Alavés',
    status: 'OPEN',
    freshness: 'Updated 11 min ago',
    model: 'VAL ML',
    modelPrice: '+142',
    opening: 'VAL ML · +128',
    current: 'VAL ML · +142',
    move: '14¢ away from model',
    moveType: 'negative',
    edge: '-1.4%',
    checkpoints: [
      ['08:00 AM', 'Open', 'VAL ML  +128', 'Model: VAL ML  +138'],
      ['11:25 AM', 'Drift', 'VAL ML  +136', 'Model: VAL ML  +138'],
      ['02:19 PM', 'Current', 'VAL ML  +142', 'Model: VAL ML  +138'],
    ],
  },
  {
    id: 'packers',
    sport: 'NFL' as Sport,
    league: 'NFL · SUN 01:00 PM ET',
    away: 'Green Bay',
    home: 'Cleveland',
    status: 'CLOSED',
    freshness: 'Closed 2h ago',
    model: 'GB -2.5',
    modelPrice: '-110',
    opening: 'GB -2.5 · -105',
    current: 'GB -3 · -115',
    move: '10¢ toward model',
    moveType: 'positive',
    edge: '+4.1%',
    checkpoints: [
      ['Yesterday', 'Open', 'GB -2.5  -105', 'Model: GB -2.5  -112'],
      ['09:14 AM', 'Close', 'GB -3  -115', 'Model: GB -2.5  -112'],
      ['03:48 PM', 'Final', 'GB -3  -115', 'Final CLV: +3.0¢'],
    ],
  },
];

export function ClvTimeline() {
  const [sport, setSport] = useState<Sport>('ALL');
  const [expanded, setExpanded] = useState('marlins');
  const [refreshed, setRefreshed] = useState(false);
  const visible = timelineGames.filter((game) => sport === 'ALL' || game.sport === sport);

  return (
    <main className="tbm-phone relative min-h-[100dvh] overflow-hidden bg-black px-4 pt-12 text-white">
      <div className="tbm-tab-safe">
        <header className="flex items-start justify-between">
          <div>
            <h1 className="text-[30px] font-bold tracking-[-1.2px]">TBM</h1>
            <p className="mt-1 text-[10px] font-bold tracking-[2px] text-zinc-500">MARKET INTELLIGENCE · TUE, SEP 15</p>
          </div>
          <button
            type="button"
            aria-label="Refresh market data"
            onClick={() => { setRefreshed(true); window.setTimeout(() => setRefreshed(false), 1200); }}
            className={`mt-1 rounded-full border border-zinc-800 p-2 text-zinc-400 transition-transform ${refreshed ? 'rotate-180 text-lime-400' : ''}`}
          >
            <RefreshCw size={15} />
          </button>
        </header>

        <section className="mt-7 border-b border-zinc-900 pb-5">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[1.7px] text-lime-400">Subscriber view</p>
              <h2 className="mt-2 text-[23px] font-semibold tracking-[-.7px]">How the market got here</h2>
            </div>
            <span className="mb-1 flex items-center gap-1 text-[10px] font-medium text-zinc-500"><Clock3 size={12} /> LIVE BOARD</span>
          </div>
          <p className="mt-3 max-w-[330px] text-[12px] leading-[18px] text-zinc-400">Chronological checkpoints show whether price is moving with the model — or creating a better number against it.</p>
          <div className="mt-5 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Sport filter">
            {(['ALL', 'MLB', 'SOCCER', 'NFL'] as Sport[]).map((item) => (
              <button key={item} type="button" role="tab" aria-selected={sport === item} onClick={() => setSport(item)} className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-bold tracking-[1px] transition-colors ${sport === item ? 'border-lime-400 bg-lime-400 text-black' : 'border-zinc-800 text-zinc-500 hover:border-zinc-600'}`}>
                {item}
              </button>
            ))}
          </div>
        </section>

        <div className="mt-4 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-zinc-500">{visible.length} meaningful moves</p>
          <button type="button" onClick={() => setExpanded('')} className="text-[10px] font-semibold text-zinc-500 hover:text-white">Collapse all</button>
        </div>

        <div className="mt-3 space-y-3">
          {visible.map((game) => {
            const open = expanded === game.id;
            const positive = game.moveType === 'positive';
            return (
              <article key={game.id} className="overflow-hidden rounded-[10px] border border-zinc-800 bg-[#0b0b0b]">
                <button type="button" onClick={() => setExpanded(open ? '' : game.id)} aria-expanded={open} className="w-full px-3.5 pb-3.5 pt-3 text-left">
                  <div className="flex items-center justify-between text-[10px] font-bold tracking-[1.2px] text-zinc-500">
                    <span>{game.sport} <span className="font-medium text-zinc-700">/</span> {game.league.split(' · ')[1]}</span>
                    <span className={game.status === 'CLOSED' ? 'text-zinc-500' : 'text-lime-400'}>{game.status}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div>
                      <div className="text-[15px] font-semibold">{game.away} <span className="text-zinc-600">@</span> {game.home}</div>
                      <p className="mt-1 text-[10px] text-zinc-500">{game.freshness}</p>
                    </div>
                    <ChevronDown size={17} className={`text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-zinc-900 pt-3">
                    <div><p className="text-[9px] uppercase tracking-[1px] text-zinc-600">Open</p><p className="mt-1 text-[11px] font-medium text-zinc-300">{game.opening.split(' · ')[1]}</p></div>
                    <div><p className="text-[9px] uppercase tracking-[1px] text-zinc-600">Current</p><p className="mt-1 text-[11px] font-medium text-white">{game.current.split(' · ')[1]}</p></div>
                    <div><p className="text-[9px] uppercase tracking-[1px] text-zinc-600">Model</p><p className="mt-1 text-[11px] font-medium text-lime-400">{game.modelPrice}</p></div>
                  </div>
                  <div className={`mt-3 flex items-center gap-1.5 text-[11px] font-semibold ${positive ? 'text-lime-400' : 'text-amber-300'}`}>
                    {positive ? <ArrowDownRight size={15} /> : <ArrowUpRight size={15} />} {game.move}
                    <span className="ml-auto font-mono text-[10px] text-zinc-500">{game.edge} model edge</span>
                  </div>
                </button>
                {open && (
                  <div className="border-t border-zinc-800 px-3.5 pb-4 pt-3">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-[1.5px] text-zinc-500">Price timeline</p>
                      <p className="text-[10px] font-medium text-zinc-600">Model: {game.model}</p>
                    </div>
                    <div className="relative ml-1 space-y-3 border-l border-zinc-700 pl-4">
                      {game.checkpoints.map(([time, label, price, note], index) => (
                        <div key={time} className="relative">
                          <span className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-[#0b0b0b] ${index === game.checkpoints.length - 1 ? 'bg-lime-400' : 'bg-zinc-600'}`} />
                          <div className="flex justify-between text-[10px]"><span className="font-semibold text-zinc-300">{label}</span><span className="text-zinc-600">{time}</span></div>
                          <p className="mt-1 font-mono text-[11px] text-white">{price}</p>
                          <p className="mt-0.5 text-[10px] text-zinc-500">{note}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex gap-2 rounded-md bg-[#141414] px-3 py-2.5 text-[10px] leading-[15px] text-zinc-400">
                      <Info size={14} className="mt-0.5 shrink-0 text-zinc-500" />
                      {game.status === 'CLOSED' ? 'Final CLV is measured against the closing price.' : 'Projected CLV only — this game has not closed. Closing price may change.'}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
        <p className="mt-4 flex items-center gap-1.5 px-1 text-[10px] leading-4 text-zinc-600"><Info size={12} /> Market history is supplied by the listed book. Missing checkpoints are not inferred.</p>
      </div>
      <nav className="absolute inset-x-0 bottom-0 flex h-[78px] items-center justify-around border-t border-zinc-900 bg-black/95 pb-2">
        {[[CalendarDays, 'Games'], [Activity, 'Sharp'], [MessageCircle, 'Chat'], [UserRound, 'Profile']].map(([Icon, label]) => {
          const TabIcon = Icon as typeof CalendarDays;
          const active = label === 'Sharp';
          return <button type="button" key={label as string} onClick={() => {}} className={`flex flex-col items-center gap-1 text-[11px] ${active ? 'text-lime-400' : 'text-zinc-500'}`}><TabIcon size={22} /><span>{label as string}</span></button>;
        })}
      </nav>
    </main>
  );
}