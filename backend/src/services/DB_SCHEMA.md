# SQLite Schema Contract

`db.ts` is the authoritative migration runner. `initDb()` applies its
idempotent schema changes to the configured SQLite database on every startup.
Migrations must preserve existing rows and remain safe to run more than once.

## Ownership and invariants

- `campaigns` owns campaign lifecycle state. `pledged_amount` is the cached
  accounting total for non-refunded rows in `pledges`; lifecycle changes are
  represented by `claimed_at`, `failed_at`, and `deleted_at`.
- `pledges` owns contribution records. `transaction_hash` is unique when
  present, `campaign_id` references `campaigns(id)`, and a refunded pledge is
  excluded from the campaign's pledged total.
- `campaign_events` is the append-only history for campaign lifecycle and
  accounting changes. Blockchain metadata is optional for local events.
- `campaign_comments` owns user feedback. `campaign_id` references
  `campaigns(id)` and `deleted_at` is a soft-delete marker; comment rows are
  not physically removed as part of normal lifecycle operations.
- `campaigns_fts` is a derived search index maintained by triggers. It can be
  rebuilt from `campaigns` and is never the source of truth.

## Query-layer integrity constraints (#888)

The query layer (`getPledgesByContributor` and related reads) assumes persisted
rows already satisfy a safe subset of application invariants. Those invariants
are enforced at the database layer:

| Table | Constraint (safe subset) |
| --- | --- |
| `campaigns` | non-empty `creator`/`title`/`description`/`accepted_tokens_json`; `target_amount > 0`; `pledged_amount >= 0`; positive `deadline`/`created_at`; mutually exclusive `claimed_at`/`failed_at`; `max_per_contributor` null or `>= 0` |
| `pledges` | non-empty `campaign_id`/`contributor`/`asset_code`; `amount > 0`; positive `created_at`; `refunded_at` null or `>= created_at` |
| `campaign_events` | non-empty `campaign_id`/`event_type`; positive `timestamp`; `amount` null or `>= 0` |
| `campaign_comments` | non-empty `campaign_id`/`author`/`content`; positive `created_at` |

Fresh databases receive these as `CHECK` constraints on `CREATE TABLE`. Existing
databases receive equivalent `BEFORE INSERT/UPDATE` triggers
(`*_query_integrity_*`) because SQLite cannot add `CHECK` via `ALTER TABLE`.
Valid historical rows migrate unchanged; invalid inserts/updates are aborted.

Query helpers also clamp pagination (`page >= 1`, `1 <= limit <= 100`) so
`LIMIT`/`OFFSET` cannot go negative or unbounded.

## Migration expectations

Use `CREATE TABLE/INDEX/TRIGGER IF NOT EXISTS` for new objects and guarded
`ALTER TABLE` changes for existing objects, following the patterns in
`db.ts`. Additive changes must account for databases created by older
versions, backfill only when the existing data has a clear default, and avoid
rewriting lifecycle or accounting history. Update the focused database test
when a schema object or invariant changes.

## Index Strategy

Indexes are added based on concrete query plans for common read/write patterns.
All indexes use `CREATE INDEX IF NOT EXISTS` to ensure idempotence.

### Campaign Indexes

- `idx_campaigns_creator` on `campaigns(creator)`
- `idx_campaigns_deadline` on `campaigns(deadline)`
- `idx_campaigns_status` on `campaigns(claimed_at, failed_at, deleted_at)`

### Pledge Indexes

- `idx_pledges_campaign_id` on `pledges(campaign_id)`
- `idx_pledges_contributor` on `pledges(contributor, created_at, id)`
- `idx_pledges_transaction_hash` unique partial index on `pledges(transaction_hash)` where not null

### Comment Indexes

- `idx_campaign_comments_campaign_id` on `campaign_comments(campaign_id)`
