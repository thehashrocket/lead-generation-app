import sax from "sax";

const MAX_XML_BYTES = 5 * 1024 * 1024;

export type Parsed990 = {
  missionText: string | null;
  programs: string[];
  namedContact: { name: string; title: string } | null;
  pathMatched: string | null;
};

const MISSION_PATHS = [
  "Return.ReturnData.IRS990.MissionDesc",
  "Return.ReturnData.IRS990.MissionDescription",
  "Return.ReturnData.IRS990.ActivityOrMissionDesc",
];

type OfficerCandidate = { name: string; title: string };

export async function fetch990Xml(ein: string): Promise<string | null> {
  const cleanEin = ein.replace(/-/g, "");
  const url = `https://projects.propublica.org/nonprofits/api/v2/organizations/${cleanEin}.json`;

  try {
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return null;

    const data = await res.json();
    const filings: Array<{ filing_url?: string }> = data.filings_with_data ?? [];

    for (const filing of filings) {
      if (!filing.filing_url) continue;
      const xmlUrl = filing.filing_url.replace(".pdf", "_xml.xml");
      const xmlRes = await fetch(xmlUrl, { next: { revalidate: 0 } });
      if (xmlRes.ok) {
        const text = await xmlRes.text();
        if (text.startsWith("<")) return text;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function parse990Xml(xmlText: string): Parsed990 {
  if (Buffer.byteLength(xmlText, "utf8") > MAX_XML_BYTES) {
    return { missionText: null, programs: [], namedContact: null, pathMatched: "size_exceeded" };
  }

  const parser = sax.parser(true);
  const pathStack: string[] = [];
  let missionText: string | null = null;
  let pathMatched: string | null = null;
  const programs: string[] = [];
  const officers: OfficerCandidate[] = [];

  let currentOfficerName = "";
  let currentOfficerTitle = "";
  let inOfficerBlock = false;
  let currentText = "";

  parser.onopentag = (node) => {
    pathStack.push(node.name);
    if (node.name === "OfficerDirTrustKeyEmplGrp" || node.name === "Form990PartVIISectionAGrp") {
      inOfficerBlock = true;
      currentOfficerName = "";
      currentOfficerTitle = "";
    }
    currentText = "";
  };

  parser.ontext = (text) => {
    currentText += text;
  };

  parser.onclosetag = (tagName) => {
    const fullPath = pathStack.join(".");

    if (!missionText) {
      for (const mp of MISSION_PATHS) {
        if (fullPath === mp && currentText.trim()) {
          const val = currentText.trim();
          if (val.length < 5000 && isPrintableText(val)) {
            missionText = val;
            pathMatched = mp.split(".").pop() ?? mp;
          }
          break;
        }
      }
    }

    if (
      fullPath.includes("ProgramServiceAccomplishmentsGrp") &&
      tagName === "Desc" &&
      currentText.trim()
    ) {
      programs.push(currentText.trim().slice(0, 500));
    }

    if (inOfficerBlock) {
      if (tagName === "PersonNm" || tagName === "BusinessName") currentOfficerName = currentText.trim();
      if (tagName === "TitleTxt") currentOfficerTitle = currentText.trim();
      if (
        tagName === "OfficerDirTrustKeyEmplGrp" ||
        tagName === "Form990PartVIISectionAGrp"
      ) {
        if (currentOfficerName && currentOfficerTitle) {
          officers.push({ name: currentOfficerName, title: currentOfficerTitle });
        }
        inOfficerBlock = false;
      }
    }

    pathStack.pop();
    currentText = "";
  };

  try {
    parser.write(xmlText).close();
  } catch {
    // lenient — return whatever we parsed
  }

  const namedContact = findLeadOfficer(officers);

  return { missionText, programs, namedContact, pathMatched };
}

function findLeadOfficer(officers: OfficerCandidate[]): OfficerCandidate | null {
  const leaderTitles = ["executive director", "ceo", "chief executive", "president", "director"];
  for (const officer of officers) {
    const titleLower = officer.title.toLowerCase();
    if (leaderTitles.some((t) => titleLower.includes(t))) return officer;
  }
  return officers[0] ?? null;
}

function isPrintableText(str: string): boolean {
  // Allow all Unicode printable text; reject only binary control chars (NUL–BEL etc.)
  return !/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(str);
}
