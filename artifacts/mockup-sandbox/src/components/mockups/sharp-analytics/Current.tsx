import { Activity, CalendarDays, MessageCircle, UserRound } from 'lucide-react';
import './_group.css';

const games = [
  ['Marlins', 'Diamondbacks', '9:40 PM'],
  ['Espanyol', 'Vallecano', '0 · 2  LIVE'],
  ['II', 'Amsterdam', '0 · 0  LIVE'],
  ['Valencia', 'Alavés', '0 · 0  LIVE'],
];

export function Current() {
  return (
    <main className="tbm-phone relative overflow-hidden px-4 pt-14">
      <div className="tbm-tab-safe">
        <h1 className="text-[30px] font-bold tracking-[-1px]">TBM</h1>
        <p className="mt-1 text-[10px] font-bold tracking-[2px] text-zinc-500">LIVE SCORES · TUE, SEP 15</p>
        <div className="mt-7 space-y-7">
          {games.map(([away, home, state], index) => (
            <section key={away} className={index === 1 ? 'border-t border-zinc-900 pt-6' : ''}>
              <div className="mb-3 flex items-center justify-between">
                <span className="font-semibold">{away}</span>
                <span className={state.includes('LIVE') ? 'text-xs font-semibold text-lime-400' : 'text-xs text-zinc-500'}>{state}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold">{home}</span>
                <span className="rounded bg-lime-950/70 px-2 py-1 text-[10px] font-semibold uppercase text-lime-400">{home} projected</span>
              </div>
            </section>
          ))}
        </div>
      </div>
      <nav className="absolute inset-x-0 bottom-0 flex h-[78px] items-center justify-around border-t border-zinc-900 bg-black/95 pb-2">
        {[
          [CalendarDays, 'Games'],
          [Activity, 'Live'],
          [MessageCircle, 'Chat'],
          [UserRound, 'Profile'],
        ].map(([Icon, label]) => {
          const TabIcon = Icon as typeof CalendarDays;
          const active = label === 'Live';
          return <div key={label as string} className={`flex flex-col items-center gap-1 text-[11px] ${active ? 'text-lime-400' : 'text-zinc-500'}`}><TabIcon size={23}/><span>{label as string}</span></div>;
        })}
      </nav>
    </main>
  );
}