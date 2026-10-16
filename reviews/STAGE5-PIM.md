# Stage 5 — PIM (owner order 2026-10-16), branch hardening/stage-5-pim

Base: fix/pimc-p1 `5fd46cb` (684/684 tests). Owner explicitly allowed PIM **code** changes in this branch; no real PIM
data, no PIM sync, no AUTOPRICES, no production. All tests use synthetic catalogs and mocked network.

## Decisions

### Freshness and PIMC-P2 (stale stock)
- `freshHours` = 36 (default unchanged; now also the default freshness limit of every supplier without its own
  `stock_freshness_hours`). Warning threshold `FRESH_WARN_HOURS` = 24.
- **Downgrade:** a supplier observation of `IN_STOCK` older than the limit is exported as `UNKNOWN` (no stock quantity,
  `payment_allowed:false`, `requires_order_confirmation:true`). Only IN_STOCK is downgraded: OUT_OF_STOCK, PREORDER and
  ORDER_ON_REQUEST already need no payment-time trust. A stock set by hand (manual fields/locks) is not downgraded.
- The availability change changes the model hash (`finalModelHash` still drops only the read-time fields
  `stock_data_age_hours` / `stale_source`), so the next publication carries the downgrade to SITE.
- **Before publication:** «На сайт» shows a warning panel when any READY product's supplier data is older than 24 h, and a
  blocking panel when older than 36 h with «Скільки товарів стане недоступними: N». `finalPublish` refuses with
  `STALE_DATA` unless the owner presses «Опубликовать всё равно» (confirm dialog repeats the counter).
- An offer without any observation time (only `imported_at`) has no age and is not downgraded (unchanged behaviour; SITE
  keeps its own checkout age check).

### PIMC-P3 / PIMC-P4
- P3 applied as proposed (broken/invalid photos removed from colour galleries before the decision and the export).
- P4 narrower than the proposal: a COLOR size catalog drops only sizes that colour sells as a real SKU; a MODEL catalog drops
  a size only when **every** colour sells it. The proposal kept every MODEL size as an option, which repeated real SKUs as
  request options and broke `clean-import-hardening` («real SKUs … are not repeated as options»).

### OD-4.1 private payouts (5-2)
- `pimSitePrivateCosts()` → `rubizh-pim-private-costs` v1 (schema = SITE `contracts/pim-private-costs/1/schema.json`),
  sent to `POST /api/pim/costs` only after a COMMITTED publication; failure → `siteSync.costsError`, toast; publication stands.
- The exact fixture `contracts/fixtures/pim-site-private-costs-v1.exact.json` comes from the exporter on the same synthetic
  catalog as the wire fixture (`tools/export-private-costs-fixture.cjs`). SITE's hand-written `fixture.json` differs in
  values — SITE should adopt this file as its fixture.

### Automatic backup outside IndexedDB (5-4)
- Copy = `backupData()` (config sanitized: no `key`/`keyNext`/passwords/tokens; no `auth/` rows) + journal + doc files,
  gzip, `X-Backup-Sha256`, `X-Backup-Label`. Refused client-side if the text contains the current or next key.
- Triggers: after every COMMITTED publication; after a new daily copy («Ежедневная»), at most one upload per 6 h
  (`autobak_meta/remote`). Failures → `siteSync.backupError`, never block.
- «Копії на сайті» on the backup screen: list, «Зробити копію зараз», «Відновити» → sha256 check → `applyRestoreData`
  (local copy first) → site credentials kept (and `auth/site_credentials`), `RubizhReleaseStorage.gates` (site auto,
  sync, autoprices, supplier sources off).

### pim_key rotation (5-4)
- «Новий ключ» = `siteApi.keyNext`, kept in `auth/site_credentials`, never in portable copies. A 401 with the main key is
  retried once with the next key → «Зробіть новий ключ основним». «Перевірити» needs `/pim/status` `key_slot:'next'`;
  «Зробити основним» moves it. Procedure on SITE: `pim_key_next` → PIM check → promote → SITE `pim_key` = new, clear next.

## Changed pre-existing tests

| Test | Before → after | Order item | Why |
|---|---|---|---|
| order-policy «age and supplier warning thresholds never change valid stock or payment» | 90-day-old stock IN_STOCK, payable; supplier limit 1 h still IN_STOCK → 90 days: UNKNOWN, not payable; 25 h: IN_STOCK; supplier limit 1 h with 2 h: UNKNOWN; no observation: IN_STOCK (renamed) | 5-4 freshness, PIMC-P2 | the old rule «age never changes payment» is what the owner reversed |
| order-policy «missing or invalid stock … expiry only follows explicit source expiry» | last step reused the 90-day observation → that step now uses a 1-hour-old observation (renamed) | 5-4 freshness | the step checks a future explicit expiry, not age |
| inventory-policy «new queued model retains mapped size, status column and actual observation provenance» | observed 2026-10-01 (15 days old) → observed 1 hour ago | 5-4 freshness | the test checks provenance and payment; with a 15-day-old observation payment is now (correctly) refused |
