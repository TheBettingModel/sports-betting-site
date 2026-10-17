import { createHash } from "node:crypto";
import { ncaaObject, ncaafIntegrityHash, sameNcaafIdentity, validNcaafIdentity, type NcaafIdentity } from "./ncaafHistoricalIntegrity";
import { prepareNcaafFinal, type NcaafFinalInput } from "./ncaafFinalIngestion";

/** Operator-only library. No startup, environment access, network, database or clock.
 * Deliberately cannot replace an existing disagreeing result or discover fixtures.
 * Official documents are reviewed reconciliation evidence, NOT live-model inputs. */
export type RepairSnapshot = {
  game: Record<string, unknown>; result: Record<string, unknown> | null;
  rawIsSqlNull: boolean | null; rawMd5: string | null;
  native?: { game: Record<string, unknown>; result: Record<string, unknown> | null };
};
export type RepairBefore = {
  gameId: string; homeTeamId: string; awayTeamId: string; kickoffAt: string;
  homeScore: number | null; awayScore: number | null; gameUpdatedAt: string;
  resultId: number | null; resultHomeScore: number | null; resultAwayScore: number | null;
  resultUpdatedAt: string | null; gradedAt: string | null; gradingSource: string | null;
  rawIsSqlNull: boolean | null; rawMd5: string | null;
};
/** SQL observations only: never derive this checksum from JSON.stringify(null).
 * A missing joined row is distinct from both SQL NULL and JSON literal null. */
export function ncaafRepairRawBefore(
  resultId: number | null, rawIsSqlNull: boolean | null, rawMd5: string | null,
): Pick<RepairBefore, "rawIsSqlNull" | "rawMd5"> {
  if (resultId === null) {
    if (rawIsSqlNull !== null || rawMd5 !== null) throw Error("MISSING_RESULT_PROVENANCE_MUST_BE_NULL");
  } else {
    if (!Number.isSafeInteger(resultId) || resultId <= 0 || typeof rawIsSqlNull !== "boolean")
      throw Error("EXPLICIT_SQL_NULL_OBSERVATION_REQUIRED");
    if (rawIsSqlNull ? rawMd5 !== null : typeof rawMd5 !== "string" || !/^[a-f0-9]{32}$/.test(rawMd5))
      throw Error("INCONSISTENT_SQL_PROVENANCE");
  }
  return { rawIsSqlNull, rawMd5 };
}
export type OfficialFinalReview = {
  sourceUrl: string; capturedAt: string; representation: "EXTRACTED_MARKDOWN";
  document: string; documentHash: string;
  identity: NcaafIdentity; gameDate: string; homeScore: number; awayScore: number;
  finalQuote: string; homeLabel: string; awayLabel: string; homeScoreQuote: string; awayScoreQuote: string;
  scoreLayout?: "TEAM_ROWS" | "SCORING_COLUMNS" | "MATCHUP_SCORELINE";
  dateQuote: string; dateBasis: "EXPLICIT_GAME_DATE" | "REVIEWED_GAME_DAY_AND_PUBLICATION_DATE";
  authorship: "INSTITUTIONAL_BOXSCORE" | "INSTITUTIONAL_REPORT" | "INSTITUTIONAL_POSTGAME_NOTES";
};
export type RepairEntry = { before: RepairBefore; input: NcaafFinalInput; official: OfficialFinalReview };
export type RepairManifest = { version: "ncaaf-controlled-repair-v1"; asOf: string; entries: RepairEntry[] };
export type RepairApproval = {
  operation: "APPLY" | "ROLLBACK"; manifestHash: string; gameIds: string[];
  target: { host: string; database: string; role: string };
  acknowledgeKnownBadBeforeScores?: boolean;
};
export type RepairReceipt = {
  manifestHash: string; gameId: string; before: RepairSnapshot; afterHash: string;
  primaryHash: string; officialHash: string; availableAt: string; receiptHash: string;
};
export interface RepairTransaction {
  observedAt: string;
  read(): Promise<RepairSnapshot | null>;
  reconcile(input: NcaafFinalInput, asOf: string): Promise<string>;
  attach(receipt: RepairReceipt): Promise<void>;
  restore(before: RepairSnapshot): Promise<void>;
}
export interface RepairStore {
  verifyTarget(target: RepairApproval["target"]): Promise<void>;
  transaction<T>(id: string, work: (tx: RepairTransaction) => Promise<T>): Promise<T>;
}
export type JournalRecord = {
  manifestHash: string; gameId: string; state: "PREPARED" | "APPLIED" | "ROLLBACK_PREPARED" | "ROLLED_BACK";
  before: RepairSnapshot; receipt?: RepairReceipt;
};
export interface RepairJournal {
  get(key: string): Promise<JournalRecord | null>;
  put(key: string, value: JournalRecord): Promise<void>;
}
export const officialDocumentHash = (text: string) => createHash("sha256").update(text).digest("hex");
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const officialHosts = new Set([
  "kuathletics.com",
  "unlvrebels.com", "hawaiiathletics.com", "seminoles.com", "emueagles.com", "ksuowls.com",
  "ecupirates.com", "txst.com", "utahutes.com", "cubuffs.com", "fightingillini.com",
  "ualbanysports.com", "liuathletics.com", "miamihurricanes.com", "msuspartans.com",
  "usctrojans.com", "morganstatebears.com", "uclabruins.com", "nevadawolfpack.com",
  "hurstathletics.com", "smumustangs.com", "famuathletics.com", "gseagles.com",
  "ragincajuns.com", "utepminers.com", "niuhuskies.com", "purduesports.com",
  "sjsuspartans.com", "charlotte49ers.com", "appstatesports.com", "calbears.com",
  "missouristatebears.com", "gohuskies.com", "riceowls.com", "cyclones.com",
  "hawkeyesports.com", "utahstateaggies.com", "lsusports.net", "arizonawildcats.com",
  "goaztecs.com", "golobos.com", "hornetsports.com", "olemisssports.com", "gobulldogs.com",
  "goairforcefalcons.com", "goducks.com", "broncosports.com", "osubeavers.com",
  "gostanford.com", "meangreensports.com", "fiusports.com", "wkusports.com", "odusports.com",
]);
export function reviewOfficialFinal(entry: RepairEntry, asOf: string): string[] {
  const r = entry.official, expected: NcaafIdentity = {
    gameId: entry.before.gameId, homeTeamId: entry.before.homeTeamId,
    awayTeamId: entry.before.awayTeamId, kickoffAt: entry.before.kickoffAt,
  };
  const plan = prepareNcaafFinal(entry.input, asOf);
  const reasons: string[] = [];
  if (!validNcaafIdentity(expected)) return ["INVALID_NCAAF_IDENTITY"];
  if (plan.decision !== "ACCEPTED" || !plan.fact) return ["PRIMARY_EVIDENCE_NOT_ACCEPTED", ...plan.reasons];
  if (entry.input.sport !== "NCAAF" || entry.input.espnId !== expected.gameId
    || !sameNcaafIdentity(plan.fact.identity, expected) || !sameNcaafIdentity(r.identity, expected)) reasons.push("IDENTITY_MISMATCH");
  if (r.homeScore !== plan.fact.homeScore || r.awayScore !== plan.fact.awayScore) reasons.push("OFFICIAL_SCORE_CONFLICT");
  if (entry.before.resultId !== null && (entry.before.resultHomeScore !== plan.fact.homeScore
    || entry.before.resultAwayScore !== plan.fact.awayScore)) reasons.push("EXISTING_RESULT_REPLACEMENT_FORBIDDEN");
  if (entry.before.resultId === null && (entry.before.homeScore !== plan.fact.homeScore
    || entry.before.awayScore !== plan.fact.awayScore)) reasons.push("MISSING_RESULT_FIXTURE_CONFLICT");
  try {
    const u = new URL(r.sourceUrl);
    if (u.protocol !== "https:" || u.username || u.password || u.port || u.hash
      || !officialHosts.has(u.hostname.replace(/^www\./, ""))
      || !/\/(?:news\/|sports\/football\/(?:stats|schedule)|boxscore(?:\/|\.aspx))/.test(u.pathname)
      || [...u.searchParams.keys()].some(k => !["id", "path", "season", "type", "print"].includes(k))) {
      reasons.push("UNAPPROVED_OFFICIAL_SOURCE");
    }
  } catch { reasons.push("UNAPPROVED_OFFICIAL_SOURCE"); }
  if (r.representation !== "EXTRACTED_MARKDOWN" || !r.document || Buffer.byteLength(r.document) > 256_000
    || officialDocumentHash(r.document) !== r.documentHash) reasons.push("OFFICIAL_DOCUMENT_HASH_MISMATCH");
  if (!r.finalQuote || r.finalQuote.length < 15 || !r.document.includes(r.finalQuote)
    || !r.homeLabel || !r.awayLabel || r.homeLabel === r.awayLabel
    || !r.finalQuote.includes(r.homeLabel) || !r.finalQuote.includes(r.awayLabel)
    || !new RegExp(`\\b${r.homeScore}\\b`).test(r.finalQuote)
    || !new RegExp(`\\b${r.awayScore}\\b`).test(r.finalQuote)
    || !/(?:final|total|scoring|win|won|defeat|fall|loss|beat|shutout|score|victory)/i.test(r.finalQuote)) {
    reasons.push("REVIEWED_FINAL_QUOTATION_REQUIRED");
  }
  const boundScore = (quotation: string, label: string, expectedScore: number) => {
    if (!quotation || !r.finalQuote.includes(quotation)) return false;
    const text = quotation.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/<[^>]*>/g, " ").replace(/[*_#]/g, "");
    if (text.includes("|")) {
      const cells = text.split("|").map(x => x.trim()).filter(Boolean);
      return cells.length >= 2 && cells[0]!.includes(label) && /^\d+$/.test(cells.at(-1)!)
        && Number(cells.at(-1)) === expectedScore;
    }
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(`${escaped}\\s*(?:\\([A-Za-z. ]{1,15}\\))?\\s*[:–—-]?\\s*(\\d+)\\b`));
    return !!match && Number(match[1]) === expectedScore;
  };
  if (r.scoreLayout === "SCORING_COLUMNS") {
    const lines = r.finalQuote.split("\n");
    const header = lines[0]?.split("|").slice(1,-1).map(s => s.trim()) ?? [];
    const last = lines.at(-1)?.split("|").slice(1,-1).map(s => s.trim()) ?? [];
    const labels = header.slice(-2), scores = last.slice(-2);
    const hi = labels.indexOf(r.homeLabel), ai = labels.indexOf(r.awayLabel);
    if (lines.some(l => !l.startsWith("|")) || last.length !== header.length
      || !/scoring play/i.test(header.join(" ")) || hi < 0 || ai < 0 || hi === ai
      || scores.some(s => !/^\d+$/.test(s)) || Number(scores[hi]) !== r.homeScore
      || Number(scores[ai]) !== r.awayScore || r.homeScoreQuote !== lines.at(-1)
      || r.awayScoreQuote !== lines.at(-1)) reasons.push("TEAM_BOUND_FINAL_SCORE_REQUIRED");
  } else if (r.scoreLayout === "MATCHUP_SCORELINE") {
    const clean = r.finalQuote.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/<[^>]*>/g, " ").replace(/[*_#]/g, "");
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = (first: string, second: string, a: number, b: number, status: string) =>
      new RegExp(`(?:^|\\n)${escape(first)}\\s*\\n\\s*${a}\\s*[-–]\\s*${b}\\s*\\n\\s*(?:at|vs\\.?)\\s*\\n\\s*${escape(second)}(?:\\n|$)`, "i").test(clean)
      && new RegExp(`Status\\s*${status}\\b`, "i").test(clean);
    const scoreline = `${r.homeScore}-${r.awayScore}`, reverse = `${r.awayScore}-${r.homeScore}`;
    if (!(pattern(r.homeLabel, r.awayLabel, r.homeScore, r.awayScore, "Home")
      || pattern(r.awayLabel, r.homeLabel, r.awayScore, r.homeScore, "Away"))
      || ![scoreline, reverse].includes(r.homeScoreQuote) || r.homeScoreQuote !== r.awayScoreQuote
      || !r.finalQuote.includes(r.homeScoreQuote)) reasons.push("TEAM_BOUND_FINAL_SCORE_REQUIRED");
  } else if (r.scoreLayout && r.scoreLayout !== "TEAM_ROWS") reasons.push("UNSUPPORTED_OFFICIAL_SCORE_LAYOUT");
  else if (!boundScore(r.homeScoreQuote, r.homeLabel, r.homeScore)
    || !boundScore(r.awayScoreQuote, r.awayLabel, r.awayScore)) reasons.push("TEAM_BOUND_FINAL_SCORE_REQUIRED");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.gameDate) || r.gameDate !== new Date(expected.kickoffAt)
    .toLocaleDateString("en-CA", { timeZone: "America/New_York" })
    || !r.dateQuote || !r.document.includes(r.dateQuote)
    || !["EXPLICIT_GAME_DATE", "REVIEWED_GAME_DAY_AND_PUBLICATION_DATE"].includes(r.dateBasis)) reasons.push("GAME_DATE_BINDING_REQUIRED");
  if (!["INSTITUTIONAL_BOXSCORE", "INSTITUTIONAL_REPORT", "INSTITUTIONAL_POSTGAME_NOTES"].includes(r.authorship)
    || /\b(?:associated press|\(ap\)|ap news)\b/i.test(r.finalQuote)) reasons.push("INDEPENDENT_AUTHORSHIP_REQUIRED");
  const captured = Date.parse(r.capturedAt), cutoff = Date.parse(asOf);
  if (!Number.isFinite(captured) || !Number.isFinite(cutoff) || captured > cutoff
    || captured <= Date.parse(expected.kickoffAt)) reasons.push("UNSAFE_OFFICIAL_CAPTURE_TIME");
  return reasons;
}
export function validateRepairManifest(m: RepairManifest): string[] {
  if (m.version !== "ncaaf-controlled-repair-v1" || !Array.isArray(m.entries)
    || m.entries.length < 1 || m.entries.length > 64 || !Number.isFinite(Date.parse(m.asOf))) return ["INVALID_BOUNDED_MANIFEST"];
  const ids = new Set<string>(), pairs = new Set<string>(), reasons: string[] = [];
  for (const e of m.entries) {
    try { ncaafRepairRawBefore(e.before.resultId, e.before.rawIsSqlNull, e.before.rawMd5); }
    catch { reasons.push(`${e.before.gameId}:INVALID_SQL_PROVENANCE_BEFOREIMAGE`); }
    if (ids.has(e.before.gameId)) reasons.push("DUPLICATE_EVENT_ID");
    ids.add(e.before.gameId);
    const key = [e.before.homeTeamId, e.before.awayTeamId, e.before.kickoffAt].join(":");
    if (pairs.has(key)) reasons.push("DUPLICATE_PHYSICAL_FIXTURE");
    pairs.add(key);
    reasons.push(...reviewOfficialFinal(e, m.asOf).map(r => `${e.before.gameId}:${r}`));
  }
  return reasons;
}
export function snapshotHash(snapshot: RepairSnapshot, after = false): string {
  const s = clone(snapshot);
  // The hash deliberately excludes its own receipt and the derived raw checksum.
  s.rawMd5 = null;
  if (after && s.result) {
    const raw = { ...ncaaObject(s.result.rawResultJson) };
    delete raw.tbmNcaafHistoricalRepair;
    s.result.rawResultJson = raw;
    if (s.native?.result) {
      const nativeRaw = { ...ncaaObject(s.native.result.raw_result_json) };
      delete nativeRaw.tbmNcaafHistoricalRepair;
      s.native.result.raw_result_json = nativeRaw;
    }
  }
  return ncaafIntegrityHash(s);
}
function beforeMatches(snapshot: RepairSnapshot, b: RepairBefore): boolean {
  const s = clone(snapshot), g = s.game, r = s.result;
  return g.id === b.gameId && g.sport === "NCAAF" && g.status === "final"
    && g.homeTeamId === b.homeTeamId && g.awayTeamId === b.awayTeamId && g.startsAt === b.kickoffAt
    && g.homeScore === b.homeScore && g.awayScore === b.awayScore && g.updatedAt === b.gameUpdatedAt
    && (r?.id ?? null) === b.resultId && (r?.homeScore ?? null) === b.resultHomeScore
    && (r?.awayScore ?? null) === b.resultAwayScore && (r?.updatedAt ?? null) === b.resultUpdatedAt
    && (r?.gradedAt ?? null) === b.gradedAt && (r?.gradingSource ?? null) === b.gradingSource
    && s.rawIsSqlNull === b.rawIsSqlNull && s.rawMd5 === b.rawMd5;
}
function validReceipt(value: unknown, hash: string, id: string): value is RepairReceipt {
  const r = ncaaObject(value), { receiptHash, ...body } = r;
  return r.manifestHash === hash && r.gameId === id && receiptHash === ncaafIntegrityHash(body)
    && !!r.before && typeof r.afterHash === "string";
}
/** Only an explicit caller-supplied, separately approved target/manifest can run.
 * A durable journal must be flushed BEFORE each corresponding DB transition. */
export async function executeNcaafRepair(
  store: RepairStore, journal: RepairJournal, manifest: RepairManifest, approval: RepairApproval,
): Promise<{ gameId: string; outcome: string }[]> {
  const errors = validateRepairManifest(manifest), hash = ncaafIntegrityHash(manifest);
  if (errors.length) throw new Error(`NCAAF_REPAIR_MANIFEST_REJECTED:${errors.join(",")}`);
  const expectedIds = manifest.entries.map(e => e.before.gameId).sort();
  if (approval.manifestHash !== hash || ncaafIntegrityHash([...approval.gameIds].sort()) !== ncaafIntegrityHash(expectedIds)
    || !["APPLY", "ROLLBACK"].includes(approval.operation)) throw new Error("NCAAF_REPAIR_EXACT_APPROVAL_REQUIRED");
  if (approval.operation === "ROLLBACK" && approval.acknowledgeKnownBadBeforeScores !== true) {
    throw new Error("ROLLBACK_WOULD_RESTORE_KNOWN_BAD_FIXTURE_SCORES");
  }
  await store.verifyTarget(approval.target);
  const results: { gameId: string; outcome: string }[] = [];
  for (const entry of manifest.entries) {
    const id = entry.before.gameId, key = `${hash}:${id}`;
    const outcome = await store.transaction(id, async tx => {
      const current = await tx.read(), prior = await journal.get(key);
      if (!current) return "QUARANTINED_MISSING_FIXTURE";
      if (prior && (prior.manifestHash !== hash || prior.gameId !== id)) throw new Error("JOURNAL_IDENTITY_MISMATCH");
      const receipt = ncaaObject(current.result?.rawResultJson).tbmNcaafHistoricalRepair;
      const owned = validReceipt(receipt, hash, id) ? receipt : null;
      if (approval.operation === "ROLLBACK") {
        if (prior?.state === "ROLLED_BACK" || prior?.state === "ROLLBACK_PREPARED" && !owned
          && snapshotHash(current) === snapshotHash(prior.before)) {
          if (prior.state !== "ROLLED_BACK") await journal.put(key, { ...prior, state: "ROLLED_BACK" });
          return "ALREADY_ROLLED_BACK";
        }
        if (!owned || !prior || snapshotHash(prior.before) !== snapshotHash(owned.before)
          || snapshotHash(current, true) !== owned.afterHash) return "QUARANTINED_UNOWNED_OR_CHANGED_POSTIMAGE";
        if (!owned.before.result) return "QUARANTINED_INSERT_ROLLBACK_REQUIRES_DEPENDENCY_REVIEW";
        await journal.put(key, { ...prior, state: "ROLLBACK_PREPARED", receipt: owned });
        await tx.restore(owned.before);
        const restored = await tx.read();
        if (!restored || snapshotHash(restored) !== snapshotHash(owned.before)) throw new Error("ROLLBACK_VERIFICATION_FAILED");
        return "ROLLED_BACK";
      }
      if (prior?.state === "ROLLED_BACK" || prior?.state === "ROLLBACK_PREPARED") return "QUARANTINED_PREVIOUS_ROLLBACK";
      if (owned) {
        if (!prior || snapshotHash(prior.before) !== snapshotHash(owned.before)
          || snapshotHash(current, true) !== owned.afterHash) return "QUARANTINED_CHANGED_POSTIMAGE";
        return "ALREADY_APPLIED";
      }
      if (receipt !== undefined || prior?.state === "APPLIED") return "QUARANTINED_UNOWNED_RECEIPT";
      if (!beforeMatches(current, entry.before)) return "QUARANTINED_STALE_BEFOREIMAGE";
      if (prior && snapshotHash(prior.before) !== snapshotHash(current)) return "QUARANTINED_CHANGED_PREPARED_IMAGE";
      if (Buffer.byteLength(JSON.stringify(current)) > 1_000_000) throw new Error("BEFORE_IMAGE_TOO_LARGE");
      await journal.put(key, { manifestHash: hash, gameId: id, state: "PREPARED", before: clone(current) });
      if (!Number.isFinite(Date.parse(tx.observedAt)) || Date.parse(tx.observedAt) < Date.parse(manifest.asOf)) {
        throw new Error("WRITE_TIME_PRECEDES_EVIDENCE_REVIEW");
      }
      const reconciled = await tx.reconcile(entry.input, tx.observedAt);
      if (!["UPDATED", "INSERTED", "DUPLICATE"].includes(reconciled)) throw new Error(`RECONCILIATION_REFUSED:${reconciled}`);
      const after = await tx.read();
      if (!after?.result || after.game.homeScore !== entry.official.homeScore || after.game.awayScore !== entry.official.awayScore
        || after.result.homeScore !== entry.official.homeScore || after.result.awayScore !== entry.official.awayScore) throw new Error("POSTIMAGE_SCORE_MISMATCH");
      const body = { manifestHash: hash, gameId: id, before: clone(current), afterHash: snapshotHash(after, true),
        primaryHash: ncaaObject(entry.input.ncaafFinalCapture).payloadHash as string,
        officialHash: ncaafIntegrityHash(entry.official), availableAt: tx.observedAt };
      await tx.attach({ ...body, receiptHash: ncaafIntegrityHash(body) });
      return "APPLIED";
    });
    // Transaction has committed. If journaling fails, restart from the durable
    // PREPARED record and the atomically committed receipt, never reapply blindly.
    if (["APPLIED", "ALREADY_APPLIED", "ROLLED_BACK"].includes(outcome)) {
      const record = await journal.get(key);
      if (!record) throw new Error("DURABLE_JOURNAL_MISSING");
      await journal.put(key, { ...record, state: outcome === "ROLLED_BACK" ? "ROLLED_BACK" : "APPLIED" });
    }
    results.push({ gameId: id, outcome });
    if (outcome.startsWith("QUARANTINED")) break;
  }
  return results;
}
