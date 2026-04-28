"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { SearchResultOrg } from "@/components/search/types";

type Props = { org: SearchResultOrg };

type EnrichState =
  | { status: "loading" }
  | { status: "done"; missionText: string | null; programs: string[]; namedContact: { name: string; title: string } | null; limited: boolean; city: string | null; numEmployees: number | null; totalExpenses: number | null; website: string | null }
  | { status: "error" };

export function Org990Panel({ org }: Props) {
  const [enrich, setEnrich] = useState<EnrichState>(
    org.missionText
      ? { status: "done", missionText: org.missionText, programs: [], namedContact: null, limited: false, city: org.city ?? null, numEmployees: null, totalExpenses: null, website: null }
      : { status: "loading" },
  );
  // Seed city/website immediately from org prop (populated by quick-fetch on row click)
  // so they show before the full enrich completes.
  const [preloadedCity] = useState<string | null>(org.city ?? null);
  const [preloadedWebsite] = useState<string | null>(org.website ?? null);

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
          city: data.city ?? null,
          numEmployees: data.numEmployees ?? null,
          totalExpenses: data.totalExpenses ?? null,
          website: data.website ?? null,
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

  const contact = enrich.status === "done" ? enrich.namedContact : null;
  const city = enrich.status === "done" ? enrich.city : preloadedCity;
  const numEmployees = enrich.status === "done" ? enrich.numEmployees : null;
  const totalExpenses = enrich.status === "done" ? enrich.totalExpenses : null;
  const website = enrich.status === "done" ? enrich.website : preloadedWebsite;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
        {org.state && <span>{city ? `${city}, ${org.state}` : org.state}</span>}
        <span>{formatRevenue(org.totalRevenue)} revenue</span>
        {totalExpenses != null && <span>{formatRevenue(String(totalExpenses))} expenses</span>}
        {numEmployees != null && <span>{numEmployees} employees</span>}
        {website && (
          <a
            href={website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            Website →
          </a>
        )}
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
