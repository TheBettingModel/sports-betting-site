import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/**
 * Read-only release gate. Production migrations are applied separately, never
 * while the API is starting or handling a request.
 */
export async function assertRequiredProductionSchema(): Promise<void> {
  const result = await db.execute<{ item: string }>(sql`
    WITH required_tables(name) AS (
      VALUES
        ('v4_market_evidence'),
        ('v4_artifact_model_version_mappings'),
        ('v4_official_decision_revisions')
    ),
    required_columns(table_name, column_name) AS (
      VALUES
        ('v4_forecast_versions', 'model_family'),
        ('v4_forecast_versions', 'artifact_id'),
        ('v4_forecast_versions', 'input_contract_version'),
        ('v4_forecast_versions', 'input_hash'),
        ('v4_forecast_versions', 'configuration_hash'),
        ('v4_forecast_versions', 'parameter_hash'),
        ('model_predictions', 'market')
    )
    SELECT 'table:' || name AS item
      FROM required_tables
      WHERE to_regclass('public.' || name) IS NULL
    UNION ALL
    SELECT 'column:' || required_columns.table_name || '.' || required_columns.column_name AS item
      FROM required_columns
      LEFT JOIN information_schema.columns actual
        ON actual.table_schema = 'public'
        AND actual.table_name = required_columns.table_name
        AND actual.column_name = required_columns.column_name
      WHERE actual.column_name IS NULL
    ORDER BY item
  `);

  if (result.rows.length > 0) {
    throw new Error(
      `Required production schema missing: ${result.rows.map((row) => row.item).join(", ")}`,
    );
  }
}