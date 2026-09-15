import { useState } from 'react';
import { Activity, CalendarDays, ChevronDown, ChevronRight, CircleHelp, MessageCircle, RefreshCw, UserRound, X } from 'lucide-react';
import './_group.css';

type Sport = 'ALL' | 'MLB' | 'SOCCER' | 'NFL';
type Game = typeof markets[number];

const markets = [
  { sport: 'MLB', time: '9:40 PM', away: 'Marlins', home: 'Diamondbacks', market: 'ARI -1.5 · -105', open: 'Open +122', move: 'toward Arizona', clv: '+4.1%', tone: 'lime', note: 'Sharp money is following the model.', analytics: { projected: 'Arizona · 61%', score: 'ARI 5.1 — MIA 3.8', total: '8.9 runs', marketRead: 'Market moved 17¢ toward Arizona' } },
  { sport: 'SOCCER', time: '3:30 PM', away: 'Real Madrid', home: 'Elche', market: 'RMA -1.5 · -135', open: 'Open -110', move: 'past the model', clv: '-2.7%', tone: 'amber', note: 'The market moved first. Value is thinning.', analytics: { projected: 'Real Madrid · 64%', score: 'RMA 2.1 — ELC 0.7', total: '2.8 goals', marketRead: 'Market moved 25¢ past the model' } },
  { sport: 'NFL', time: '8:15 PM', away: 'Atlanta', home: 'New York', market: 'NYJ -1.5 · -115', open: 'Open -2.5', move: 'toward New York', clv: '+0.8%', tone: 'lime', note: 'A steady move toward the model side.', analytics: { projected: 'New York · 54%', score: 'ATL 20 — NYJ 24', total: '44 points', marketRead: 'Market moved 1 point toward New York' } },
  { sport: 'MLB', time: 'FINAL', away: 'Cubs', home: 'Brewers', market: 'MIL -1.5 · -115', open: 'Open +105', move: 'toward Milwaukee', clv: '+3.2%', tone: 'lime', note: 'Closed on the model side. Final CLV confirmed.', analytics: { projected: 'Milwaukee · 58%', score: 'MIL 5 — CHC 3', total: '8 runs', marketRead: 'Closing line finished 20¢ toward Milwaukee' } },
  { sport: 'SOCCER', time: '2:00 PM', away: 'II', home: 'Amsterdam', market: 'Current unavailable', open: 'Open +0.5 · -115', move: 'no current snapshot', clv: '—', tone: 'muted', note: 'Market history has not arrived yet.', analytics: { projected: 'Unavailable', score: 'Unavailable', total: 'Unavailable', marketRead: 'No current market snapshot' } },
] as const;

const tabs = [[CalendarDays, 'Games'], [Activity, 'Sharp'], [MessageCircle, 'Chat'], [UserRound, 'Profile']] as const;
const initials = (name: string) => name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();

function TeamRow({ game }: { game: Game }) {
  return <div className="mt-3 grid grid-cols-[1fr_22px_1fr] items-center gap-2">
    <div className="flex min-w-0 items-center gap-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[#202523] text-[10px] font-bold text-zinc-300">{initials(game.away)}</span>
      <span className="truncate text-[14px] font-bold">{game.away}</span>
    </div>
    <span className="text-center text-[10px] font-bold text-zinc-700">@</span>
    <div className="flex min-w-0 items-center justify-end gap-2">
      <span className="truncate text-right text-[14px] font-bold">{game.home}</span>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[#202523] text-[10px] font-bold text-zinc-300">{initials(game.home)}</span>
    </div>
  </div>;
}

export function SharpBoard() {
  const [activeSport, setActiveSport] = useState<Sport>('ALL');
  const [activeTab, setActiveTab] = useState('Sharp');
  const [openGame, setOpenGame] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const visibleMarkets = markets.filter((game) => activeSport === 'ALL' || game.sport === activeSport);
  const tracked = visibleMarkets.length;
  const withModel = visibleMarkets.filter((g) => g.tone !== 'muted').length;
  const positive = visibleMarkets.filter((g) => g.tone === 'lime').length;

  return <main className="tbm-phone relative min-h-[100dvh] overflow-hidden text-white">
    <div className="tbm-tab-safe px-4 pb-[104px] pt-8">
      <header className="flex items-center justify-between">
        <div><p className="text-[17px] font-extrabold tracking-[-.7px]">TBM <span className="text-zinc-600">/</span> ANALYTICS</p><p className="tbm-mono mt-1 text-[9px] uppercase tracking-[1.2px] text-zinc-600">TUE, SEP 15 · MARKET DESK</p></div>
        <button type="button" aria-label="Refresh market movement" onClick={() => setOpenGame(null)} className="rounded border border-[#242827] p-2 text-zinc-500 transition-colors hover:text-lime-400"><RefreshCw size={14} /></button>
      </header>
      <section className="mt-5 border-b pb-4 tbm-hairline">
        <div className="flex items-start justify-between"><div><p className="tbm-mono text-[10px] font-medium tracking-[1.5px] text-lime-400">MARKET INTELLIGENCE</p><h1 className="mt-1 text-[21px] font-bold tracking-[-.8px]">Sharp Movement &amp; CLV</h1></div><button type="button" aria-label="About market movement and CLV" onClick={() => setShowInfo((value) => !value)} className="rounded border border-[#242827] p-1.5 text-zinc-500"><CircleHelp size={14} /></button></div>
        <p className="mt-2 text-[11px] leading-4 text-zinc-500">Track how the betting market is moving relative to TBM&apos;s model price.</p>
      </section>
      {showInfo && <section className="mt-3 rounded border border-lime-900/60 bg-[#121a15] p-3 text-[10px] leading-4 text-zinc-400"><div className="flex justify-between gap-3"><p><span className="font-bold text-lime-400">Positive movement</span> means the market moved toward the team TBM projects. <span className="font-bold text-lime-400">Positive CLV</span> means TBM captured a better price than the closing market.</p><button type="button" aria-label="Close explanation" onClick={() => setShowInfo(false)}><X size={14} /></button></div></section>}
      <section className="mt-4 rounded border tbm-hairline bg-[#0e1010] px-3 py-2.5">
        <p className="tbm-mono text-[9px] font-medium tracking-[1.4px] text-zinc-600">MARKET PULSE</p>
        <div className="mt-2 grid grid-cols-3 divide-x divide-[#242827]"><div><p className="tbm-mono text-[15px] font-medium">{tracked}</p><p className="mt-0.5 text-[8px] font-bold tracking-[.8px] text-zinc-600">TRACKED</p></div><div className="pl-3"><p className="tbm-mono text-[15px] font-medium">{withModel}</p><p className="mt-0.5 text-[8px] font-bold tracking-[.8px] text-zinc-600">WITH MODEL</p></div><div className="pl-3"><p className="tbm-mono text-[15px] font-medium text-lime-400">{positive}</p><p className="mt-0.5 text-[8px] font-bold tracking-[.8px] text-zinc-600">POSITIVE CLV</p></div></div>
      </section>
      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5" role="tablist" aria-label="Filter movement by sport">{(['ALL', 'MLB', 'SOCCER', 'NFL'] as Sport[]).map((item) => <button key={item} type="button" role="tab" aria-selected={item === activeSport} onClick={() => setActiveSport(item)} className={`shrink-0 rounded px-2.5 py-1.5 text-[9px] font-bold tracking-[.8px] ${item === activeSport ? 'bg-lime-400 text-black' : 'border border-[#242827] text-zinc-500'}`}>{item === 'ALL' ? 'ALL MOVES' : item}</button>)}</div>
      <div className="mt-4 flex items-center justify-between"><p className="tbm-mono text-[9px] font-medium tracking-[1.2px] text-zinc-500">TODAY&apos;S MOVEMENT</p><p className="text-[9px] text-zinc-700">Updated 2m ago</p></div>
      <div className="mt-2 space-y-2">{visibleMarkets.map((game) => {
        const isOpen = openGame === game.away;
        const unavailable = game.tone === 'muted';
        const accent = game.tone === 'lime' ? 'text-lime-400' : game.tone === 'amber' ? 'text-amber-400' : 'text-zinc-600';
        return <button key={game.away} type="button" onClick={() => setOpenGame(isOpen ? null : game.away)} aria-expanded={isOpen} className="tbm-card block w-full rounded p-3 text-left">
          <div className="flex items-center justify-between"><div className="flex items-center gap-2"><span className="tbm-mono text-[9px] text-zinc-600">{game.sport}</span><span className="h-1 w-1 rounded-full bg-zinc-700" /><span className="tbm-mono text-[9px] text-zinc-600">{game.time}</span></div><span className={`rounded px-1.5 py-1 text-[8px] font-bold tracking-[.6px] ${unavailable ? 'bg-zinc-800 text-zinc-500' : game.tone === 'lime' ? 'bg-lime-400/10 text-lime-400' : 'bg-amber-400/10 text-amber-400'}`}>{unavailable ? 'UNAVAILABLE' : game.clv.startsWith('-') ? 'NEGATIVE' : 'POSITIVE'}</span></div>
          <TeamRow game={game} />
          <div className="mt-3 border-t pt-2.5 tbm-hairline">
            <div className="flex items-center justify-between"><span className="tbm-mono text-[8px] font-medium tracking-[1px] text-zinc-600">MARKET DIRECTION</span><span className={`text-[10px] font-bold uppercase ${accent}`}>{unavailable ? 'NO SNAPSHOT' : game.move}</span></div>
            {!unavailable && <div className="tbm-gridline relative mt-2 h-3"><div className="absolute inset-x-0 top-[5px] border-t border-zinc-700" /><div className={`absolute top-[1px] h-2.5 w-2.5 rounded-full border-2 border-[#111313] ${game.tone === 'lime' ? 'bg-lime-400' : 'bg-amber-400'} ${game.clv.startsWith('-') ? 'left-[28%]' : 'right-[18%]'}`} /><span className={`absolute -top-1 text-[13px] ${game.clv.startsWith('-') ? 'left-[31%]' : 'right-[5%]'} ${accent}`}>→</span></div>}
            <div className="mt-2 flex items-end justify-between"><div><p className="tbm-mono text-[8px] tracking-[1px] text-zinc-600">CLV</p><p className={`tbm-mono mt-0.5 text-[22px] font-medium leading-none ${accent}`}>{game.clv}</p></div><div className="text-right"><p className="tbm-mono text-[8px] tracking-[1px] text-zinc-600">MARKET</p><p className="mt-1 text-[10px] font-semibold text-zinc-300">{game.market}</p></div></div>
          </div>
          <p className="mt-2 text-[10px] leading-4 text-zinc-500">{game.note}</p>
          {isOpen && <div className="mt-3 border-t pt-3 tbm-hairline"><p className="tbm-mono mb-2 text-[8px] tracking-[1px] text-zinc-600">GAME ANALYTICS</p><div className="grid grid-cols-3 gap-2 text-[9px]"><div><p className="text-zinc-600">Projected side</p><p className="mt-1 font-semibold text-zinc-300">{game.analytics.projected}</p></div><div><p className="text-zinc-600">Projected score</p><p className="mt-1 font-semibold text-zinc-300">{game.analytics.score}</p></div><div><p className="text-zinc-600">Expected total</p><p className="mt-1 font-semibold text-zinc-300">{game.analytics.total}</p></div></div><p className="mt-3 text-[9px] text-zinc-500">{game.analytics.marketRead}</p></div>}
          <div className="mt-2 flex items-center justify-end gap-1 text-[8px] font-bold tracking-[.8px] text-zinc-600">{isOpen ? 'HIDE DETAILS' : 'VIEW DETAILS'} {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</div>
        </button>;
      })}</div>
    </div>
    <nav className="absolute inset-x-0 bottom-0 flex h-[76px] items-center justify-around border-t border-[#202322] bg-[#090a0a] pb-2">{tabs.map(([Icon, label]) => { const active = label === activeTab; return <button key={label} type="button" aria-current={active ? 'page' : undefined} onClick={() => setActiveTab(label)} className={`flex flex-col items-center gap-1 text-[10px] ${active ? 'text-lime-400' : 'text-zinc-600'}`}><Icon size={19} strokeWidth={active ? 2.4 : 1.8} /><span>{label}</span></button>; })}</nav>
  </main>;
}