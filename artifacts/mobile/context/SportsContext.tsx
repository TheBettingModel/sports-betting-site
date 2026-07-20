import React, { createContext, useContext, useState } from 'react';
import type { Sport } from '@/data/mockGames';

export const SPORTS: Sport[] = ['NFL', 'NCAAF', 'NBA', 'NCAAB', 'MLB', 'NHL', 'Soccer', 'UFC', 'WNBA'];

type FilterSport = Sport | 'All';

interface SportsContextValue {
  selectedSport: FilterSport;
  setSelectedSport: (s: FilterSport) => void;
  savedPicks: string[];
  toggleSavedPick: (id: string) => void;
}

const SportsContext = createContext<SportsContextValue | null>(null);

export function SportsProvider({ children }: { children: React.ReactNode }) {
  const [selectedSport, setSelectedSport] = useState<FilterSport>('All');
  const [savedPicks, setSavedPicks] = useState<string[]>([]);

  function toggleSavedPick(id: string) {
    setSavedPicks(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id],
    );
  }

  return (
    <SportsContext.Provider value={{ selectedSport, setSelectedSport, savedPicks, toggleSavedPick }}>
      {children}
    </SportsContext.Provider>
  );
}

export function useSports(): SportsContextValue {
  const ctx = useContext(SportsContext);
  if (!ctx) throw new Error('useSports must be used within SportsProvider');
  return ctx;
}
