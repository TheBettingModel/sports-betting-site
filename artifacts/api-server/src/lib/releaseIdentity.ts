import { createHash } from "node:crypto";

export type TbmRuntimeRole = "api" | "scheduler";

export interface TbmReleaseIdentity {
  releaseSha: string;
  runtimeRole: TbmRuntimeRole;
  databaseTargetFingerprint: string;
  enforced: boolean;
}

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function getTbmReleaseIdentity(
  expectedRole: TbmRuntimeRole,
): TbmReleaseIdentity {
  const enforced = process.env["TBM_ENFORCE_RELEASE_ID"] === "true";
  const releaseSha = process.env["TBM_RELEASE_SHA"]?.trim() ?? "";
  const runtimeRole = process.env["TBM_RUNTIME_ROLE"]?.trim() ?? "";
  const databaseTargetId = process.env["TBM_DATABASE_TARGET_ID"]?.trim() ?? "";

  if (enforced) {
    if (!/^[0-9a-f]{40}$/i.test(releaseSha)) {
      throw new Error(
        "TBM_RELEASE_SHA must be the exact 40-character Git commit deployed to production",
      );
    }
    if (runtimeRole !== expectedRole) {
      throw new Error(
        `TBM_RUNTIME_ROLE must be "${expectedRole}" for this process`,
      );
    }
    if (!databaseTargetId) {
      throw new Error(
        "TBM_DATABASE_TARGET_ID must identify the shared production database target",
      );
    }
  }

  return Object.freeze({
    releaseSha: releaseSha || "UNSET",
    runtimeRole: expectedRole,
    databaseTargetFingerprint: databaseTargetId
      ? fingerprint(databaseTargetId)
      : "UNSET",
    enforced,
  });
}