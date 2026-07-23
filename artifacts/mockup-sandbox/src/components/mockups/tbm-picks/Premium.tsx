export function Premium() {
  return (
    <div className="w-[390px] h-[844px] bg-[#0A0A12] font-['Inter'] text-white overflow-y-auto">
      {/* Radial glow background */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_#1A1400_0%,_transparent_60%)] pointer-events-none" />
      
      {/* Content wrapper */}
      <div className="relative z-10 pb-20">
        {/* Header */}
        <header className="px-5 pt-6 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#D97706] to-[#92400E] flex items-center justify-center">
              <span className="text-[10px] font-black tracking-tighter text-white">TBM</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#D97706] animate-pulse" />
              <span className="text-[10px] text-white/50 font-medium tracking-wide">LIVE</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-white/40 font-medium tracking-wide">TUESDAY</div>
            <div className="text-xs text-white/90 font-semibold">MAR 19</div>
          </div>
        </header>

        {/* Games count */}
        <div className="px-5 mb-4">
          <div className="text-2xl font-bold text-white">Today's Picks</div>
          <div className="text-sm text-white/50 mt-0.5">8 games analyzed</div>
        </div>

        {/* Sport filter pills */}
        <div className="px-5 mb-6 flex gap-2">
          <button className="px-4 py-1.5 rounded-full bg-[#D97706]/20 border border-[#D97706]/40 text-[#D97706] text-xs font-bold tracking-wider">
            ALL
          </button>
          <button className="px-4 py-1.5 rounded-full border border-white/10 text-white/40 text-xs font-bold tracking-wider">
            MLB
          </button>
          <button className="px-4 py-1.5 rounded-full border border-white/10 text-white/40 text-xs font-bold tracking-wider">
            NFL
          </button>
          <button className="px-4 py-1.5 rounded-full border border-white/10 text-white/40 text-xs font-bold tracking-wider">
            NBA
          </button>
        </div>

        {/* Section header */}
        <div className="px-5 mb-4 flex items-center gap-3">
          <div className="w-0.5 h-3 bg-[#D97706]" />
          <div className="text-[10px] text-white/60 font-bold tracking-[0.15em] uppercase">Intelligence Report</div>
        </div>

        {/* Featured Pick Card */}
        <div className="px-5 mb-4">
          <div className="rounded-2xl bg-gradient-to-b from-[#1C1500] to-[#0F0E14] border border-[#D97706]/30 overflow-hidden backdrop-blur-sm">
            {/* Gold header bar */}
            <div className="bg-[#D97706]/10 border-b border-[#D97706]/20 px-4 py-2">
              <div className="text-[9px] text-[#D97706] font-black tracking-[0.12em] uppercase">Featured Pick</div>
            </div>

            <div className="p-5">
              {/* Matchup header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-lg font-bold text-white mb-0.5">LAD vs NYY</div>
                  <div className="flex items-center gap-2 text-[11px] text-white/50">
                    <span>MLB</span>
                    <span className="w-1 h-1 rounded-full bg-white/30" />
                    <span>7:05 PM</span>
                  </div>
                </div>
              </div>

              {/* Model Score - centered and prominent */}
              <div className="flex flex-col items-center py-6 border-y border-white/5">
                <div className="text-[10px] text-white/40 font-semibold tracking-wider mb-2">MODEL SCORE</div>
                <div className="text-6xl font-black text-[#D97706] mb-1" style={{ lineHeight: '1' }}>84</div>
                <div className="text-xs text-white/30 mb-4">/100</div>
                
                {/* Progress arc visualization */}
                <div className="w-32 h-2 bg-white/5 rounded-full overflow-hidden mb-3">
                  <div className="h-full bg-gradient-to-r from-[#D97706] to-[#FCD34D]" style={{ width: '84%' }} />
                </div>

                {/* Strong buy badge */}
                <div className="border border-[#D97706]/60 text-[#D97706] bg-[#D97706]/10 text-[9px] tracking-[0.1em] font-black px-3 py-1 rounded-full">
                  STRONG BUY
                </div>
              </div>

              {/* Win probability bar */}
              <div className="mt-5 mb-4">
                <div className="flex items-center justify-between mb-2 text-[10px]">
                  <span className="text-white/40 font-medium tracking-wide">HOME WIN PROBABILITY</span>
                  <span className="text-[#D97706] font-bold">67%</span>
                </div>
                <div className="h-1.5 bg-[#1A1A1A] rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#D97706] to-[#FCD34D]" style={{ width: '67%' }} />
                </div>
              </div>

              {/* Edge stat */}
              <div className="flex items-center justify-between py-3 border-y border-white/5 mb-4">
                <span className="text-xs text-white/50 tracking-wide">EDGE</span>
                <span className="text-sm font-bold text-[#D97706]">LAD +8.3%</span>
              </div>

              {/* Vegas line */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-white/40 mb-1 tracking-wide">VEGAS LINE</div>
                  <div className="text-sm text-white/90 font-semibold">LAD -145</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-white/40 mb-1 tracking-wide">TOTAL</div>
                  <div className="text-sm text-white/90 font-semibold">O/U 8.5</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section header - More Picks */}
        <div className="px-5 mb-3 mt-6 flex items-center gap-3">
          <div className="w-0.5 h-3 bg-white/20" />
          <div className="text-[10px] text-white/60 font-bold tracking-[0.15em] uppercase">More Picks</div>
        </div>

        {/* Regular game card 1 */}
        <div className="px-5 mb-3">
          <div className="rounded-2xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] backdrop-blur-sm p-4">
            {/* Matchup + time */}
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-base font-bold text-white mb-0.5">BOS vs HOU</div>
                <div className="flex items-center gap-2 text-[10px] text-white/40">
                  <span>MLB</span>
                  <span className="w-1 h-1 rounded-full bg-white/20" />
                  <span>6:10 PM</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-white/40 mb-0.5">MODEL</div>
                <div className="text-2xl font-black text-white">71</div>
              </div>
            </div>

            {/* Stats row */}
            <div className="flex items-center justify-between pt-3 border-t border-white/5">
              <div className="border border-[#D97706]/40 text-[#D97706] bg-[#D97706]/5 text-[9px] tracking-[0.1em] font-bold px-2.5 py-1 rounded-full">
                BUY
              </div>
              <div className="text-xs font-semibold text-[#D97706]">HOU +4.1%</div>
            </div>
          </div>
        </div>

        {/* Regular game card 2 */}
        <div className="px-5 mb-3">
          <div className="rounded-2xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] backdrop-blur-sm p-4">
            {/* Matchup + time */}
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-base font-bold text-white mb-0.5">KC vs CLE</div>
                <div className="flex items-center gap-2 text-[10px] text-white/40">
                  <span>MLB</span>
                  <span className="w-1 h-1 rounded-full bg-white/20" />
                  <span>6:40 PM</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-white/40 mb-0.5">MODEL</div>
                <div className="text-2xl font-black text-white">58</div>
              </div>
            </div>

            {/* Stats row */}
            <div className="flex items-center justify-between pt-3 border-t border-white/5">
              <div className="border border-white/20 text-white/50 bg-white/5 text-[9px] tracking-[0.1em] font-bold px-2.5 py-1 rounded-full">
                NEUTRAL
              </div>
              <div className="text-xs text-white/40">—</div>
            </div>
          </div>
        </div>

        {/* Locked card with glow animation */}
        <div className="px-5 mb-3">
          <div 
            className="rounded-2xl bg-[rgba(255,255,255,0.02)] border-2 border-[#D97706]/40 backdrop-blur-sm p-4 relative overflow-hidden"
            style={{
              boxShadow: '0 0 30px rgba(217, 119, 6, 0.3)',
              animation: 'pulse 3s ease-in-out infinite'
            }}
          >
            {/* Blurred content */}
            <div className="filter blur-sm select-none pointer-events-none opacity-40">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-base font-bold text-white mb-0.5">PHI vs MIA</div>
                  <div className="flex items-center gap-2 text-[10px] text-white/40">
                    <span>MLB</span>
                    <span className="w-1 h-1 rounded-full bg-white/20" />
                    <span>7:45 PM</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-white/40 mb-0.5">MODEL</div>
                  <div className="text-2xl font-black text-white">79</div>
                </div>
              </div>
            </div>

            {/* Upgrade CTA overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0A0A12]/80 backdrop-blur-md">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#D97706] to-[#92400E] flex items-center justify-center mb-3 mx-auto">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div className="text-sm font-bold text-[#D97706] mb-1">Upgrade to Pro</div>
                <div className="text-xs text-white/50 mb-3">Unlock 5 more premium picks</div>
                <button className="px-4 py-2 rounded-full bg-gradient-to-r from-[#D97706] to-[#FCD34D] text-white text-xs font-bold tracking-wide flex items-center gap-1.5 mx-auto">
                  <span>VIEW PLANS</span>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 w-[390px] bg-[#0A0A12]/95 backdrop-blur-xl border-t border-white/5 px-8 py-4">
        <div className="flex items-center justify-between">
          <button className="flex flex-col items-center gap-1.5">
            <svg className="w-6 h-6 text-[#D97706]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>
            </svg>
            <span className="text-[9px] font-bold text-[#D97706] tracking-wider">PICKS</span>
          </button>
          
          <button className="flex flex-col items-center gap-1.5">
            <svg className="w-6 h-6 text-white/30" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z"/>
            </svg>
          </button>
          
          <button className="flex flex-col items-center gap-1.5">
            <svg className="w-6 h-6 text-white/30" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
            </svg>
          </button>
        </div>
      </nav>
    </div>
  );
}
