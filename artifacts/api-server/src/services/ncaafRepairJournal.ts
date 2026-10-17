import { lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { ncaafIntegrityHash } from "./ncaafHistoricalIntegrity";
import type { RepairJournal, JournalRecord } from "./ncaafHistoricalRepair";

/** Private operator filesystem only. Never a mobile/API route or model artifact.
 * fsync + rename + directory fsync makes interrupted runs resumable. */
export async function createNcaafRepairJournal(directory: string): Promise<RepairJournal> {
  const root = resolve(directory);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const info = await lstat(root);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) throw new Error("REPAIR_JOURNAL_PRIVATE_DIRECTORY_REQUIRED");
  const path = (key: string) => join(root, `${ncaafIntegrityHash(key)}.json`);
  return {
    async get(key) {
      try {
        const handle = await open(path(key), constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const stat = await handle.stat();
          if (stat.size > 2_000_000 || !stat.isFile() || (stat.mode & 0o077) !== 0) throw new Error("INVALID_JOURNAL_FILE");
          const raw = JSON.parse(await handle.readFile("utf8")) as { key: string; record: JournalRecord; checksum: string };
          if (raw.key !== key || raw.checksum !== ncaafIntegrityHash(raw.record)) throw new Error("JOURNAL_CHECKSUM_MISMATCH");
          return raw.record;
        } finally { await handle.close(); }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async put(key, record) {
      const temp = join(root, `.${randomUUID()}.tmp`);
      const file = await open(temp, "wx", 0o600);
      try {
        await file.writeFile(JSON.stringify({ key, record, checksum: ncaafIntegrityHash(record) }));
        await file.sync();
      } finally { await file.close(); }
      try {
        await rename(temp, path(key));
        const dir = await open(root, "r");
        try { await dir.sync(); } finally { await dir.close(); }
      } finally { await unlink(temp).catch(error => { if (error.code !== "ENOENT") throw error; }); }
    },
  };
}
