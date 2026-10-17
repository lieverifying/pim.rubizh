# Stage 5.2 (PIM) — clean catalog from supplier files (REHEARSAL)

Owner decision 2026-10-17: the site does not sell yet; the PIM catalog is replaced by a new catalog built from the five
supplier files; PIM settings (suppliers, markups, discount floor, donation, freshness 72 h / 8 days, supplier profiles) are
kept. The files are 2–3 weeks old: the catalog is for debugging the import and owner decisions, not for the launch.
Supplier files and every output stay outside git (`~/Projects/rubizh-supplier-files/out`, mode 700/600).

## Defects found and fixed (regression-first)

| # | Defect | Fix | Test (RED on `pim-stage-5.1-verified`) |
|---|---|---|---|
| 1 | Without a per-offer supplier time the data age was the PIM **import time**: a three-week-old file imported today looked fresh (direct payment) | data time = the file's generation date inside it (YML `yml_catalog@date`, XLSX document properties), else its modification time (`File.lastModified` / HTTP `Last-Modified`); zoneless dates are Kyiv wall time; future (> 5 min) and pre-2020 dates ignored, never clamped; a header later than the file yields to the file time; a header older than the file by more than `payFreshHours` is kept and shown as a warning on the import screen | `stage52-source-time`: Kyiv time, file-time choice, 3-week YML → hidden / 80 h → manager / 2 h → fresh, mtime and XLSX, no date → manager only |
| 2 | Products created from the import queue (every product of a clean catalog) lost the offer's times (`stock_observed_at`, provenance, `source_updated_at`, `expires_at`): the queue item did not carry them | queue items carry them; `attachItem` copies them into the offer | `stage52-source-time`: «a new product created from the import queue keeps the data times» |
| 3 | A price jump held for review kept the old file time next to fresh availability | the offer update writes the new file time with the other times | `stage52-source-time`: «a price jump held for review …» |
| 4 | A product created from the queue had no `last_valid_inventory_observation` (only the 10.9.3 migration added it later), so restoring the catalog into a clean profile changed it and there was no fallback for an unreadable availability in the next file | `attachItem` (classification layer) stores it like an updated offer does | `stage52-source-time`: «a product created from the queue keeps the last confirmed availability» |

Rejected on purpose: making the file time decide which stock wins (an older file must not overwrite newer stock). A supplier
generator that never updates its header date (seen in a real feed) would then never update stock. Test: «a file with an
unchanged header date still updates the stock».

Wire (SITE contract): no new field. `stock_imported_at` (legacy name) now carries the file time; SITE reads it as the
fallback data time (`shop/stock-freshness.php`) — no SITE change. `stock_observed_at` stays the supplier's own time only
(SITE also uses it for reservations).

## Changed existing tests

| Test | Before → after | Why |
|---|---|---|
| `stage5-freshness` «no supplier time of its own: the import time is the data age …» | import time gives the age → the file time gives the age; import time alone → no age → manager confirmation | owner rule of stage 5.2 replaces the 5.1 fallback |
| `order-policy` «stage 5.1 freshness …» last step | `stock_data_age_hours<0.1` from the import time (also true for `null`) → exactly `null` for the import time alone, and 5 h from a file time | the old assertion passed vacuously (`null<0.1`); the rule changed |

New: `stage52-source-time` (11 tests: incl. security-review and code-review items), `stage5-freshness` +1 (unknown data time counted on the publication screen); registered in `npm test`.

## Rehearsal tooling (`audit/`, no supplier data in git)

- `rehearsal-5-2.cjs` — owner settings (settings-only copy of the owner backup) → migration → approved price policy →
  catalog reset (settings kept) → five imports through the shipped pipeline with real file times → private quality report
  and owner-decision examples → the standard PIM backup (`backupDl`).
- `rehearsal-5-2-verify.cjs` — restore of that backup into a clean profile (recovery path + 10.9.3 migration) and through
  «Восстановить из файла» in a migrated PIM; catalog, settings and counts compared; quality report from the restored catalog.
- `light-xml-parser.cjs` — Node-only memory-light DOMParser for XML feeds (linkedom needed several GB on an 8 GB machine);
  `parseYml` output byte-identical to linkedom on three real feeds. The browser keeps its native parser.

Not fixed (recorded for the owner / next stage, see SITE `docs/release/KNOWN_ISSUES.md` S52-*): YML currency not read,
`parseNum` «1.250» ambiguity, XLSX date cells as Excel serials, unknown availability text → «нет» on the legacy path,
photos capped at 15 and `//` URLs dropped, duplicate SKU rows overwrite the queue key — none of them occurs in the five
rehearsal files (checked: all UAH, integer or 2-decimal prices, no missing prices).

Reviews: silent-failure-hunter (four leaks fixed above, the rest recorded), security-reviewer (no CRITICAL/HIGH; MEDIUM: unverifiable header / server time = download time → shown as unverified; LOW fixed), code-reviewer APPROVE (MEDIUM: publication notice for unknown data time, scheduled-fetch warning → fixed).

Rehearsal (private, `~/Projects/rubizh-supplier-files/out/run6`): 5 files, 8202 rows → 4232 products / 8191 SKUs / 11 in the queue; restore into a clean profile and through «Восстановить из файла» give the same catalog, the same settings and counts equal to the backup; no credentials in the backup; 0 network requests; AUTOPRICES off. The catalog reset keeps every business setting; it clears only undo history, site sync state and the site category hash and turns on model colours (by design).

Tests: 727/727, npm audit 0, build reproducible (three builds, one sha256, equal to the committed HTML), release archive repacked.
