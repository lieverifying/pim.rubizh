# Этап 5.5 «ЗАПУСК-500» (PIM)

Ветка `hardening/stage-5.5-pim` от `pim-stage-5.4.1-verified` (`4fc592b`). Решения владельца D-66…D-80 — в SITE
`docs/release/KNOWN_ISSUES.md`. Файлы поставщиков и результаты репетиций — вне git (`~/Projects/rubizh-supplier-files/out`).

## 1. Карта движка описаний, «Первой волны» и импорта (code-explorer, до изменений этапа)

Источник истины — `app/lib/*.inc.js`; `tools/build.cjs` вписывает их в `app/rubizh_pim.html` (тесты и harness грузят только
собранный файл). `content.inc.js` и `localization.inc.js` стоят в сборке после основного кода и переопределяют функции
присваиванием (`ceGenerate=function…`, `autoUkText=…`, `hasRussianText=…`) — действует последнее определение.

**Описания.**
- `ceGenerate(p, style)` (`rubizh_pim.html`, обёртка `content.inc.js`) → черновик `{html, short, facts, conflicts, languageWarnings,
  quality, technicalCount, version: CE_VERSION, inputFingerprint, style, sourceCoverage, attributeCoverage, omittedSentences,
  excludedSentences, …}`; факты — `ceExtract` (атрибуты, контент поставщика, проза).
- `ceChoose` — индекс похожести (трёхсловные граммы без имени и бренда); при похожести ≥ 85 % перебирает стили 0…3.
- `ceApply` — отказ для ручного описания, невалидного черновика (`ceDraftValid`: версия, отпечаток, html совпадают с
  перегенерацией) и при `ceContentBlock` (противоречия, непереведённые предложения, покрытие < 1). Сохраняет одну запись
  истории (`contentHistory`), ставит `fieldMeta.desc.source='generated'`, `contentEngine.approvedHash=fnvHash(desc)`.
- `ceUndo` — откат к `contentHistory[0]`; `ceAccepted` — generated и хеш совпадает (любая правка `desc` снимает «принято»).
- `cePublishedDescription` — ручное или принятое, иначе `ceBasicDescription` (имя, бренд, несколько фактов).
- `ceCommercialOnly` (`content.inc.js`) — удаляет только **строку целиком** (URL, email, телефон, строка с «ціна, доставка,
  оплата, наявність, наш магазин, замовляйте…»), строку с техническим признаком не трогает. Фрагментов внутри предложения не
  режет — цены, сроки, имя поставщика в смешанной строке проходят (это и закрывает D-66).
- `tzSourceSections` — строки источника → `autoUkText` → `ceCommercialOnly` (excluded) → противоречие (omitted) → русский
  (languageWarnings) → разделы. Оригинал поставщика: `fieldMeta.desc.supplierOriginal`/`supplierValue`, `S.content[k].originalDesc`.
- `CE_PROFILES` — профили категорий с ключевыми фактами (`focus`/`expected`); `hasRussianText` + `RU_LEXICAL_RE`, `autoUkText`.

**После импорта.** `workflowContentAfterImport` (`workflow.inc.js`): черновики (`refreshGeneratedDescription`) и при
`S.cfg.contentAutoApply===true` — `ceChoose`+`ceApply` (успех → applied, иначе review), в режиме review apply выключен; изменения
через `touchP` (откат импорта).

**Волна.** `readyStatus` (архив, имя, локализация, категория, фото, SKU, цена и наценка без нарушения) → `waveStatusRaw`
(слов ≥ `waveDescWords`, принятое описание с quality ≥ 60 или разрешённый раздел, фото ≥ `waveMinPhotos`, размеры ≥ `waveMinSizes`
для одежды и обуви, наличие — только при `waveNeedStock`) → `waveList`, `waveBlock`, действия `wavePublishAll` (скрывает все
остальные опубликованные), `waveHideRest`, `bulkPubWave`. Рейтинга, квот, лимита и отметок «всегда/никогда» нет.
Важно: `p.pub` не участвует в `finalDecision`/`pimSiteWire` (на сайт уходят все READY); скрытие на сайте — через
`finalOwnerUnpublished` (`fieldMeta.pub.source==='manual'` и `pub===false`) и `finalExplicitHideIds`.

**Названия.** Имя из файла → `cleanProductTitle` (html, пустые подписи цвета и размера, хвосты `nameJunkTails`, цены в скобках,
дубли слов); предпросмотр `titleCleanupChanges` (действия titleCleanPreview/Apply); `fieldMeta.name.supplierOriginal`,
`source='manual'` защищает. Истории версий и отмены названия нет. `realBrand`, `normalizedBrand` (`brandMap`).

**Импорт и «сухой прогон».** `queue-dry-run.inc.js` — изолированный аудит очереди, не предпросмотр нового поставщика.
Предпросмотр импорта — `runImport`/`I.preview`/`applyImport` (снимок и откат). `parseNum` (числа), `parseYml` (валюта YML не
читается — цена берётся как есть), даты XLSX (`source_generated_at`), дубли SKU (`finalSkuCounts`, `INVALID_SKU`).
`supplier-profiles.v1.json` — контракт (тест), рантайм его не читает.

**Слоты «Свій комплект».** Определены на SITE (`shop/pim-v3-schema.php`: head, body, legs, boots, armor, gear, med, small);
PIM передаёт `kit_component`, SITE переводит в слот (`pimV3KitSlot`), запасной путь — шаблоны по имени (`shopKitSlotPatterns`).

**Цена и свежесть.** `calc(p,v)` (price, lowMargin, rrpViolation), `modelVariant(...).margin_blocked`; свежесть —
`classificationFreshnessClass` (fresh/confirm/hidden), `classificationAvailability(...).payment_allowed` (без возраста),
`freshnessPolicy` (72 ч / 8 дн.).

**Ловушки (учтены в этапе).** Правка `lib` без сборки не попадает в тесты; `ceApply` хранит одну запись истории; `ceAccepted`
держится на хеше `desc`; изменение `ceGenerate` требует подъёма `CE_VERSION` (иначе черновики устаревшие «валидные»); ручные
описания и названия защищены; мутации после импорта — через `touchP`; кэши сбрасываются `markProduct`/`bumpData`; `p.pub` не
управляет выгрузкой; переопределения в `localization.inc.js` влияют на «готовность».
