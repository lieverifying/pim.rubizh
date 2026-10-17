# Stage 5.4 (PIM) — moderation auto-rules and the owner's decisions on the 5.2 rehearsal

Owner decisions 2026-10-17 (recorded in SITE `docs/release/KNOWN_ISSUES.md` S54-01…06): M-WIN — the date inside the file
is ignored for M-WIN only (data time = download time); UKR-TEC — sizes from the description and characteristics; goods
priced per m² — shown on the site without the cart, «Розрахувати вартість» → wholesale request D-54; restricted goods stay
rejected; moderation — automatic rules first (this stage), the rest by hand. Supplier files and every rehearsal output stay
outside git (`~/Projects/rubizh-supplier-files/out`, mode 700/600).

## Rules (regression-first: `app/tests/stage54-moderation.test.cjs`, 15 tests, all RED on `pim-stage-5.2-verified`)

| Rule | Where | Fires only when | Never |
|---|---|---|---|
| Model grouping «colour slices» (`colour-slices-supplier-codes`, `colour-slices-specific-name`) | `lib/model-colors-ui.inc.js` `mcColourSliceRule` | one supplier; every card exactly one real colour, no colour twice; specific model name (3+ words with a proper/quoted/Latin/numbered name, brand words do not count); full description (200+ characters) and supplier category (non-empty) equal except colour words (generic colour forms or the cards' own colour names with inflections, at most 4 differing words); one distinct supplier group code per card not shared with any card outside the group, or no codes at all; no blocker of `mcReasons` (cells, attributes, category, brand, locks, variant limit) | per-m² cards; same-size sub-buckets; a generic name («Футболка Kiborg», «Підсумок під турнікет»); a differing material/class/feature word; a colourless card; a supplier code shared with cards outside the group (M-WIN: one code per colour with its sizes) |
| Category «supplier-category consensus» (`supplier-category-consensus`) | `lib/classification-ui.inc.js` `categoryConsensusPass` (after each import) | LIKELY product (dictionary suggestion X); in each of its supplier categories (same supplier, non-empty) 10+ products were confirmed (SAFE_AUTO, not by this rule) and 95%+ of them are X; its title alone points to no other confirmed category | AMBIGUOUS; manual locks / confirmed mappings; an empty supplier category; another supplier's category; it lapses back to the owner when the evidence is gone |
| Sizes from the description | `lib/size-evidence.js` `fromText` | «Розміри: 44-60р» (the «р/рр» suffix no longer cuts the range to «44»); a «Розмірна сітка: 40р. - 26 см …» table of 3+ ascending rows (model sizes, manager confirms per order); an explicit list wins over a table | a generic table «на все взуття нашого виробництва»; dimensions («28х20х12 см») |
| UKR-TEC: supplier setting `sizes_from_description` | `lib/final-workflow.inc.js` `finalDecision` | a sized SKU of that supplier without SKU size or model sizes → reason `size` («розмір уточнюється», moderation) | other suppliers (unchanged) |
| M-WIN: supplier setting `source_time_ignore_header` | `lib/workflow.inc.js` `sourceTimeForSupplier` | data time = download time (fetch moment, else the saved file's time), import screen note «дата всередині файлу ігнорується за рішенням власника»; the byte-identical file again keeps the previous data time (FILE_UNCHANGED) | without any download time — no data time (manager only); other suppliers (unchanged) |
| Per-m² goods → QUOTE | `lib/final-workflow.inc.js` `finalWireProduct`, `pimSiteWire` | no `price_unit` moderation; SKU `sale_mode: QUOTE`, ordering/payment off, `price_unit: m2` only for an explicit per-m² price; no size options; sent only to a SITE with `quote_sale_version: 1` (else hidden there) | the cart, MonoPay |

Settings: both supplier settings are owner checkboxes in the supplier's source panel and are kept in the portable backup.

## Rehearsal 5.2 → 5.4 (same five files, same owner settings; private report `out/run9/rehearsal-report.json`)

| | 5.2 | 5.4 |
|---|---|---|
| READY / MODERATION / REJECTED | 1477 / 1964 / 31 | 1636 / 1229 / 31 |
| Active cards (models) | 3472 | 2896 |
| «grouping» reasons | 3119 | 1439 |
| «category» reasons | 520 | 399 |
| «price_unit» reasons | 47 | 0 (QUOTE) |
| «size» reasons (UKR-TEC only, new) | — | 161 |

Colour slices: 277 new models from 576 cards; consensus: 12 categories confirmed; SKUs and the import queue unchanged
(8191 / 11). Data time of M-WIN: the download date (03.10, still older than 8 days on 17.10). The 20-model sample for the
owner: `out/run9/auto-merge-sample.json`.

## Stage 5.4.1 — owner decisions on the 5.4 questions (2026-10-17)

| Decision | Change | Tests |
|---|---|---|
| Per-m² nets of one kind in different colours — one model with a colour choice, still QUOTE | rule `colour-slices-quote` (`lib/model-colors-ui.inc.js`): per-m² cards only, never together with fixed-price cards; a generic name is allowed (the rest of the evidence still applies); a supplier group code shared with that colour's fixed sizes (M-WIN) does not block | `stage54-moderation` +2; `clean-import-hardening` M-WIN antidrone (the per-m² cards now form one quote model) |
| UKR-TEC without a found size — sold as in 5.2 (request, the manager confirms the size), no size moderation | `finalDecision` no longer raises `size` for `sizes_from_description`; the setting is gone from the supplier panel (an old backup value is harmless) | `stage54-moderation` UKR-TEC test rewritten |
| QUOTE models in the sitemap while shown | SITE (`59ea7e4`) | SITE `stage54-quote` |
| Kiborg merges | no change — waits for the owner's check of the 20-model sample | — |

Rehearsal 5.4 → 5.4.1 (same five files, same owner settings; private report `out/run10/rehearsal-report.json`, 44 min):

| | 5.4 (`run9`) | 5.4.1 (`run10`) |
|---|---|---|
| READY / MODERATION / REJECTED | 1636 / 1229 / 31 | 1723 / 1129 / 31 |
| Active cards (models) | 2896 | 2883 |
| «grouping» reasons | 1439 | 1410 |
| «category» reasons | 399 | 399 |
| «size» reasons (UKR-TEC) | 161 | 0 |
| UKR-TEC READY / MODERATION | 207 / 204 | 293 / 118 |
| QUOTE models: M-WIN / Kiborg | 26 / 21 | 16 / 18 |

New `colour-slices-quote` models: M-WIN 1 (10 cards), Kiborg 1 (3 cards). SKUs, queue and content unchanged (8191 / 11 / 3017);
no secrets in the backup. Restore check (`audit/rehearsal-5-2-verify.cjs`, private `out/run10/restore-and-quality.json`):
clean profile (migration pending → ready, writable) and the owner's «Восстановить из файла» give the same catalog, settings
and counts (4232 / 8191 / 11 / 3017). The site wire of the two paths differs only in build-time fields — `generated_at` and
`variants[].stock_data_age_hours` (5384 SKU, e.g. 334.58 → 334.72 h: the age at the moment each wire is built); the verify
script now reports this field by field (`wire_difference`; the same inequality in 5.2/5.4 had no breakdown). Tests 744/744.

## Changed existing tests

| Test | Before → after | Why |
|---|---|---|
| `clean-import-hardening` «made-to-measure nets priced per square metre …» and two M-WIN net tests | per-m² card is MODERATION with `price_unit` → it is not an owner question; its wire SKU is `QUOTE` / `m2`, not orderable, not payable; still never merged | owner decision S54-03 (the assertions are stricter: wire flags, not only a reason code) |
| `stage54-moderation` «UKR-TEC decision …» (5.4.1, rewritten) | with `sizes_from_description` a sized product without a found size → reason `size`, moderation → even with the old flag in a backup: no `size` reason; the SKU is orderable by request, `payment_allowed: false`, `requires_order_confirmation: true`; the setting is not on the supplier panel | owner decision 5.4.1 (S54-02): sold as in 5.2. The new assertions check the selling flags, not only the absence of a reason |
| `clean-import-hardening` «one supplier group per colour (M-WIN antidrone nets)» (5.4.1) | the per-m² card stays apart (one QUOTE SKU) → the per-m² cards of both colours form one `colour-slices-quote` model (two QUOTE SKU, never orderable or payable); the fixed-size models per colour are checked exactly as before | owner decision 5.4.1 (S541-01) |
| `stage54-moderation` «grouping rule: cards that must NOT be joined stay an owner question», case 7 (5.4.1) | a per-m² card never joins anything → a per-m² card never joins a fixed-price card (checked on a mix); per-m² cards of one kind join each other (two new tests) | owner decision 5.4.1 (S541-01) |

## Reviews

silent-failure-hunter (HIGH: empty-category consensus bucket, colour stems as bare prefixes, colourless cards / empty
supplier category — all fixed with tests; MEDIUM: brand as model name, multi-supplier cards, m² unit for «індивідуальний
розмір», consensus re-validation and AMBIGUOUS, unchanged M-WIN file, size options of mixed models — fixed; table vs
explicit list — fixed), security-reviewer twice (no CRITICAL/HIGH; MEDIUM read side / server HTML fixed on SITE),
code-reviewer APPROVE (MEDIUM card price / schema.org Offer on SITE — fixed). Tests 742/742, npm audit 0, build
reproducible (three builds, one sha256), release archive repacked.
