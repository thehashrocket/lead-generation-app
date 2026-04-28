// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSearchFiltersStore, __resetStore } from "@/components/search/use-search-filters-store";

beforeEach(() => __resetStore());

describe("useSearchFiltersStore", () => {
  it("returns initial empty state", () => {
    const { result } = renderHook(() => useSearchFiltersStore());
    expect(result.current.q).toBe("");
    expect(result.current.state).toBe("");
    expect(result.current.searchTrigger).toBe(0);
  });

  it("propagates setQ to all subscribers", () => {
    const { result: a } = renderHook(() => useSearchFiltersStore());
    const { result: b } = renderHook(() => useSearchFiltersStore());
    act(() => a.current.setQ("food bank"));
    expect(a.current.q).toBe("food bank");
    expect(b.current.q).toBe("food bank");
  });

  it("propagates setState to all subscribers", () => {
    const { result: a } = renderHook(() => useSearchFiltersStore());
    const { result: b } = renderHook(() => useSearchFiltersStore());
    act(() => a.current.setState("CA"));
    expect(a.current.state).toBe("CA");
    expect(b.current.state).toBe("CA");
  });

  it("propagates setNteeCode", () => {
    const { result } = renderHook(() => useSearchFiltersStore());
    act(() => result.current.setNteeCode("K"));
    expect(result.current.nteeCode).toBe("K");
  });

  it("propagates setMinRevenue and setMaxRevenue", () => {
    const { result } = renderHook(() => useSearchFiltersStore());
    act(() => result.current.setMinRevenue("100000"));
    act(() => result.current.setMaxRevenue("500000"));
    expect(result.current.minRevenue).toBe("100000");
    expect(result.current.maxRevenue).toBe("500000");
  });

  it("increments searchTrigger on each triggerSearch call", () => {
    const { result } = renderHook(() => useSearchFiltersStore());
    act(() => result.current.triggerSearch());
    expect(result.current.searchTrigger).toBe(1);
    act(() => result.current.triggerSearch());
    expect(result.current.searchTrigger).toBe(2);
  });

  it("unsubscribes cleanly on unmount — no update after unmount", () => {
    const { result, unmount } = renderHook(() => useSearchFiltersStore());
    const { result: other } = renderHook(() => useSearchFiltersStore());
    unmount();
    // Should not throw — unmounted hook is removed from listeners
    act(() => other.current.setState("TX"));
    expect(other.current.state).toBe("TX");
  });
});
