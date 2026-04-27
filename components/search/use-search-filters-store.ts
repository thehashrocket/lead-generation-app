"use client";

import { useCallback, useState } from "react";

type Store = {
  q: string;
  nteeCode: string;
  state: string;
  minRevenue: string;
  maxRevenue: string;
  searchTrigger: number;
  setQ: (v: string) => void;
  setNteeCode: (v: string) => void;
  setState: (v: string) => void;
  setMinRevenue: (v: string) => void;
  setMaxRevenue: (v: string) => void;
  triggerSearch: () => void;
};

// Module-level state so SearchFilters and SearchResults share it without prop drilling
let listeners: Array<(s: Omit<Store, "setQ" | "setNteeCode" | "setState" | "setMinRevenue" | "setMaxRevenue" | "triggerSearch">) => void> = [];
let storeState = { q: "", nteeCode: "", state: "", minRevenue: "", maxRevenue: "", searchTrigger: 0 };

function notify() {
  for (const l of listeners) l(storeState);
}

export function useSearchFiltersStore(): Store {
  const [localState, setLocalState] = useState(storeState);

  const subscribe = useCallback((fn: typeof listeners[0]) => {
    listeners.push(fn);
    return () => {
      listeners = listeners.filter((l) => l !== fn);
    };
  }, []);

  useState(() => {
    const unsub = subscribe(setLocalState);
    return unsub;
  });

  const setQ = useCallback((v: string) => { storeState = { ...storeState, q: v }; notify(); }, []);
  const setNteeCode = useCallback((v: string) => { storeState = { ...storeState, nteeCode: v }; notify(); }, []);
  const setState = useCallback((v: string) => { storeState = { ...storeState, state: v }; notify(); }, []);
  const setMinRevenue = useCallback((v: string) => { storeState = { ...storeState, minRevenue: v }; notify(); }, []);
  const setMaxRevenue = useCallback((v: string) => { storeState = { ...storeState, maxRevenue: v }; notify(); }, []);

  const triggerSearch = useCallback(() => {
    storeState = { ...storeState, searchTrigger: storeState.searchTrigger + 1 };
    notify();
  }, []);

  return { ...localState, setQ, setNteeCode, setState, setMinRevenue, setMaxRevenue, triggerSearch };
}
