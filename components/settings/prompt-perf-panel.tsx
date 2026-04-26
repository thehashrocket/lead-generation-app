type Row = { prompt_version: string; sends: number; replies: number };

export function PromptPerfPanel({ rows }: { rows: Row[] }) {
  return (
    <div>
      <h2 className="text-sm font-semibold mb-3">Prompt Performance</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">No sends yet.</p>
      ) : (
        <div className="space-y-1">
          {rows.map((r) => {
            const pct = r.sends > 0 ? ((r.replies / r.sends) * 100).toFixed(1) : "0";
            return (
              <div key={r.prompt_version} className="flex items-center gap-4 text-sm">
                <span className="font-mono text-gray-500 w-16">{r.prompt_version}</span>
                <span className="text-gray-700">
                  {r.replies}/{r.sends} replies ({pct}%)
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
