import { describe, expect, it } from "vitest";
import { parse990Xml } from "@/lib/services/orgs/990-parser";

const SAMPLE_XML = `<?xml version="1.0"?>
<Return>
  <ReturnData>
    <IRS990>
      <MissionDesc>We rescue and rehome dogs and cats in the greater Springfield area.</MissionDesc>
      <ProgramServiceAccomplishmentsGrp>
        <Desc>Operated a no-kill shelter serving 500 animals per year.</Desc>
      </ProgramServiceAccomplishmentsGrp>
    </IRS990>
  </ReturnData>
  <OfficerDirTrustKeyEmplGrp>
    <PersonNm>Jane Smith</PersonNm>
    <TitleTxt>Executive Director</TitleTxt>
  </OfficerDirTrustKeyEmplGrp>
</Return>`;

describe("parse990Xml", () => {
  it("parses mission text from MissionDesc", () => {
    const result = parse990Xml(SAMPLE_XML);
    expect(result.missionText).toBe("We rescue and rehome dogs and cats in the greater Springfield area.");
    expect(result.pathMatched).toBe("MissionDesc");
  });

  it("parses program descriptions", () => {
    const result = parse990Xml(SAMPLE_XML);
    expect(result.programs).toHaveLength(1);
    expect(result.programs[0]).toContain("no-kill shelter");
  });

  it("parses named contact", () => {
    const result = parse990Xml(SAMPLE_XML);
    expect(result.namedContact?.name).toBe("Jane Smith");
    expect(result.namedContact?.title).toBe("Executive Director");
  });

  it("returns null missionText for XML exceeding 5MB", () => {
    const huge = "a".repeat(5 * 1024 * 1024 + 1);
    const result = parse990Xml(huge);
    expect(result.missionText).toBeNull();
    expect(result.pathMatched).toBe("size_exceeded");
  });

  it("handles malformed XML gracefully", () => {
    const result = parse990Xml("<broken><xml");
    expect(result.missionText).toBeNull();
  });

  it("falls back to MissionDescription path", () => {
    const xml = `<Return><ReturnData><IRS990><MissionDescription>Fallback mission.</MissionDescription></IRS990></ReturnData></Return>`;
    const result = parse990Xml(xml);
    expect(result.missionText).toBe("Fallback mission.");
    expect(result.pathMatched).toBe("MissionDescription");
  });

  it("accepts mission text containing Unicode (smart quotes, accents, em-dash)", () => {
    const xml = `<Return><ReturnData><IRS990><MissionDesc>Serve résidents—build a “better” community.</MissionDesc></IRS990></ReturnData></Return>`;
    const result = parse990Xml(xml);
    expect(result.missionText).toBe("Serve résidents—build a “better” community.");
  });

  it("rejects mission text containing binary control characters (NUL, BEL)", () => {
    const xml = `<Return><ReturnData><IRS990><MissionDesc>Bad\x00data</MissionDesc></IRS990></ReturnData></Return>`;
    const result = parse990Xml(xml);
    expect(result.missionText).toBeNull();
  });
});
