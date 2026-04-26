"use client";

import { useEffect, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSearchFiltersStore } from "./use-search-filters-store";
import type { SearchResultOrg } from "./types";
import { Download } from "lucide-react";

type Props = {
  onSelectOrg: (org: SearchResultOrg) => void;
};

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "rate_limited"; retryIn: number }
  | { status: "error"; message: string }
  | { status: "done"; orgs: SearchResultOrg[]; total: number };

export function SearchResults({ onSelectOrg }: Props) {
  const { q, nteeCode, state, searchTrigger } = useSearchFiltersStore();
  const [search, setSearch] = useState<SearchState>({ status: "idle" });

  useEffect(() => {
    if (searchTrigger === 0) return;
    runSearch();
  }, [searchTrigger]);

  async function runSearch() {
    setSearch({ status: "loading" });
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (nteeCode) params.set("nteeCode", nteeCode);
    if (state) params.set("state", state);

    try {
      const res = await fetch(`/api/search?${params}`);
      if (res.status === 429) {
        setSearch({ status: "rate_limited", retryIn: 60 });
        return;
      }
      if (!res.ok) throw new Error(`Search failed: ${res.status}`);
      const data = await res.json();
      setSearch({ status: "done", orgs: data.organizations, total: data.total_results });
    } catch (err) {
      setSearch({ status: "error", message: "ProPublica search failed. Check your connection and try again." });
    }
  }

  if (search.status === "idle") {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-gray-400">
        Set filters and click Search to find organizations.
      </div>
    );
  }

  if (search.status === "loading") {
    return (
      <div className="space-y-3">
        <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-10 w-full animate-pulse rounded bg-gray-100" />
        ))}
      </div>
    );
  }

  if (search.status === "rate_limited") {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Rate limited by ProPublica. Results are cached — search again in {search.retryIn}s.
        <Button variant="ghost" size="sm" className="ml-2" onClick={runSearch}>
          Retry
        </Button>
      </div>
    );
  }

  if (search.status === "error") {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {search.message}
        <Button variant="ghost" size="sm" className="ml-2" onClick={runSearch}>
          Retry
        </Button>
      </div>
    );
  }

  const { orgs, total } = search;

  if (orgs.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          No results for the current filters. Try broadening the revenue range, adding adjacent NTEE
          codes, or removing the state filter.
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // suggestions handled in filters
            }}
          >
            Clear state filter
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{total.toLocaleString()} results</p>
        <a href={`/api/export/search?q=${q}&nteeCode=${nteeCode}&state=${state}`} download>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </a>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Organization</TableHead>
            <TableHead className="text-xs">NTEE</TableHead>
            <TableHead className="text-xs">State</TableHead>
            <TableHead className="text-xs text-right">Revenue</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orgs.map((org) => (
            <TableRow
              key={org.ein}
              className="cursor-pointer hover:bg-gray-50"
              onClick={() => onSelectOrg(org)}
            >
              <TableCell className="text-sm font-medium">{org.name}</TableCell>
              <TableCell>
                {org.nteeCode && (
                  <Badge variant="outline" className="text-xs">
                    {org.nteeCode}
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-sm text-gray-500">{org.state}</TableCell>
              <TableCell className="text-right text-sm text-gray-500">
                {org.totalRevenue
                  ? `$${(Number(org.totalRevenue) / 1_000_000).toFixed(1)}M`
                  : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
