"use client";

import { useState } from "react";
import { SearchFilters } from "./search-filters";
import { SearchResults } from "./search-results";
import { DraftSheet } from "../drafts/draft-sheet";
import type { SearchResultOrg } from "./types";

export function SearchView() {
  const [selectedOrg, setSelectedOrg] = useState<SearchResultOrg | null>(null);

  return (
    <div className="flex h-full">
      <SearchFilters />
      <div className="flex-1 overflow-auto p-6">
        <SearchResults onSelectOrg={setSelectedOrg} />
      </div>
      {selectedOrg && (
        <DraftSheet org={selectedOrg} onClose={() => setSelectedOrg(null)} />
      )}
    </div>
  );
}
