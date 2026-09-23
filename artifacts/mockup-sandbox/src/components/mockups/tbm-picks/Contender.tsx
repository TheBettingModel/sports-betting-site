export function Contender() {
  return (
    <div className="w-[390px] h-[844px] bg-[#080E1A] overflow-y-auto font-['Inter']">
      {/* Header */}
      <div className="px-5 pt-14 pb-5 border-b border-[#1A2540]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-baseline gap-2">
            <h1 className="text-3xl font-black text-white tracking-tight">TBM</h1>
            <span className="text-[10px] font-black text-[#F97316] tracking-[0.1em]">PICKS ENGINE</span>
          </div>
          <div className="text-right">
            <div className="text-xs font-bold text-neutral-400">TODAY</div>
            <div className="text-sm font-black text-white">MAR 15</div>
          </div>
        </div>
        <div className="inline-block bg-[#F97316] text-black text-xs font-black px-3 py-1.5 rounded">
          8 GAMES TODAY
        </div>
      </div>

      {/* Sport Filter Pills */}
      <div className="px-5 py-4 flex gap-2 overflow-x-auto no-scrollbar border-b border-[#1A2540]">
        <button className="px-4 py-2 rounded-full bg-[#F97316] text-black text-xs font-black whitespace-nowrap">
          ALL
        </button>
        <button className="px-4 py-2 rounded-full bg-[#0F1929] text-neutral-400 text-xs font-bold border border-[#1A2540] whitespace-nowrap">
          MLB
        </button>
        <button className="px-4 py-2 rounded-full bg-[#0F1929] text-neutral-400 text-xs font-bold border border-[#1A2540] whitespace-nowrap">
          NFL
        </button>
        <button className="px-4 py-2 rounded-full bg-[#0F1929] text-neutral-400 text-xs font-bold border border-[#1A2540] whitespace-nowrap">
          NBA
        </button>
      </div>

      {/* Section Header */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-[11px] font-black tracking-[0.15em] text-neutral-400">
            TODAY'S MATCHUPS
          </h2>
          <div className="flex-1 h-[2px] bg-gradient-to-r from-[#F97316] to-transparent"></div>
        </div>
      </div>

      {/* Featured Pick Card */}
      <div className="px-5 pb-4">
        <div className="bg-[#0F1929] border border-[#1A2540] rounded-xl overflow-hidden">
          {/* Orange gradient header */}
          <div className="bg-gradient-to-r from-[#F97316] to-[#EA580C] px-4 py-2 flex items-center justify-between">
            <span className="text-black text-xs font-black tracking-wide">MLB</span>
            <span className="text-black text-[10px] font-black tracking-wider">⭐ TOP PICK</span>
          </div>

          <div className="p-5">
            {/* Matchup */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl font-black text-white">LAD</span>
                <span className="text-neutral-500 font-bold text-sm">vs</span>
                <span className="text-2xl font-black text-neutral-300">NYY</span>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold text-neutral-400">FIRST PITCH</div>
                <div className="text-sm font-black text-white">7:05 PM</div>
              </div>
            </div>

            {/* Model Score - HUGE */}
            <div className="mb-5 pb-5 border-b border-[#1A2540]">
              <div className="text-[11px] font-black tracking-wider text-neutral-400 mb-2">MODEL SCORE</div>
              <div className="flex items-baseline gap-1">
                <span className="text-6xl font-black text-white leading-none">84</span>
                <span className="text-2xl font-black text-[#F97316]">/100</span>
              </div>
              <div className="mt-3">
                <span className="inline-block bg-[#F97316] text-black text-[10px] font-black px-3 py-1 rounded">
                  STRONG BUY
                </span>
              </div>
            </div>

            {/* Win Probability */}
            <div className="mb-4">
              <div className="text-[11px] font-black tracking-wider text-neutral-400 mb-2">WIN PROBABILITY</div>
              <div className="text-3xl font-black text-white mb-1">67% <span className="text-xl text-neutral-400">HOME WIN</span></div>
              <div className="text-sm font-bold text-[#F97316]">EDGE: LAD +8.3%</div>
            </div>

            {/* Vegas Line */}
            <div className="pt-4 border-t border-[#1A2540] flex items-center justify-between">
              <div>
                <div className="text-[10px] font-black tracking-wider text-neutral-500 mb-1">VEGAS</div>
                <div className="text-sm font-black text-white">LAD -145</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-black tracking-wider text-neutral-500 mb-1">OVER/UNDER</div>
                <div className="text-sm font-black text-white">8.5</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Regular Game Card 1 */}
      <div className="px-5 pb-4">
        <div className="bg-[#0F1929] border border-[#1A2540] border-l-4 border-l-[#F97316] rounded-xl p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl font-black text-white">BOS</span>
                <span className="text-neutral-500 font-bold text-xs">vs</span>
                <span className="text-2xl font-black text-neutral-300">HOU</span>
              </div>
              <div className="text-[10px] font-bold text-neutral-400 tracking-wide">MLB · 6:10 PM</div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-black text-white leading-none">71</div>
              <div className="text-[9px] font-black text-neutral-500">/100</div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-[#1A2540]">
            <span className="inline-block bg-[#F97316] text-black text-[9px] font-black px-2.5 py-1 rounded">
              BUY
            </span>
            <span className="text-xs font-bold text-[#F97316]">HOU +4.1%</span>
          </div>
        </div>
      </div>

      {/* Regular Game Card 2 */}
      <div className="px-5 pb-4">
        <div className="bg-[#0F1929] border border-[#1A2540] border-l-4 border-l-neutral-600 rounded-xl p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl font-black text-white">KC</span>
                <span className="text-neutral-500 font-bold text-xs">vs</span>
                <span className="text-2xl font-black text-neutral-300">CLE</span>
              </div>
              <div className="text-[10px] font-bold text-neutral-400 tracking-wide">MLB · 6:40 PM</div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-black text-white leading-none">58</div>
              <div className="text-[9px] font-black text-neutral-500">/100</div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-[#1A2540]">
            <span className="inline-block bg-neutral-700 text-neutral-300 text-[9px] font-black px-2.5 py-1 rounded">
              NEUTRAL
            </span>
            <span className="text-xs font-bold text-neutral-500">NO EDGE</span>
          </div>
        </div>
      </div>

      {/* Locked Card */}
      <div className="px-5 pb-24">
        <div className="relative bg-[#0F1929] rounded-xl overflow-hidden" style={{
          background: 'linear-gradient(#0F1929, #0F1929) padding-box, linear-gradient(135deg, #F97316, #EA580C) border-box',
          border: '2px solid transparent'
        }}>
          <div className="p-4 filter blur-[3px] pointer-events-none select-none">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl font-black text-white">PHI</span>
              <span className="text-neutral-500 font-bold text-xs">vs</span>
              <span className="text-2xl font-black text-neutral-300">ATL</span>
            </div>
            <div className="text-[10px] font-bold text-neutral-400">MLB · 7:20 PM</div>
          </div>

          {/* Overlay CTA */}
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#080E1A]/80 backdrop-blur-sm">
            <div className="text-center mb-4">
              <div className="text-4xl mb-2">🔒</div>
              <div className="text-sm font-black text-white mb-1">PREMIUM PICK</div>
              <div className="text-xs font-bold text-neutral-400">Unlock all model picks</div>
            </div>
            <button className="bg-[#F97316] text-black text-sm font-black px-6 py-3 rounded-lg">
              GO PRO
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 w-[390px] bg-[#0F1929] border-t border-[#1A2540] px-5 py-3 flex items-center justify-around">
        <button className="flex flex-col items-center gap-1.5">
          <div className="text-xl">🎯</div>
          <span className="text-[10px] font-black text-[#F97316]">PICKS</span>
          <div className="w-6 h-0.5 bg-[#F97316] rounded-full"></div>
        </button>
        <button className="flex flex-col items-center gap-1.5">
          <div className="text-xl opacity-50">📊</div>
          <span className="text-[10px] font-bold text-neutral-500">MODELS</span>
        </button>
        <button className="flex flex-col items-center gap-1.5">
          <div className="text-xl opacity-50">👤</div>
          <span className="text-[10px] font-bold text-neutral-500">PROFILE</span>
        </button>
      </div>
    </div>
  );
}
