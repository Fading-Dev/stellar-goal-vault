# SQLite Schema Contract

`db.ts` is the authoritative migration runner. `initDb()` applies its
idempotent schema changes to the configured SQLite database on every startup.
Migrations must preserve existing rows and remain safe to run more than once.

The deterministic seed workflow in `seedDeterministic.ts` is a development
reset, not a migration. It atomically clears campaign-owned notifications,
comments, events, pledges, and campaigns (plus `campaigns_fts`) before
inserting its fixed fixtures. It must delete dependent rows before campaigns
and must not be used against production data.

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
- `notifications` references `campaigns(id)` and is cleared by the seed wipe.
- `campaigns_fts` is a derived search index maintained by triggers. It can be
  rebuilt from `campaigns` and is never the source of truth.

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

### Campaign indexes

- `idx_campaigns_creator` on `campaigns(creator)` — creator-scoped lookups.
- `idx_campaigns_deadline` on `campaigns(deadline)` — deadline filtering.
- `idx_campaigns_status` on `campaigns(claimed_at, failed_at, deleted_at)` —
  lifecycle status filters.
- `idx_campaigns_created_at` on `campaigns(created_at)` — listing / seed
  verification ordered by creation time.

### Pledge indexes

- `idx_pledges_campaign_id` on `pledges(campaign_id)` — pledges for a campaign.
- `idx_pledges_contributor` on `pledges(contributor, created_at, id)` —
  contributor history pagination.
- `idx_pledges_campaign_refunded` on `pledges(campaign_id, refunded_at)` —
  active-pledge accounting (`SUM` where `refunded_at IS NULL`), used by migrate
  recomputation and seed regression checks.
- `idx_pledges_campaign_created_id` on `pledges(campaign_id, created_at DESC, id DESC)` —
  ordered pledge lists after seed / API reads.
- `idx_pledges_transaction_hash` unique partial on `pledges(transaction_hash)`
  where `transaction_hash IS NOT NULL`.

### Seed-workflow / FK child indexes

- `idx_notifications_campaign_id` on `notifications(campaign_id)` — speeds
  foreign-key child discovery when the seed wipe deletes campaigns (and any
  campaign-scoped notification lookups).
- `idx_campaign_comments_campaign_id` on `campaign_comments(campaign_id)`.
- `idx_campaign_events_campaign_id` on `campaign_events(campaign_id)`.
- `idx_webhook_dlq_campaign_id` on `webhook_dead_letter_queue(campaign_id)`.
