import React from "react";
import { Lock, Home, Trophy, Settings, BarChart2 } from "lucide-react";

export function Sharp() {
  return (
    <div className="w-[390px] h-[844px] bg-[#000000] text-white relative font-sans overflow-hidden flex flex-col mx-auto border border-[#222222]">
      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto pb-24">
        {/* Header */}
        <header className="px-5 pt-12 pb-4 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-black tracking-tight leading-none">TBM</h1>
            <p className="text-[#84CC16] text-[10px] font-bold tracking-widest mt-1">PICKS ENGINE</p>
          </div>
          <div className="text-right">
            <p className="text-[#6B7280] text-xs font-bold tracking-wider">TODAY / MAR 15</p>
          </div>
        </header>

        {/* 8 Games Today Badge */}
        <div className="px-5 mb-6">
          <div className="inline-flex items-center justify-center bg-[#84CC16]/20 border border-[#84CC16]/40 text-[#84CC16] rounded font-bold text-xs px-3 py-1.5 uppercase tracking-wide">
            8 Games Today
          </div>
        </div>

        {/* Filters */}
        <div className="px-5 mb-8 flex gap-3 overflow-x-auto scrollbar-hide">
          <button className="bg-[#84CC16] text-black rounded-full px-4 py-1.5 font-bold text-sm whitespace-nowrap">
            ALL
          </button>
          <button className="border border-[#222222] text-neutral-400 rounded-full px-4 py-1.5 font-bold text-sm whitespace-nowrap">
            MLB
          </button>
          <button className="border border-[#222222] text-neutral-400 rounded-full px-4 py-1.5 font-bold text-sm whitespace-nowrap">
            NFL
          </button>
          <button className="border border-[#222222] text-neutral-400 rounded-full px-4 py-1.5 font-bold text-sm whitespace-nowrap">
            NBA
          </button>
        </div>

        {/* Section Header */}
        <div className="px-5 mb-4 flex items-center">
          <h2 className="text-[11px] font-black tracking-[0.15em] text-neutral-500 uppercase">
            Today's Matchups
          </h2>
          <div className="w-8 h-0.5 bg-[#84CC16] ml-3"></div>
        </div>

        <div className="px-5 flex flex-col gap-5">
          {/* Featured Pick Card */}
          <div className="rounded-xl overflow-hidden border border-[#222222] bg-[#111111] shadow-lg shadow-[#84CC16]/5">
            <div className="bg-gradient-to-r from-[#84CC16] to-[#65A30D] px-4 py-2 flex justify-between items-center">
              <span className="font-black text-sm text-black tracking-wide">MLB · ⭐ TOP PICK</span>
              <span className="text-sm font-bold text-black/70">7:05 PM</span>
            </div>
            <div className="p-5">
              <div className="mb-6">
                <h3 className="text-3xl font-black text-white tracking-tight leading-none mb-1">
                  LAD <span className="text-neutral-500 text-xl font-bold">vs</span> NYY
                </h3>
                <p className="text-[#6B7280] text-xs font-medium">Los Angeles Dodgers vs New York Yankees</p>
              </div>

              <div className="flex justify-between items-end border-b border-[#222222] pb-5 mb-5">
                <div>
                  <p className="text-[10px] font-black tracking-wider text-neutral-500 mb-1">MODEL SCORE</p>
                  <div className="flex items-baseline gap-1 leading-none">
                    <span className="text-6xl font-black text-white tracking-tighter">84</span>
                    <span className="text-xl font-bold text-[#84CC16]">/100</span>
                  </div>
                </div>
                <div>
                  <span className="inline-block bg-[#84CC16] text-black text-xs font-black px-3 py-1.5 rounded uppercase tracking-wide">
                    Strong Buy
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1 mb-5">
                <p className="text-[10px] font-black tracking-wider text-neutral-500 uppercase">WIN PROBABILITY</p>
                <p className="text-3xl font-black text-white tracking-tight leading-none">
                  67% <span className="text-lg text-neutral-400">HOME WIN</span>
                </p>
                <p className="text-[#84CC16] font-bold text-sm">EDGE: LAD +8.3%</p>
              </div>

              <div className="bg-[#0A0A0A] rounded p-3 flex justify-between text-[11px] font-bold text-neutral-400 tracking-wide uppercase border border-[#222222]">
                <span>Vegas · LAD -145</span>
                <span>Over/Under · 8.5</span>
              </div>
            </div>
          </div>

          {/* Regular Game Card 1 */}
          <div className="rounded-r-xl border-y border-r border-[#222222] border-l-4 border-l-[#0EA5E9] bg-[#111111] p-4 flex justify-between items-center">
            <div className="flex-1">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-2xl font-black text-white tracking-tight leading-none">BOS <span className="text-neutral-500 text-lg font-bold">vs</span> HOU</h3>
                <span className="text-xs font-bold text-neutral-500 tracking-wide">MLB · 6:10 PM</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-baseline gap-0.5">
                  <span className="text-3xl font-black text-white leading-none">71</span>
                  <span className="text-sm font-bold text-[#84CC16]">/100</span>
                </div>
                <span className="bg-[#84CC16] text-black text-[10px] font-black px-2 py-1 rounded tracking-wide uppercase">
                  Buy
                </span>
                <span className="ml-auto text-[#84CC16] font-bold text-sm whitespace-nowrap">
                  HOU +4.1%
                </span>
              </div>
            </div>
          </div>

          {/* Regular Game Card 2 */}
          <div className="rounded-r-xl border-y border-r border-[#222222] border-l-4 border-l-[#0EA5E9] bg-[#111111] p-4 flex justify-between items-center">
            <div className="flex-1">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-2xl font-black text-white tracking-tight leading-none">KC <span className="text-neutral-500 text-lg font-bold">vs</span> CLE</h3>
                <span className="text-xs font-bold text-neutral-500 tracking-wide">MLB · 6:40 PM</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-baseline gap-0.5">
                  <span className="text-3xl font-black text-neutral-400 leading-none">58</span>
                  <span className="text-sm font-bold text-neutral-600">/100</span>
                </div>
                <span className="bg-[#222222] text-neutral-400 text-[10px] font-black px-2 py-1 rounded tracking-wide uppercase">
                  Neutral
                </span>
                <span className="ml-auto text-neutral-500 font-bold text-sm whitespace-nowrap">
                  NO EDGE
                </span>
              </div>
            </div>
          </div>

          {/* Locked Pick Card */}
          <div className="relative rounded-xl border border-[#222222] bg-[#111111] p-5 h-[160px] flex flex-col justify-center items-center overflow-hidden">
            {/* Blurred Background Content */}
            <div className="absolute inset-0 p-5 filter blur-sm opacity-30 flex flex-col gap-4 pointer-events-none">
              <div className="h-6 w-32 bg-white/20 rounded"></div>
              <div className="h-4 w-48 bg-white/10 rounded"></div>
              <div className="h-12 w-24 bg-white/20 rounded mt-auto"></div>
            </div>
            
            {/* Lock Overlay */}
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-10 h-10 rounded-full bg-[#222222] flex items-center justify-center mb-2">
                <Lock size={18} className="text-neutral-400" />
              </div>
              <p className="text-neutral-400 text-xs font-black tracking-widest mb-4">PRO PICKS LOCKED</p>
              <button className="border-2 border-[#84CC16] text-[#84CC16] font-bold px-6 py-2 rounded-lg text-sm hover:bg-[#84CC16]/10 transition-colors">
                Unlock Pro →
              </button>
            </div>
          </div>
          
        </div>
      </div>

      {/* Bottom Nav */}
      <nav className="absolute bottom-0 left-0 right-0 h-20 bg-[#000000] border-t border-[#222222] flex justify-around items-center px-2 pb-5 z-20">
        <button className="flex flex-col items-center gap-1.5 relative w-16 pt-3">
          <div className="absolute top-0 left-2 right-2 h-0.5 bg-[#84CC16] rounded-b-full"></div>
          <Trophy size={22} className="text-[#84CC16]" />
          <span className="text-[10px] font-bold text-[#84CC16] tracking-wide">Picks</span>
        </button>
        <button className="flex flex-col items-center gap-1.5 w-16 pt-3">
          <BarChart2 size={22} className="text-neutral-600" />
          <span className="text-[10px] font-bold text-neutral-600 tracking-wide">Models</span>
        </button>
        <button className="flex flex-col items-center gap-1.5 w-16 pt-3">
          <Settings size={22} className="text-neutral-600" />
          <span className="text-[10px] font-bold text-neutral-600 tracking-wide">Settings</span>
        </button>
      </nav>
    </div>
  );
}
