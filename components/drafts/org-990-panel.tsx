"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { SearchResultOrg } from "@/components/search/types";

type Props = { org: SearchResultOrg };

type EnrichState =
  | { status: "loading" }
  | { status: "done"; missionText: string | null; programs: string[]; namedContact: { name: string; title: string } | null; limited: boolean }
  | { status: "error" };

export function Org990Panel({ org }: Props) {
  const [enrich, setEnrich] = useState<EnrichState>(
    org.missionText
      ? { status: "done", missionText: org.missionText, programs: [], namedContact: null, limited: false }
      : { status: "loading" },
  );

  useEffect(() => {
    if (org.missionText) return;
    fetch(`/api/orgs/${org.ein}/enrich`)
      .then((r) => r.json())
      .then((data) => {
        setEnrich({
          status: "done",
          missionText: data.missionText ?? null,
          programs: data.programs ?? [],
          namedContact: data.namedContact ?? null,
          limited: !data.missionText,
        });
      })
      .catch(() => setEnrich({ status: "error" }));
  }, [org.ein, org.missionText]);

  const formatRevenue = (rev: string | null) => {
    if (!rev) return "—";
    const n = Number(rev);
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n}`;
  };

  const contact =
    enrich.status === "done" ? enrich.namedContact : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
        {org.state && <span>{org.state}</span>}
        <span>{formatRevenue(org.totalRevenue)} revenue</span>
        {org.propublicaUrl && (
          <a
            href={org.propublicaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            990 →
          </a>
        )}
      </div>

      {contact && (
        <p className="text-xs text-gray-400">
          990 Contact: {contact.name}, {contact.title}
        </p>
      )}

      <div>
        <p className="mb-1 text-xs font-medium text-gray-500">Mission</p>
        {enrich.status === "loading" && (
          <div className="space-y-2">
            <div className="h-3 w-full animate-pulse rounded bg-gray-100" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-gray-100" />
            <p className="text-xs text-gray-400">Fetching mission text from 990 filing...</p>
          </div>
        )}
        {enrich.status === "error" && (
          <Badge variant="outline" className="text-gray-400 text-xs">
            Limited 990 data
          </Badge>
        )}
        {enrich.status === "done" && (
          <>
            {enrich.missionText ? (
              <p className="text-sm leading-relaxed text-gray-700">{enrich.missionText}</p>
            ) : (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-gray-400 text-xs">
                  Limited 990 data
                </Badge>
                <span className="text-xs text-gray-400">
                  Draft will use summary fields only.
                </span>
              </div>
            )}
            {enrich.programs.length > 0 && (
              <div className="mt-2">
                <p className="mb-1 text-xs font-medium text-gray-500">Programs</p>
                <ul className="space-y-1">
                  {enrich.programs.slice(0, 3).map((p, i) => (
                    <li key={i} className="text-xs text-gray-600">
                      • {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
