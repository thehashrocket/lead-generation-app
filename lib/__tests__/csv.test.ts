import { describe, expect, it } from "vitest";
import { escapeCell, rowToCsv, streamCsv } from "@/lib/csv";

describe("escapeCell", () => {
  it("passes through plain strings", () => {
    expect(escapeCell("hello")).toBe("hello");
  });

  it("wraps strings with commas in quotes", () => {
    expect(escapeCell("hello, world")).toBe('"hello, world"');
  });

  it("escapes inner quotes", () => {
    expect(escapeCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("wraps strings with newlines", () => {
    expect(escapeCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("handles null/undefined as empty", () => {
    expect(escapeCell(null)).toBe("");
    expect(escapeCell(undefined)).toBe("");
  });
});

describe("rowToCsv", () => {
  it("joins cells with CRLF line ending", () => {
    expect(rowToCsv(["a", "b", "c"])).toBe("a,b,c\r\n");
  });
});

describe("streamCsv", () => {
  it("yields header then rows", () => {
    const output = [...streamCsv(["col1", "col2"], [["val1", "val2"], ["val3", "val4"]])];
    expect(output[0]).toBe("col1,col2\r\n");
    expect(output[1]).toBe("val1,val2\r\n");
    expect(output[2]).toBe("val3,val4\r\n");
  });

  it("yields only header for empty rows", () => {
    const output = [...streamCsv(["col1", "col2"], [])];
    expect(output).toHaveLength(1);
    expect(output[0]).toBe("col1,col2\r\n");
  });
});
