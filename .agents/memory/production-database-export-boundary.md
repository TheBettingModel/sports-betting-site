---
name: Production database export boundary
description: Safety rules for moving the managed Replit production dataset into Neon during the cloud cutover.
---

Treat a database connection as the production migration source only after a custom-format dump contains the known live application tables, including games, model predictions, and published picks. The existing legacy Neon database is not that source.

**Why:** The live Replit production read replica contains a large, materially different dataset, including a multi-gigabyte NCAAF observations table. Repeatedly supplied connection values resolved either to the four-table legacy Neon database or were not PostgreSQL URLs. Reconstructing this dataset through row-by-row query callbacks would risk incomplete data, broken sequences, and lost constraint fidelity.

**How to apply:** Obtain the full PostgreSQL URI from the Replit Database tool while explicitly viewing Production. Use a PostgreSQL client matching the server major version, create a compressed `pg_dump`, and validate expected table names before restoring to an isolated Neon branch. Never cut Render, Vercel, mobile, or scheduler ownership to an empty or legacy-only database.