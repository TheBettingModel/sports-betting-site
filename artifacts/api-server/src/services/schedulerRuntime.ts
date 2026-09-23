import type { Logger } from "pino";

const MEBIBYTE = 1024 * 1024;

export type SchedulerMemorySnapshot = {
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  externalMb: number;
  arrayBuffersMb: number;
};

export function schedulerMemorySnapshot(): SchedulerMemorySnapshot {
  const usage = process.memoryUsage();
  const mb = (bytes: number) => Math.round((bytes / MEBIBYTE) * 10) / 10;
  return {
    rssMb: mb(usage.rss),
    heapUsedMb: mb(usage.heapUsed),
    heapTotalMb: mb(usage.heapTotal),
    externalMb: mb(usage.external),
    arrayBuffersMb: mb(usage.arrayBuffers),
  };
}

export function logSchedulerMemory(
  logger: Logger,
  input: {
    jobName: string;
    phase: "start" | "batch" | "end" | "skipped";
    startedAt?: number;
    batchSize?: number;
    batchNumber?: number;
    blockedBy?: string;
  },
): void {
  logger.info(
    {
      jobName: input.jobName,
      phase: input.phase,
      batchSize: input.batchSize,
      batchNumber: input.batchNumber,
      blockedBy: input.blockedBy,
      durationMs: input.startedAt == null
        ? undefined
        : Math.round(performance.now() - input.startedAt),
      memory: schedulerMemorySnapshot(),
    },
    "Scheduler memory telemetry",
  );
}

export class SingleFlightGroup {
  private owner: string | null = null;

  acquire(jobName: string): { acquired: true } | { acquired: false; blockedBy: string } {
    if (this.owner !== null) return { acquired: false, blockedBy: this.owner };
    this.owner = jobName;
    return { acquired: true };
  }

  release(jobName: string): void {
    if (this.owner === jobName) this.owner = null;
  }

  currentOwner(): string | null {
    return this.owner;
  }
}

export async function processInBatches<T>(
  values: readonly T[],
  batchSize: number,
  processBatch: (batch: readonly T[], batchNumber: number) => Promise<void>,
): Promise<void> {
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error("batchSize must be a positive integer");
  }
  let batchNumber = 0;
  for (let index = 0; index < values.length; index += batchSize) {
    batchNumber++;
    await processBatch(values.slice(index, index + batchSize), batchNumber);
  }
}