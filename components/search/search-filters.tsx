"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSearchFiltersStore } from "./use-search-filters-store";
import { Search } from "lucide-react";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];

const NTEE_CODES = [
  { code: "D20", label: "D20 — Animal Rescues & Shelters" },
  { code: "P", label: "P — Human Services" },
  { code: "K", label: "K — Food Banks & Pantries" },
  { code: "L", label: "L — Housing & Shelters" },
  { code: "O", label: "O — Youth Development" },
  { code: "N", label: "N — Recreation & Sports Leagues" },
  { code: "B", label: "B — Education" },
  { code: "E", label: "E — Health" },
  { code: "C", label: "C — Environment & Conservation" },
  { code: "T", label: "T — Philanthropy & Voluntarism" },
];

export function SearchFilters() {
  const { q, nteeCode, state, minRevenue, maxRevenue, setQ, setNteeCode, setState, setMinRevenue, setMaxRevenue, triggerSearch } =
    useSearchFiltersStore();

  return (
    <div className="flex w-64 shrink-0 flex-col gap-4 border-r p-4">
      <h2 className="text-sm font-semibold text-gray-700">Filters</h2>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500">Keyword</label>
        <Input
          placeholder="Search org name..."
          value={q}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && triggerSearch()}
          className="h-8 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500">NTEE Code</label>
        <Select value={nteeCode} onValueChange={(v: string | null) => setNteeCode(v ?? "")}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder="Any category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Any category</SelectItem>
            {NTEE_CODES.map(({ code, label }) => (
              <SelectItem key={code} value={code}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500">State</label>
        <Select value={state} onValueChange={(v: string | null) => setState(v ?? "")}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder="Any state" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Any state</SelectItem>
            {US_STATES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500">Revenue range ($)</label>
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder="Min"
            value={minRevenue}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMinRevenue(e.target.value)}
            className="h-8 w-1/2 text-sm"
            min={0}
          />
          <Input
            type="number"
            placeholder="Max"
            value={maxRevenue}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMaxRevenue(e.target.value)}
            className="h-8 w-1/2 text-sm"
            min={0}
          />
        </div>
      </div>

      <Button size="sm" onClick={triggerSearch} className="w-full gap-2">
        <Search className="h-3.5 w-3.5" />
        Search
      </Button>
    </div>
  );
}
