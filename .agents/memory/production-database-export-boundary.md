---
name: Production database export boundary
description: Safety rules for moving the managed Replit production dataset into Neon during the cloud cutover.
---

Treat a database connection as the production migration source only after a custom-format dump contains the known live application tables, including games, model predictions, and published picks. The existing legacy Neon database is not that source.

The destination Neon project must support a branch larger than the live dataset. Its free-plan 512 MiB branch limit is insufficient because one production NCAAF observations table alone is roughly 3.5 GB.

**Why:** The live Replit production read replica contains a large, materially different dataset. Repeatedly supplied connection values resolved either to the four-table legacy Neon database or were not PostgreSQL URLs. Reconstructing this dataset through row-by-row query callbacks would risk incomplete data, broken sequences, and lost constraint fidelity. Even a valid compressed dump cannot restore into an undersized branch.

**How to apply:** Obtain the full PostgreSQL URI from the Replit Database tool while explicitly viewing Production. Use a PostgreSQL client matching the server major version, create a compressed `pg_dump`, and validate expected table names before restoring to an isolated Neon branch. Confirm destination capacity exceeds the uncompressed logical dataset before restore. Never cut Render, Vercel, mobile, or scheduler ownership to an empty or legacy-only database.