"use client";

import { useCallback, useSyncExternalStore } from "react";

type StoreState = {
  q: string;
  nteeCode: string;
  state: string;
  minRevenue: string;
  maxRevenue: string;
  searchTrigger: number;
};

type Store = StoreState & {
  setQ: (v: string) => void;
  setNteeCode: (v: string) => void;
  setState: (v: string) => void;
  setMinRevenue: (v: string) => void;
  setMaxRevenue: (v: string) => void;
  triggerSearch: () => void;
};

const INITIAL_STATE: StoreState = { q: "", nteeCode: "", state: "", minRevenue: "", maxRevenue: "", searchTrigger: 0 };

let storeState: StoreState = INITIAL_STATE;
let listeners: Array<() => void> = [];

function notify() {
  for (const l of listeners) l();
}

function subscribe(fn: () => void) {
  listeners.push(fn);
  return () => { listeners = listeners.filter((l) => l !== fn); };
}

function getSnapshot(): StoreState {
  return storeState;
}

export function __resetStore() {
  storeState = INITIAL_STATE;
  listeners = [];
}

export function useSearchFiltersStore(): Store {
  const localState = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

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
