# Stage 5.1 (PIM) — supplier data freshness

Owner decision 2026-10-16: the single `freshHours 36` (stage 5) is replaced. The owner imports supplier files weekly.

| Data age | SITE (applies the rule at every read) |
|---|---|
| ≤ `payFreshHours` (72 h) | direct payment as exported by PIM (D-52 quantity limit applies) |
| up to `sellMaxDays` (8 days) | still sold, only through «Очікує підтвердження менеджера», no MonoPay before it |
| older | not orderable; a model without another orderable SKU is hidden (not deleted) until fresh data |

PIM side (branch `hardening/stage-5.1-pim`):

- Owner settings `payFreshHours` / `sellMaxDays` in «Цены», validated (`freshnessPolicyErrors`: whole hours 1–336, whole days 1–60, hiding after direct payment ends); an invalid stored value is never sent (defaults instead).
- Data age = supplier observation time, else the **import time** (`stock_imported_at`, new exported field, schema updated, wire fixture regenerated). Stage 5 counted no age at all for imports without a supplier timestamp — the weekly imports — so PIMC-P2 never fired on real data.
- No export-time downgrade any more (stage 5 PIMC-P2 exported stale IN_STOCK as UNKNOWN = not orderable, which contradicts rule 2); SITE decides by the age, which keeps growing between weekly publications.
- Chunk 0 of every sync batch carries `freshness_policy {version:1, pay_fresh_hours, sell_max_days}`; PIM publishes only to a SITE advertising `freshness_policy_version: 1`; a policy change alone is published.
- Before publication: per supplier «Дані постачальника X застаріють для прямої оплати через N год / товари буде приховано через N днів»; publication stops only when products would be hidden («Скільки товарів буде приховано: N»), the owner can confirm.
- The per-supplier «Попередження про давність» field is removed from the supplier screen (one owner policy); the screen shows the policy.

## Changed existing tests

| Test | Before → after | Why |
|---|---|---|
| `stage5-freshness` (whole file, stage 5 rule) | freshHours 36, 24 h warning, 37 h → UNKNOWN + publication block → payFreshHours 72 / sellMaxDays 8 with validation; 2 h / 73 h / 9 days classes and warnings; import time as the age; manual stock | owner replaced the stage 5 rule; every old assertion encoded the replaced numbers or the export-time downgrade |
| `order-policy` «stage 5 freshness … PIMC-P2» | 90-day stock exported UNKNOWN; supplier limit 1 h → UNKNOWN → 90-day stock exported IN_STOCK with `stale_source` and class `hidden` (SITE hides it); a supplier limit no longer applies; import time gives the age | the downgrade at export is removed by the owner rule; the age decision moved to SITE |
| `order-policy` «supplier freshness control renders …» | supplier screen has the `stock_freshness_hours` input → no such input; the screen states the owner policy | one owner policy instead of per-supplier limits |
| `final-workflow` / `stage5-private-costs` / `stage5-remote-backup` mock SITE | capabilities without → with `freshness_policy_version: 1` | the real SITE now advertises it; PIM refuses a SITE that does not apply the rule (new test covers the refusal) |
| `final-workflow` «committed exact wire fixture is byte-identical …» | unchanged test; fixture regenerated (`stock_imported_at: null` per SKU, `stock_warning_hours` 36 → 72) | the exporter output changed; SITE `contracts/pim-v3/2/wire.exact.json` is the same file |

New: `final-workflow` «stage 5.1: the owner freshness policy travels in chunk 0 …»; `stage5-freshness` «an offer without any data time is not «fresh» (fail closed, like SITE)».

Security review (stage 5.1): no CRITICAL/HIGH. M3 (no data time = fresh forever) fixed on both sides: an offer without any data time is counted as sold after the manager confirms; SITE also treats a time more than a day ahead that way.

Tests: 715/715 (`npm test`), npm audit 0. Release archive `rubizh-pim-10.9.3-final-workflow.zip` repacked in place (sha256 file updated).
