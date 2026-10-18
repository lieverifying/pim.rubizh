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

## 2. Что сделано (PIM)

| Задача | Коммит | Суть | Тест (красный на `4fc592b`) |
|---|---|---|---|
| S55-03 | `0b92ab1` | `finalPublish` передаёт `version` в заголовке каждой части (сайт иначе отвечал 409) | `final-workflow` «every chunk header…» |
| 5.5-2 D-66…D-68 | `cc0396a` | чистка по фрагментам G1–G6, инвариант D-67, блок «Вилучено з опису постачальника», `ceCommercialSignals`, `CE_VERSION` 9 | `stage55-descriptions` (11) |
| 5.5-3 D-69/D-70 | `e878521` | пять условий автоприменения, «Застосувати всі чисті описи» + отмена, «Потребують рішення», нормализация форматов, `cfgForInstall` | `stage55-autoapply` (5) |
| 5.5-4 D-71 | `a267813` | `supplierTextChecks` — только отчёт | `stage55-supplier-checks` (4) |
| 5.5-5 D-75 | `a83cd8a` | черновик названия с историей и отменой | `stage55-names` (5) |
| 5.5-6 D-74 | `37950b8` | `launchWave`: 15 условий, квоты, рейтинг, отметки, публикация + отмена | `stage55-wave` (6) |
| 5.5-7 D-77 | `549c34d` | сухой прогон, `importPrice`, даты Excel, фото «//», валюта YML, `needsDryRun` | `stage55-dryrun` (6) |
| 5.5-11 | `2345381` | время волны: `uniq` без сортировки 0–1 значений, кеш `ceSourcePlain`; проверки репетиции (оригиналы по ключу `k`, заголовок-название не «пустой раздел») | замер, тесты без изменений |
| D-75 (стенд) | `242b148` | применённое название уходит на сайт (`finalTitle`), slug не меняется (`finalSlugTitle`), отмена возвращает прежний источник | `stage55-names` «the applied name is the name the site gets…» |
| ревью | `ce38b2a` | сохранение не маскируется успехом; mcPlan/слоты не глушатся; резервная копия и исходное состояние при публикации хвилі; порядок «названия → описи»; G2 «наявність»; a11y (таблицы, фокус, alert); кеши | `stage55-wave` (3 новых), `stage55-descriptions` (1 новый) |

Инвариант D-67 (уточнение по данным run10): токены «число + единица» исходного текста ⊆ итоговый текст ∪ вырезанные фрагменты G1 ∪
предложения, отложенные на ручную проверку (противоречие или русский язык — черновик заблокирован, предложение видно в карточке).

Рейтинг волны (подсказка на экране): свежесть данных до 20, размеры в наличии по 2 (до 20), фото по 2,5 (до 8 фото, до 20),
повнота опису × 0,2 (до 20), ключевые характеристики по 2 (до 20); при равенстве — меньший id.

## 3. Изменённые существующие тесты

| Тест | Было → стало | Почему |
|---|---|---|
| — | существующие тесты PIM не менялись (787/787 после ревью, `ce38b2a`) | — |
