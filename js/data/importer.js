/**
 * Import logic for expert CSV.
 */
import store from "./store.js";
import { isObserverOnly, readFileAsText } from "../shared.js";

/**
 * Parse CSV text into expert objects.
 * Expected columns: CC, Name, Member, Notes, DI, FE, BE, New, DI_Pref, FE_Pref, BE_Pref
 */
export function parseExpertCSV(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2)
    throw new Error("CSV must have a header row and at least one data row.");

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const experts = [];

  // Map header names to indices (flexible matching)
  const colMap = {};
  const aliases = {
    cc: ["cc", "country_code", "code"],
    name: ["name", "expert", "full_name"],
    member: ["member", "member_country", "country", "country/region"],
    notes: ["notes", "note"],
    di: ["di", "d.imp", "di_skill", "design", "design implementation", "d_imp"],
    fe: ["fe", "frontend", "fe_skill", "front-end", "front_end"],
    be: ["be", "backend", "be_skill", "back-end", "back_end"],
    new: ["new", "is_new", "first_time"],
    di_pref: ["di_pref", "di_marking", "di marking", "di preference"],
    fe_pref: ["fe_pref", "fe_marking", "fe marking", "fe preference"],
    be_pref: ["be_pref", "be_marking", "be marking", "be preference"],
  };

  for (const [field, names] of Object.entries(aliases)) {
    const idx = header.findIndex((h) => names.includes(h));
    if (idx !== -1) colMap[field] = idx;
  }

  // Require at minimum CC and Name
  if (colMap.cc === undefined)
    throw new Error("CSV must have a CC (country code) column.");
  if (colMap.name === undefined)
    throw new Error("CSV must have a Name column.");

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Handle quoted fields
    const cols = parseCSVLine(line);
    const cc = (cols[colMap.cc] || "").trim().toUpperCase();
    const name = (cols[colMap.name] || "").trim();

    if (!cc || !name) continue;

    const expert = {
      id: cc,
      country_code: cc,
      name,
      member_country: (cols[colMap.member] || "").trim(),
      notes: (cols[colMap.notes] || "").trim(),
      skills: {
        di: parseSkill(cols[colMap.di]),
        fe: parseSkill(cols[colMap.fe]),
        be: parseSkill(cols[colMap.be]),
      },
      preferences: {
        di: parsePref(cols[colMap.di_pref]),
        fe: parsePref(cols[colMap.fe_pref]),
        be: parsePref(cols[colMap.be_pref]),
      },
      is_new: parseBool(cols[colMap.new]),
      is_observer_only: false,
      supervisor_willing: "M", // default, can be edited later
    };

    // Observer status
    expert.is_observer_only = isObserverOnly(expert);

    // Basic fields
    expert.avg_skill = (
      (expert.skills.di + expert.skills.fe + expert.skills.be) /
      3
    ).toFixed(1);

    experts.push(expert);
  }

  return experts;
}

/** Parse a single CSV line respecting quoted fields */
function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

function parseSkill(val) {
  if (val === undefined || val === null || val === "") return 0;
  const n = parseInt(val, 10);
  return isNaN(n) ? 0 : Math.max(0, Math.min(5, n));
}

function parsePref(val) {
  if (val === undefined || val === null) return "M";
  const v = val.toString().trim().toUpperCase();
  if (v === "Y" || v === "YES") return "Y";
  if (v === "N" || v === "NO") return "N";
  if (v === "OBSERVER" || v === "OBS") return "Observer";
  return "M";
}

function parseBool(val) {
  if (val === undefined || val === null) return false;
  const v = val.toString().trim().toUpperCase();
  return v === "TRUE" || v === "Y" || v === "YES" || v === "1";
}

/**
 * Import experts from CSV file input.
 */
export async function importExpertsFromFile(file) {
  const text = await readFileAsText(file);
  const experts = parseExpertCSV(text);
  store.setExperts(experts);
  return experts;
}
