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

## Changed pre-existing tests

| Test | Before → after | Order item | Why |
|---|---|---|---|
| order-policy «age and supplier warning thresholds never change valid stock or payment» | 90-day-old stock IN_STOCK, payable; supplier limit 1 h still IN_STOCK → 90 days: UNKNOWN, not payable; 25 h: IN_STOCK; supplier limit 1 h with 2 h: UNKNOWN; no observation: IN_STOCK (renamed) | 5-4 freshness, PIMC-P2 | the old rule «age never changes payment» is what the owner reversed |
| order-policy «missing or invalid stock … expiry only follows explicit source expiry» | last step reused the 90-day observation → that step now uses a 1-hour-old observation (renamed) | 5-4 freshness | the step checks a future explicit expiry, not age |
| inventory-policy «new queued model retains mapped size, status column and actual observation provenance» | observed 2026-10-01 (15 days old) → observed 1 hour ago | 5-4 freshness | the test checks provenance and payment; with a 15-day-old observation payment is now (correctly) refused |
