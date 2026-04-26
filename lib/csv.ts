export function escapeCell(value: unknown): string {
  const str = value == null ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function rowToCsv(row: unknown[]): string {
  return row.map(escapeCell).join(",") + "\r\n";
}

export function* streamCsv(
  headers: string[],
  rows: unknown[][],
): Generator<string> {
  yield rowToCsv(headers);
  for (const row of rows) {
    yield rowToCsv(row);
  }
}

export function buildCsvResponse(headers: string[], rows: unknown[][], filename: string): Response {
  const chunks: string[] = [];
  for (const chunk of streamCsv(headers, rows)) {
    chunks.push(chunk);
  }
  const body = chunks.join("");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
