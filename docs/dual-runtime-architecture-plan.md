> **Historical architecture/plan record.**  
> Do not use as current implementation guide. See [`architecture/CURRENT.md`](architecture/CURRENT.md) · [`dual-runtime.md`](dual-runtime.md).

# План: dual-runtime Jasefly (PHP Shared + Node VPS)

**Статус:** утверждён и в реализации (см. `docs/dual-runtime-progress.md`)  
**Дата:** 2026-08-04  
**Отклоняет:** `docs/dual-deployment-targets-plan.md` (VPS ≠ PHP с другим transport)

---

## 1. Исправленный архитектурный вердикт

**Целевая модель — два runtime одной платформы, не два способа доставки PHP.**

```
Jasefly Architecture / Domain Contracts  (SoT)
├── PHP Runtime Adapter  → Shared Hosting (текущий production)
└── Node Runtime Adapter → VPS (новый target: без PHP)
```

| Target | Runtime | DB | Frontend | Deploy |
| --- | --- | --- | --- | --- |
| **shared** | PHP 8.2+ (текущий) | MySQL (baseline) | собранный React | ZIP + SiteUpdater / FTP / MCP HTTP |
| **vps** | Node.js + TypeScript (новый) | PostgreSQL и/или MySQL | тот же React (или тот же build) | SSH / systemd|PM2 / Docker, atomic releases |

**Запрещено трактовать как решение:** PHP на VPS; общий PHP artifact для обоих target; VPS = transport adapter; fork репозитория; две независимые архитектуры без общих контрактов.

**Вердикт по осуществимости:** возможно только как **многоэтапная программа** с обязательным contract SoT + parity tests. Это не «адаптер деплоя», а **второй backend**. Текущий PHP остаётся каноном shared baseline, пока Node не докажет parity по контрактам.

**Оправданность цены:** условно да — только если Node/VPS (WebSocket, workers, queues, realtime) — стратегический продуктный target и команда готова платить за dual maintenance. Иначе цена превышает выгоду. Честные оценки — §18 и финальный блок.

---

## 2. Целевая схема dual-runtime

```
┌─────────────────────────────────────────────────────────────┐
│  contracts/   (language-neutral SoT)                        │
│  openapi · json-schema · events · permissions · capabilities│
│  blueprints · migrations DSL · module manifests · mcp · err │
└───────────────┬─────────────────────────────┬───────────────┘
                │ codegen / validate          │
        ┌───────▼────────┐            ┌───────▼────────┐
        │  runtime-php/  │            │  runtime-node/ │
        │  (сегодняшний  │            │  (новый)       │
        │   backend/)    │            │  TS server     │
        └───────┬────────┘            └───────┬────────┘
                │ same HTTP contract          │
                └──────────────┬──────────────┘
                               ▼
                     frontend/ (React, один клиент)
                               │
                     mcp-cms/ (tools + site.runtime)
```

### Инварианты

1. **Shared = минимальный переносимый baseline.** Всё, что работает на shared, обязано работать на VPS.
2. **VPS ⊇ baseline** и может объявлять extended capabilities (`websocket`, `queue`, `worker`, …).
3. Frontend и MCP говорят с **контрактом**, не с PHP-идиомами.
4. Модуль baseline не использует VPS-only capability без явного `runtime` в манифесте.
5. Shared compiler **никогда** молча не упаковывает модуль, которому нужен `websocket` / `queue` / `worker`.

---

## 3. Source of truth контрактов

### Рекомендуемая комбинация (не один формат)

| Слой | SoT format | Почему |
| --- | --- | --- |
| HTTP API | **OpenAPI 3.1** | routes, status, request/response, error codes |
| Полевая валидация / DTO | **JSON Schema** (+ codegen → Zod / PHP asserts) | переносимо, toolable |
| Permissions / events / capabilities | **versioned JSON manifests** (уже есть зачаток) | governance snapshots |
| Content / CRUD resources | **Blueprint JSON** (уже есть в PHP `Blueprint`) | declarative domain |
| DB schema | **SQL canonical (MySQL dialect) + transpile** *или* declarative schema JSON → SQL | уже есть `SqlTranspiler` |
| Module / package | **`module.json` + runtime/capabilities** | lifecycle |
| Builder widgets | **widget-types manifest** (уже FE) | не дублировать |
| MCP tools | **`mcp-tools.v1.json` + JSON Schema params** | уже есть tool freeze |
| Error vocabulary | **`errors.v1.json`** (новый) | одинаковые `error` / `errors.code` |
| Platform service surface | **contracts IDL** (новый нейтральный JSON, сегодня PHP interfaces) | SDK для ZIP/пакетов |

**TypeScript types и PHP classes — generated artifacts, не SoT.**  
**DSL** — только если JSON Schema + OpenAPI окажется недостаточно для blueprints/lifecycle; не начинать с кастомного языка.

### Куда физически положить (предложение)

```
contracts/
  openapi/jasefly.v1.yaml
  schema/          # JSON Schema components
  permissions/permissions-core.v1.json
  events/events-core.v1.json
  capabilities/capabilities.v1.json   # baseline + extended flags
  errors/errors.v1.json
  blueprints/      # extracted from modules over time
  migrations/      # canonical SQL (shared with both runtimes)
  modules/*.manifest.json
  mcp/mcp-tools.v1.json
  builder/widget-types.v1.json
```

Текущие snapshots в `backend/src/Platform/Manifest/` становятся **generated или synced copies** для PHP CI, пока миграция SoT не завершена.

---

## 4. Разделение domain / application / infrastructure

Аудит текущего `backend/src` (~LOC, approx):

| Layer | LOC | Файлы | Классификация |
| --- | --- | --- | --- |
| `Modules/*` (30 модулей) | ~21 600 | 92 | **Domain / application** (бизнес-правила, routes, hooks) |
| `Services/*` | ~9 900 | 40 | Смесь: domain services + **PHP/hosting infra** |
| `Platform/*` | ~5 700 | 79 | **Contracts + PHP adapters** (часть — SoT-кандидат) |
| `Core/*` | ~4 500 | 30 | **Infrastructure** (Router, ModuleRegistry, Blueprint engine, SqlTranspiler) |
| `Controllers/*` | ~2 900 | 10 | HTTP application adapters (часть domain orchestration) |
| `Support/*` + Middleware | ~1 800 | 14 | Infra (SSRF, redaction, rate limit) |
| Root (`Database`, `Bootstrap`, `Router`, `Response`…) | ~доп. | — | Infra |

### Бизнес-логика (должна быть идентична по behavior)

- Content model: pages, layout_json, singletons, soft-delete, trash
- Auth / JWT / refresh / 2FA semantics
- Permissions + Access rule DSL + ACL capabilities
- Builder schema validation / public `filterLayout`
- Commerce: products, orders, payments flows (HTTP + DB side effects)
- Forms, comments, newsletter, analytics ingest
- Module package lifecycle **семантика** (install/update/enable/disable/rollback/quarantine)
- Scheduler job types и cron schedule semantics (transport может отличаться)
- Events names + payload shapes
- MCP admin resource CRUD semantics
- SEO public payloads (`/site`, page meta) — **контракт ответа**; способ prerender может отличаться

### PHP-specific infrastructure (не переносится как код)

| Компонент | Почему PHP-specific |
| --- | --- |
| `public/index.php`, Apache `.htaccess`, hosting `index.php` SEO entry | Shared web server model |
| `SiteUpdater` ZIP overwrite | Shared deploy mechanism |
| `build-hosting.js` PHP bundle layout | Shared compiler |
| PHP `Router` / `Bootstrap` / autoload | Runtime |
| `PrerenderService` as PHP HTML assembler | Infra; **HTML contract** общий |
| PDO `Database` class | Driver adapter |
| `OverloadService` loadavg heuristics | Shared-host ops |
| Lazy admin scheduler tick | Shared constraint workaround |
| `ZipArchive` module installer internals | API/ZIP format общий; IO — runtime |
| `dev.js` PHP built-in server | DX only |

### Уже declarative / почти portable

- `Blueprint` arrays (schema + admin widgets + permissions)
- `ModuleInterface` metadata: resources, settingsSchema, blocks, demoPages, adminNav
- Platform capability / permission / event snapshots
- `module.json` для ZIP packages
- Widget types FE manifest
- MCP tools manifest
- Canonical SQL migrations + `SqlTranspiler` (mysql→sqlite/pgsql)
- Response envelope `{ success, data, error, errors, meta.api_version }`

---

## 5. PHP runtime (Shared Hosting)

**Роль:** production baseline и reference implementation до доказанной Node parity.

Сохраняется:

- текущий compiler → PHP+SQL+static React ZIP;
- SiteUpdater / MCP HTTP deploy;
- MySQL primary;
- pull-based scheduler (cron URL / CLI / lazy tick);
- без Node на сервере;
- hosting guards / overload soft limits.

Изменения по мере dual-runtime:

- читать/валидировать общие `contracts/`;
- codegen или sync OpenAPI → route checklist;
- capability gate при сборке пакетов и enable;
- не удалять PHP-only infra ради Node.

**PHP modules нельзя «запустить» на Node.** Они — reference impl baseline.

---

## 6. Node runtime (VPS)

**Роль:** полноценный TypeScript backend без PHP.

Минимальный стек (предложение, не догма):

| Concern | Вариант |
| --- | --- |
| HTTP | Fastify или Hono (один — зафиксировать в PoC) |
| Language | TypeScript strict |
| Process | systemd unit **или** PM2; Docker optional overlay |
| DB | `pg` и/или `mysql2` behind common Database port |
| Migrations | тот же canonical SQL + TS port of SqlTranspiler **или** shared transpile CLI |
| Queue / workers | BullMQ / built-in job runner (capability `queue`) |
| WebSocket | optional gateway (capability `websocket`) |
| Files | local FS adapter implementing Storage contract |
| Auth | same JWT/refresh/2FA semantics as OpenAPI |

### Чего Node **не** делает

- Не становится SoT доменных правил «в обход» contracts.
- Не получает эксклюзивные baseline-модули, которых нет на PHP (иначе shared ломается как baseline).
- Не требует PHP sidecar.

### Deploy shape (VPS-only)

```
/var/www/jasefly/
  releases/<stamp>/     # node build + static frontend
  current -> …
  shared/config/
  shared/storage/
```

Atomic symlink + rollback = обязанность VPS adapter, не PHP SiteUpdater.

---

## 7. Общая модель модулей

```
modules/<slug>/
  manifest.json          # declarative: id, version, runtime, capabilities,
                         # permissions, events, blueprints?, routes?, settingsSchema
  contracts/             # optional OpenAPI fragments / JSON Schema
  migrations/            # canonical SQL
  frontend/              # React (одна реализация)
  impl/
    php/                 # PHP Module / PackageModule
    node/                # TypeScript module plugin
```

Bundled modules сегодня живут как `backend/src/Modules/*` + `frontend/src/modules/*`. Миграция — поэтапный вынос манифестов в `contracts/modules` / `modules/<slug>/manifest.json` без big-bang.

### Можно ли использовать текущие PHP-модули напрямую на Node?

**Нет.** Нужны отдельные `impl/node` (или declarative executor, см. ниже).

### Как избежать ручного двойного написания каждой функции

| Стратегия | Эффект |
| --- | --- |
| A. Declarative CRUD/Blueprint engine в обоих runtime | Один манифест → две тонкие реализации engine, не N×handlers |
| B. OpenAPI + JSON Schema codegen | Types, validators, client SDK, route stubs |
| C. Parity test suite как «третий арбитр» | Ловит drift раньше людей |
| D. Domain policy tables (JSON rules) где возможно | Меньше кода в обоих языках |
| E. Не дублировать FE | Один React против обоих API |
| F. ZIP packages: Platform SDK dual bindings | Один `module.json`, две тонкие runtime bindings |

**Не предлагается:** транспиляция PHP→TS, общий интерпретатор PHP на VPS, Wasm-перенос всего backend.

---

## 8. Capability system

Расширить текущий `CapabilityRegistry` (сейчас ~platform service caps) до **runtime capability model**.

### Baseline (shared + vps)

Примеры (иллюстративно; финальный список — из аудита enable-путей):

- `http.api`, `db.sql`, `storage.files`, `events`, `permissions`, `media`, `builder.widgets`, `scheduler.jobs` (pull/tick), `mail.send`, `modules.zip`, `mcp.admin`

### Extended (vps only)

- `queue`
- `worker`
- `websocket`
- `realtime.subscribe`
- `streaming.response`
- `process.memory.long`
- `cron.native` (гарантированный OS cron/systemd, не HTTP tick)
- `scale.horizontal`

### Манифест модуля

```yaml
# manifest.json (conceptual)
runtime:
  baseline: true          # обязан работать на shared
  capabilities: []        # extra required caps
# OR
runtime:
  baseline: false
  capabilities: [queue, websocket]
```

### Shared compiler / enable rules

| Ситуация | Поведение |
| --- | --- |
| `baseline: true`, caps ⊆ baseline | OK на shared и VPS |
| requires VPS-only cap, shared build | **Hard error** с текстом каких caps не хватает |
| exclude only with explicit `--allow-skip-incompatible-modules` | OK, модуль **не** попадает в shared bundle; никогда silent |
| enable на live shared site | API 409 `capability_unavailable` |

VPS-specific фичи **не** должны протекать в baseline-модули (lint: forbid imports of `websocket` API from baseline packages).

---

## 9. Data layer и миграции

### Общий data contract

- Таблицы, колонки, индексы, soft-delete, seed semantics — **одинаковые**.
- Canonical dialect: **MySQL SQL** (как сейчас) *или* нейтральный schema JSON → emit MySQL/PG.
- Оба runtime используют один migrate runner semantics: ordered files, `schema_migrations` table, transactional where possible.

### SqlTranspiler

Уже есть PHP `SqlTranspiler` (mysql → sqlite/pgsql). Для dual-runtime:

1. Вынести правила transpile в **тестируемую спеку** + reference impl;
2. Port в TypeScript **или** вызывать общий CLI (Node) из обоих пайплайнов;
3. Parity tests: одна migration → одинаковая целевая схема на MySQL/PG (information_schema dump compare).

### DB drivers

| Target | Primary | Also |
| --- | --- | --- |
| shared | MySQL | SQLite already for tests/dev |
| vps | PostgreSQL **или** MySQL (site config) | оба через Database port |

Приложение не пишет raw MySQL-only SQL в domain-слое без transpile path (правило CI).

---

## 10. Code generation

Из SoT генерировать:

| Artifact | Generator consumer |
| --- | --- |
| API routes checklist / stubs | PHP + Node |
| DTO / types | `packages/contracts-ts`, PHP arrays/classes |
| Validation | Zod (Node), PHP validator from JSON Schema |
| DB schema docs | from migrations/blueprints |
| Permissions constants | FE + both backends |
| Module manifest types | both |
| MCP tool schemas | mcp-cms (уже близко) |
| OpenAPI publish | `/api/v1/docs` both runtimes |
| Frontend API SDK | optional thin client from OpenAPI |

**Не генерировать** полную бизнес-логику Payments/Support/Translate — только границы и валидацию.

Поток:

```
contracts/* → codegen → runtime-php / runtime-node / frontend/src/generated → CI fails on drift
```

---

## 11. Contract and parity testing

### Уровни

1. **Contract tests (static):** OpenAPI completeness, snapshot governance (уже есть зачаток), schema validate.
2. **Conformance tests (HTTP):** один suite, два base URL (`PHP_BASE`, `NODE_BASE`).
3. **Parity tests (behavioral):** тот же сценарий → compare status, JSON (canonicalized), DB diff, side-effect probes.
4. **Lifecycle tests:** module install/enable/disable/rollback semantics на обоих.
5. **Capability tests:** shared build rejects VPS-only module.

### Что сравнивать (обязательный чеклист)

| Dimension | Метод |
| --- | --- |
| HTTP status | assert equal |
| Response JSON | deep equal after stable key sort; ignore `time` / request ids via scrubbers |
| Error codes | `error` string + `errors.code` vocabulary |
| Permissions | matrix user×route×expected status |
| DB changes | fixture → action → SQL snapshot / row hashes |
| Side effects | mail outbox table, job rows, webhook signed payload shape (transport mocked) |
| Module lifecycle | same ZIP/manifest → same status transitions |
| Builder/public filter | layout_json in → filtered out |

### Harness

```
tests/parity/
  cases/*.yaml          # request, auth, expect
  runner.ts             # hits both backends
  scrubbers.ts
  db/
```

CI matrix:

- `parity-php-only` (сегодня)
- `parity-node-only` (после PoC)
- `parity-both` (**release gate** для dual)

---

## 12. MCP integration

### Выбор runtime target сайта

Расширить сайт-профиль (env, без секретов в `cms_sites`):

```
CMS_SITE_{ID}_RUNTIME=php-shared|node-vps   # обязателен при multi; default php-shared
CMS_SITE_{ID}_DEPLOYMENT=shared|vps         # transport/ops profile
```

Правила агента:

- при 2+ сайтах — всегда `site`;
- **не угадывать** runtime;
- `cms_sites` возвращает `runtime`, `deployment`, `capabilities_profile` — **не** токены/SSH keys;
- destructive ops — явный `site` + `confirm`.

### Tools

| Tool | Поведение |
| --- | --- |
| `cms_local_build` | `target=shared\|vps` → PHP bundle **или** Node artifact |
| `cms_release` | dispatch по `site.runtime` |
| `cms_deploy_update` | PHP→SiteUpdater; Node→SSH/atomic adapter |
| `cms_rollback` | Node VPS symlink; shared — ограничен/DB backup only |
| `cms_status` / logs | runtime-aware |
| content tools | одинаковые — контракт API |

MCP schemas остаются общими; меняется transport adapter.

---

## 13. Build / release pipelines

```
             contracts validate
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
 frontend build            (shared)          (vps)
        │                 PHP package       Node bundle
        │                 build-hosting.js  tsc + assets
        │                 ZIP               tar/oci image
        └───────────┬───────────┴───────────┘
                    ▼
              parity gate (required if releasing "platform")
                    ▼
         deploy adapter(site.runtime)
```

- Shared pipeline: сохранить текущий `cms_release` path.
- VPS pipeline: build Node + FE assets → artifact → atomic deploy.
- **Один changelog / одна platform version** на оба runtime (см. §14).

---

## 14. Versioning and compatibility

### Platform version

`PLATFORM_VERSION` semver общий.

Правила релиза:

1. Изменение контракта → bump + snapshot update + **обе** реализации (или feature flag `node:not-implemented` **запрещён** для baseline endpoints).
2. CI job `runtime-parity`: если baseline OpenAPI path реализован только в одном runtime → **fail release**.
3. Extended capabilities могут быть Node-only; они версионируются отдельно (`capabilities.extended`) и не входят в baseline freeze без PHP stub that returns `capability_unavailable` **одинаково**?  
   - Уточнение: на shared endpoint может **отсутствовать**; на VPS — работать. Клиент/FE гейтится capability discovery, не молчаливым 500.
4. Package `jasefly.sdk_version` остаётся; добавить `jasefly.runtime: [php, node] | [node]`.
5. Deprecations — через существующий SDK deprecation tooling, дублировать в contracts.

### Compatibility matrix

| Change type | Shared PHP | Node VPS | Allowed? |
| --- | --- | --- | --- |
| Additive baseline endpoint | both | both | yes |
| Breaking response field | both same version | both | only major |
| VPS-only websocket API | n/a | yes | yes if capability-gated |
| Baseline module Node-only | — | — | **no** |

---

## 15. Стоимость поддержки двух runtime

### Evidence размера

- ~30 bundled PHP modules, ~21.6k LOC modules + ~9.9k services + controllers/platform/core ≈ **~45k+ LOC** PHP application surface.
- FE уже один (~отдельный крупный TS codebase) — **выигрыш: не дублировать UI**.
- Governance уже частично есть — **выигрыш: не строить культуру контрактов с нуля**.

### Грубая модель стоимости (порядок)

| Статья | Оценка |
| --- | --- |
| Извлечение contracts SoT + OpenAPI полнота | M (недели–месяцы) |
| Node runtime kernel (router, auth, registry, CRUD engine, migrate) | L |
| Port baseline modules to parity | **XL** (основная цена) |
| Parity harness + CI gate | M |
| MCP dual deploy | M |
| Ongoing: каждая фича ×1.3–1.8 (не ×2 при codegen/declarative) | permanent tax |

Механизмы снижения налога: Blueprint engine, codegen, запрет «тихих» PHP-only baseline features, маленькие модули, capability-split для тяжёлого realtime.

---

## 16. Риски расхождения

| Риск | Severity | Mitigation |
| --- | --- | --- |
| PHP остаётся «настоящим», Node отстаёт | **Critical** | release gate parity-both |
| Дублирование бизнес-логики вручную | **Critical** | declarative + codegen + code review checklist |
| VPS-only утечки в baseline modules | **High** | capability linter + shared compiler hard fail |
| SQL dialect drift | **High** | canonical migrations + transpile tests |
| OpenAPI неполная (сейчас thin `openapi.php`) | **High** | сделать OpenAPI полным SoT до массового port |
| SEO prerender behavior drift | **Medium** | HTML contract tests (bots) |
| Package ZIP SDK only PHP | **High** | dual Platform SDK bindings до third-party packages |
| Over-ambition big-bang rewrite | **Critical** | PoC → vertical slices → freeze |
| Стоимость > ценность | **Critical** | stage gates; stop option после PoC metrics |

---

## 17. Поэтапная миграция

### Phase 0 — утверждение (сейчас)

Зафиксировать: dual-runtime, shared baseline, Node VPS, no PHP on VPS.

### Phase 1 — Contract foundation (без Node production)

1. Создать `contracts/` и перенести/сгенерировать существующие snapshots.
2. Расширить OpenAPI от thin list → реальные schemas ключевых baseline routes.
3. `errors.v1.json` vocabulary.
4. Capability model: `baseline` vs `extended`.
5. CI: contract validate; PHP still SoT implementation.

### Phase 2 — PoC Node kernel (§18)

Vertical slice parity. Go/no-go.

### Phase 3 — Declarative acceleration

1. Вынести blueprints в JSON SoT.
2. Реализовать Node Blueprint CRUD engine + выровнять PHP engine behavior.
3. Port «тонких» modules (Content resources, Blog list/get) via engine.

### Phase 4 — Hard modules

Payments, Support, Translate, ModuleManager, Prerender/SEO, Demo — отдельные вертикали с parity cases.

### Phase 5 — MCP + VPS deploy

`runtime=node-vps`, atomic SSH/Docker, rollback, status/logs.

### Phase 6 — Package SDK dual

ZIP modules: `impl/php` + `impl/node` или JS-only packages with capability requirements.

### Phase 7 — Productization

Docs, INSTALL VPS Node, marketing honesty (shared remains first-class), freeze baseline.

**Каждая фаза имеет stop criterion.** Нет обязательства довести Node до 100% до доказательства ценности на PoC.

---

## 18. Минимальный proof of concept

**Цель:** доказать architectural identity на узком срезе, не портировать CMS.

### Scope PoC (must)

| Area | Endpoints / behavior |
| --- | --- |
| Health | `GET /health` |
| Site bootstrap | `GET /site` (theme/settings/home/nav subset) |
| Auth | `POST /auth/login`, `GET /auth/me` (JWT shape) |
| Permissions | один permission deny/allow matrix |
| Blueprint CRUD | один resource (например `social-links` или `services`) full list/create/update/delete |
| Errors | одинаковый envelope + 401/403/404/422 |
| Migration | одна canonical SQL applied on MySQL (PHP) и MySQL/PG (Node) |
| Capability probe | `GET` discovery baseline caps |
| Parity runner | один CI job comparing PHP vs Node |

### Out of scope PoC

Payments, ZIP module installer, prerender HTML, WebSocket, MCP deploy Node, full admin UI, Translate, Support chat.

### PoC deliverables

1. `contracts/openapi` fragment + schemas for slice.
2. `runtime-node/` minimal server.
3. `tests/parity` cases green on both.
4. Report: hours spent, % reuse via contracts, go/no-go recommendation.

### Go criteria

- 100% PoC cases green on both runtimes with scrubbed JSON equality.
- No PHP binary on Node host.
- Shared PHP path unchanged for existing sites.
- Documented estimate to port next 5 baseline modules.

---

## Ответы на контрольные вопросы (сжато)

1. **Domain vs PHP infra** — §4.  
2. **Контракты к извлечению** — §3.  
3. **PHP modules на Node?** — нет; нужны `impl/node` (+ declarative engine).  
4. **Избежать double-write** — §7 стратегии A–F.  
5. **Что генерировать** — §10.  
6. **SoT format** — комбинация OpenAPI + JSON Schema + versioned JSON manifests + Blueprint + canonical SQL (§3).  
7. **Behavioral parity** — §11 harness + release gate.  
8–9. **Contract/parity tests** — §11.  
10–12. **Модули / declarative vs dual impl** — §7–8; declarative: CRUD/settings/nav/blueprints; dual impl: Payments, Support, Translate, ModuleManager, complex SEO, Demo sandbox.  
13–14. **DB abstraction / SQL SoT** — §9; да, MySQL-canonical + transpile (уже паттерн).  
15. **MCP runtime choice** — `CMS_SITE_*_RUNTIME`, never guess (§12).  
16. **Release pipelines** — §13.  
17. **Versioning forbids drift** — §14 parity gate.  
18–20. **Shared limits / capabilities / portability** — §8; shared compiler hard-fail.

---

## Честный итоговый ответ

### Какой процент текущего PHP backend можно описать общими контрактами?

**Ориентир: 25–35% поведенческой поверхности** (HTTP routes + envelopes + permissions + events + capabilities + blueprints/resources + migration schema + module metadata + MCP tool shapes).

По **LOC** сегодня уже declarative/snapshot-like заметно меньше — примерно **10–15%**; остальное — императивный PHP, который контрактами *описывается*, но не заменяется.

### Какой процент придётся реализовать повторно на Node?

Для **полной** baseline-parity: **порядка 75–90% исполняемого backend-кода** потребует Node-реализации (модули + domain services + HTTP orchestration).  
Не «90% заново с нуля по смыслу»: часть уйдёт в shared engines (CRUD/migrate/auth middleware) и codegen stubs — но **логика Payments/Support/Translate/ModuleManager** — essentially dual implementation.

Infra-only PHP (~SiteUpdater, htaccess, hosting index, overload loadavg) на Node **не** портируется 1:1 — заменяется VPS infra (10–15% кода можно считать non-portable и не нужным на Node).

### Какие механизмы снизят стоимость двойной поддержки?

1. Contract-first SoT + codegen (OpenAPI/JSON Schema).  
2. Общий Blueprint/CRUD engine в обоих runtime.  
3. Canonical SQL + один transpile pipeline.  
4. Один Frontend / один MCP tool surface.  
5. Parity CI как merge/release gate.  
6. Capability model: тяжёлый realtime не тащить в baseline.  
7. Портировать вертикалями, не «всем репо сразу».  
8. Запрет baseline-фич «только в PHP» через CI.

### Оправдана ли архитектурная цена?

| Если цель… | Вердикт |
| --- | --- |
| «Просто деплоить текущую CMS на VPS» | **Нет** — слишком дорого; достаточно PHP на VPS (но это *другой* продуктный запрос, здесь отвергнут) |
| «Стратегически два runtime: shared PHP + Node realtime/workers, одна платформа» | **Да, условно** — при готовности к Phase 1–2 и честному go/no-go после PoC |
| «Быстро получить WebSocket, не сохраняя shared baseline» | **Нет как архитектура Jasefly** — ломает принцип baseline |

**Рекомендация:** утвердить направление dual-runtime **и сразу ограничить обязательство PoC (Phase 1–2)**. Полный port всех ~30 модулей не начинать, пока parity harness и OpenAPI SoT не доказаны на срезе.

---

## Решение, которое нужно утвердить

1. Принять исправленный вердикт: VPS = **Node runtime без PHP**.  
2. Shared остаётся baseline и основным поддерживаемым target.  
3. SoT = комбинация OpenAPI + JSON Schema + manifests + blueprints + canonical SQL.  
4. Стартовать с Phase 1 (contracts) → Phase 2 (PoC), без реализации до явного «утверждено».  
5. После PoC — отдельное решение о Phase 3+ бюджете.

Предыдущий файл `docs/dual-deployment-targets-plan.md` считать **отклонённым** (историческая ссылка на неверную трактовку).
