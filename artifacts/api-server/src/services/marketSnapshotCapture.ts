import { and, eq } from "drizzle-orm";
import {
  db,
  marketsTable,
  oddsSnapshotsTable,
  sportsbooksTable,
} from "@workspace/db";
import {
  displayBookName,
  isValidAmericanOdds,
  type BookmakerLine,
  type GameOdds,
} from "./oddsApi";

const PROVIDER_OBSERVATION_MAX_AGE_MS = 30 * 60 * 1000;
const SHARP_BOOK_SLUGS = new Set(["pinnacle", "circasports"]);

export function isSharpBookSlug(slug: string): boolean {
  return SHARP_BOOK_SLUGS.has(slug);
}

export type MoneylineSnapshotRow = {
  sportsbook: string;
  isSharp: boolean;
  selection: "home" | "away" | "draw";
  price: number;
  capturedAt: Date;
};

/**
 * Build complete, same-book moneyline rows from The Odds API's named quotes.
 * Consensus prices are intentionally excluded: Analytics needs a real
 * sportsbook identity and sharp status, not a derived market average.
 */
export function buildMoneylineSnapshotRows(
  sport: string,
  bookmakerOdds: readonly BookmakerLine[],
  now = new Date(),
): MoneylineSnapshotRow[] {
  const soccer = sport === "Soccer";
  const rows: MoneylineSnapshotRow[] = [];

  for (const book of bookmakerOdds) {
    const providerUpdatedAt = book.lastUpdate ? new Date(book.lastUpdate) : null;
    if (providerUpdatedAt && (
      !Number.isFinite(providerUpdatedAt.getTime())
      || providerUpdatedAt.getTime() > now.getTime()
      || now.getTime() - providerUpdatedAt.getTime() > PROVIDER_OBSERVATION_MAX_AGE_MS
    )) {
      continue;
    }
    if (!isValidAmericanOdds(book.homeOdds) || !isValidAmericanOdds(book.awayOdds)) continue;
    if (soccer && !isValidAmericanOdds(book.drawOdds)) continue;

    const isSharp = isSharpBookSlug(book.book);
    const observationAt = providerUpdatedAt ?? now;
    rows.push(
      { sportsbook: book.book, isSharp, selection: "home", price: book.homeOdds, capturedAt: observationAt },
      ...(soccer && book.drawOdds != null
        ? [{ sportsbook: book.book, isSharp, selection: "draw" as const, price: book.drawOdds, capturedAt: observationAt }]
        : []),
      { sportsbook: book.book, isSharp, selection: "away", price: book.awayOdds, capturedAt: observationAt },
    );
  }

  return rows;
}

/**
 * Persist one complete named-book observation for every supported sport.
 * This is research evidence only; it does not create a pick or publication
 * record. Repeated scheduler runs are safe because each observation carries
 * its provider event and server receipt timestamp.
 */
export async function captureOddsApiMoneylineSnapshots(input: {
  sport: string;
  gameId: string;
  eventStart: string;
  odds: GameOdds | null;
  capturedAt?: Date;
}): Promise<number> {
  if (!input.odds?.providerEventId) return 0;
  const eventStart = new Date(input.eventStart);
  const capturedAt = input.capturedAt ?? new Date();
  if (!Number.isFinite(eventStart.getTime()) || capturedAt >= eventStart) return 0;

  const rows = buildMoneylineSnapshotRows(input.sport, input.odds.bookmakerOdds, capturedAt);
  if (rows.length === 0) return 0;

  const [market] = await db.select({ id: marketsTable.id })
    .from(marketsTable)
    .where(eq(marketsTable.slug, "moneyline"))
    .limit(1);
  if (!market) throw new Error("Odds API snapshot capture requires moneyline reference market");

  return db.transaction(async (tx) => {
    const uniqueBooks = [...new Map(rows.map((row) => [row.sportsbook, row])).values()];
    for (const row of uniqueBooks) {
      await tx.insert(sportsbooksTable).values({
        slug: row.sportsbook,
        name: displayBookName(row.sportsbook),
        isSharp: row.isSharp,
      }).onConflictDoUpdate({
        target: sportsbooksTable.slug,
        set: { isSharp: row.isSharp },
      });
    }

    const books = await tx.select({
      id: sportsbooksTable.id,
      slug: sportsbooksTable.slug,
    }).from(sportsbooksTable).where(
      // The slug set is generated from provider data, never from request text.
      // Keeping the lookup in one query also prevents partial book identity.
      eq(sportsbooksTable.isActive, true),
    );
    const bookIdBySlug = new Map(books.map((book) => [book.slug, book.id]));
    const values = rows.flatMap((row) => {
      const sportsbookId = bookIdBySlug.get(row.sportsbook);
      if (!sportsbookId) return [];
      return [{
        gameId: input.gameId,
        sportsbookId,
        marketId: market.id,
        selection: row.selection,
        price: row.price,
        line: null,
        capturedAt: row.capturedAt,
        source: "odds-api",
        providerEventId: input.odds!.providerEventId!,
        marketStatus: "open",
        isAvailable: true,
        isStale: false,
        isBestAvailable: false,
      }];
    });
    if (values.length === 0) return 0;
    await tx.insert(oddsSnapshotsTable).values(values).onConflictDoNothing();
    return values.length;
  });
}