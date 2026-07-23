import React from 'react';

export function Signal() {
  return (
    <div className="w-[390px] h-[844px] bg-black text-white font-['Inter'] flex flex-col relative overflow-hidden select-none">
      
      {/* Header */}
      <div className="px-5 pt-14 pb-4 border-b border-[#1A1A1A] bg-black relative z-10">
        <div className="flex justify-between items-center mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-[#84CC16] rounded-sm flex items-center justify-center">
              <span className="text-black font-black text-xs">TBM</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#84CC16] animate-pulse shadow-[0_0_8px_#84CC16]"></div>
              <span className="text-[#84CC16] font-mono text-[10px] tracking-widest uppercase">Signal Feed</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-neutral-400 text-[10px] font-medium tracking-wider uppercase">Oct 24, 2023</div>
          </div>
        </div>
        
        {/* Pills */}
        <div className="flex gap-2">
          <button className="bg-[#84CC16] text-black rounded-sm px-3 py-1 text-[10px] font-black tracking-wide">ALL</button>
          <button className="bg-[#0C0C0C] border border-[#1A1A1A] text-neutral-500 rounded-sm px-3 py-1 text-[10px] font-bold tracking-wide">MLB</button>
          <button className="bg-[#0C0C0C] border border-[#1A1A1A] text-neutral-500 rounded-sm px-3 py-1 text-[10px] font-bold tracking-wide">NFL</button>
          <button className="bg-[#0C0C0C] border border-[#1A1A1A] text-neutral-500 rounded-sm px-3 py-1 text-[10px] font-bold tracking-wide">NBA</button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4 pb-28 custom-scrollbar">
        
        <div className="text-[10px] tracking-[0.2em] text-neutral-500 font-semibold uppercase mb-4 flex items-center gap-2">
          <span>Scanning Today</span>
          <span className="w-1 h-1 rounded-full bg-neutral-600"></span>
          <span>8 Games</span>
        </div>

        {/* Featured Card */}
        <div className="bg-[#0C0C0C] border border-[#1A1A1A] border-l-2 border-l-[#84CC16] p-4 rounded-sm relative shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
          <div className="flex justify-between items-start mb-6">
            <div>
              <div className="text-[10px] text-neutral-500 font-semibold uppercase tracking-wider mb-1.5">MLB · 7:05 PM</div>
              <div className="text-lg font-bold tracking-tight">LAD <span className="text-neutral-600 font-medium">vs</span> NYY</div>
            </div>
            <div className="bg-[#84CC16] text-black text-[9px] font-black tracking-widest px-2 py-0.5 rounded-sm shadow-[0_0_10px_rgba(132,204,22,0.2)]">
              STRONG BUY
            </div>
          </div>
          
          <div className="flex items-end gap-2 mb-6">
            <div className="text-[52px] font-black text-[#84CC16] leading-none tracking-tighter">84</div>
            <div className="text-sm text-neutral-600 font-bold mb-1 tracking-tight">/ 100</div>
          </div>
          
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-[11px] mb-2 font-medium">
                <span className="text-neutral-500 tracking-wider">HOME WIN PROB</span>
                <span className="text-white font-bold">67%</span>
              </div>
              <div className="h-[3px] w-full bg-[#1A1A1A] rounded-full overflow-hidden">
                <div className="h-full bg-[#84CC16] w-[67%] shadow-[0_0_8px_#84CC16]"></div>
              </div>
            </div>
            
            <div className="flex justify-between items-center border-t border-[#1A1A1A] pt-3">
              <div className="text-[11px] text-[#84CC16] font-mono font-medium tracking-tight bg-[#84CC16]/10 px-2 py-0.5 rounded-sm">EDGE: LAD +8.3%</div>
              <div className="flex gap-3 text-[10px] text-neutral-500 font-medium">
                <span>Vegas: LAD -145</span>
                <span>O/U 8.5</span>
              </div>
            </div>
          </div>
        </div>

        {/* Regular Card 1 */}
        <div className="bg-[#0C0C0C] border border-[#1A1A1A] p-4 rounded-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
          <div className="flex justify-between items-center mb-4">
            <div className="text-[10px] text-neutral-500 font-semibold uppercase tracking-wider">MLB · 6:10 PM</div>
            <div className="text-[9px] font-black tracking-widest px-2 py-0.5 rounded-sm text-[#84CC16] bg-[#84CC16]/10">
              BUY
            </div>
          </div>
          <div className="flex justify-between items-center px-2">
            <div className="text-xl font-bold text-white w-14 tracking-tight">BOS</div>
            <div className="flex flex-col items-center">
              <div className="text-3xl font-black text-[#84CC16] leading-none tracking-tighter">71</div>
            </div>
            <div className="text-xl font-bold text-white w-14 text-right tracking-tight">HOU</div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#1A1A1A] flex justify-center">
            <span className="text-[11px] text-[#84CC16] font-mono font-medium tracking-tight">EDGE: HOU +4.1%</span>
          </div>
        </div>

        {/* Regular Card 2 */}
        <div className="bg-[#0C0C0C] border border-[#1A1A1A] p-4 rounded-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
          <div className="flex justify-between items-center mb-4">
            <div className="text-[10px] text-neutral-500 font-semibold uppercase tracking-wider">MLB · 6:40 PM</div>
            <div className="text-[9px] font-black tracking-widest px-2 py-0.5 rounded-sm text-neutral-400 bg-[#1A1A1A]">
              NEUTRAL
            </div>
          </div>
          <div className="flex justify-between items-center px-2">
            <div className="text-xl font-bold text-white w-14 tracking-tight">KC</div>
            <div className="flex flex-col items-center">
              <div className="text-3xl font-black text-neutral-400 leading-none tracking-tighter opacity-70">58</div>
            </div>
            <div className="text-xl font-bold text-white w-14 text-right tracking-tight">CLE</div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#1A1A1A] flex justify-center">
            <span className="text-[11px] text-neutral-600 font-mono font-medium tracking-tight">NO EDGE</span>
          </div>
        </div>

        {/* Locked Card */}
        <div className="bg-[#0C0C0C] border border-[#1A1A1A] rounded-sm relative overflow-hidden group shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
          <div className="p-4 blur-[3px] opacity-30 select-none">
            <div className="flex justify-between items-center mb-4">
              <div className="text-[10px] text-neutral-500 font-semibold uppercase tracking-wider">NBA · 7:30 PM</div>
              <div className="text-[9px] font-black tracking-widest px-2 py-0.5 rounded-sm text-[#84CC16] bg-[#84CC16]/10">
                STRONG BUY
              </div>
            </div>
            <div className="flex justify-between items-center px-2">
              <div className="text-xl font-bold text-white w-14">LAL</div>
              <div className="flex flex-col items-center">
                <div className="text-3xl font-black text-[#84CC16] leading-none">89</div>
              </div>
              <div className="text-xl font-bold text-white w-14 text-right">DEN</div>
            </div>
            <div className="mt-4 pt-3 border-t border-[#1A1A1A] flex justify-center">
              <span className="text-[11px] text-[#84CC16] font-mono">EDGE: DEN +10.2%</span>
            </div>
          </div>
          
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 p-4 text-center z-10 backdrop-blur-[1px]">
            <div className="w-10 h-10 rounded-full bg-[#1A1A1A] flex items-center justify-center mb-3 border border-[#2A2A2A]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            </div>
            <div className="text-white font-bold text-[13px] mb-4 tracking-wide">PRO Picks Locked</div>
            <button className="bg-[#84CC16] text-black font-black text-[11px] px-8 py-3 rounded-sm tracking-widest uppercase transition-transform active:scale-95 shadow-[0_0_15px_rgba(132,204,22,0.15)] hover:shadow-[0_0_25px_rgba(132,204,22,0.25)]">
              Unlock PRO
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Nav - Floating effect over content */}
      <div className="absolute bottom-0 left-0 right-0 h-[88px] bg-black/95 backdrop-blur-md border-t border-[#1A1A1A] flex justify-around items-start pt-4 px-4 z-20">
        <div className="flex flex-col items-center gap-1.5 w-16 cursor-pointer">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          <span className="text-[9px] font-black tracking-widest text-[#84CC16]">PICKS</span>
        </div>
        <div className="flex flex-col items-center gap-1.5 w-16 opacity-40 hover:opacity-100 transition-opacity cursor-pointer">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>
          <span className="text-[9px] font-bold tracking-widest text-white">MODELS</span>
        </div>
        <div className="flex flex-col items-center gap-1.5 w-16 opacity-40 hover:opacity-100 transition-opacity cursor-pointer">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
          <span className="text-[9px] font-bold tracking-widest text-white">PROFILE</span>
        </div>
      </div>
    </div>
  );
}
