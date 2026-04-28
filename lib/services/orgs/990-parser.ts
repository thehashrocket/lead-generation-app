import sax from "sax";

const MAX_XML_BYTES = 5 * 1024 * 1024;

export type Parsed990 = {
  missionText: string | null;
  programs: string[];
  namedContact: { name: string; title: string } | null;
  pathMatched: string | null;
  totalExpenses: number | null;
  employeeCount: number | null;
};

const MISSION_PATHS = [
  "Return.ReturnData.IRS990.MissionDesc",
  "Return.ReturnData.IRS990.MissionDescription",
  "Return.ReturnData.IRS990.ActivityOrMissionDesc",
];

const EXPENSE_PATHS = [
  "Return.ReturnData.IRS990.TotalFunctionalExpensesAmt",
  "Return.ReturnData.IRS990EZ.TotalExpensesAmt",
];

const EMPLOYEE_PATHS = [
  "Return.ReturnData.IRS990.TotalEmployeeCnt",
  "Return.ReturnData.IRS990EZ.EmployeeCnt",
];

type OfficerCandidate = { name: string; title: string };

async function tryFilingUrl(filingUrl: string): Promise<string | null> {
  try {
    const xmlUrl = filingUrl.replace(".pdf", "_xml.xml");
    const res = await fetch(xmlUrl, { next: { revalidate: 0 } });
    if (!res.ok) return null;
    const text = await res.text();
    return text.startsWith("<") ? text : null;
  } catch {
    return null;
  }
}

// Try each URL in order; fall back to fetching the ProPublica org page when the list is empty.
export async function fetch990XmlFromUrls(filingUrls: string[], ein: string): Promise<string | null> {
  for (const url of filingUrls) {
    const xml = await tryFilingUrl(url);
    if (xml) return xml;
  }

  return null;
}

export function parse990Xml(xmlText: string): Parsed990 {
  if (Buffer.byteLength(xmlText, "utf8") > MAX_XML_BYTES) {
    return { missionText: null, programs: [], namedContact: null, pathMatched: "size_exceeded", totalExpenses: null, employeeCount: null };
  }

  const parser = sax.parser(true);
  const pathStack: string[] = [];
  let missionText: string | null = null;
  let pathMatched: string | null = null;
  let totalExpenses: number | null = null;
  let employeeCount: number | null = null;
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

    if (totalExpenses === null) {
      for (const ep of EXPENSE_PATHS) {
        if (fullPath === ep && currentText.trim()) {
          const n = Number(currentText.trim());
          if (!isNaN(n)) { totalExpenses = n; break; }
        }
      }
    }

    if (employeeCount === null) {
      for (const ep of EMPLOYEE_PATHS) {
        if (fullPath === ep && currentText.trim()) {
          const n = Number(currentText.trim());
          if (!isNaN(n)) { employeeCount = n; break; }
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

  return { missionText, programs, namedContact, pathMatched, totalExpenses, employeeCount };
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
