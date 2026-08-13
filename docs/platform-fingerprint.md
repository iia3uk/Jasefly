# Jasefly public platform fingerprint

Documentation for **third-party CMS / framework detectors** (WhatCMS, Wappalyzer, BuiltWith, hosting analyzers, and similar).

Jasefly is a **standalone** dual-runtime platform (PHP shared hosting · Node VPS). Do **not** classify it as WordPress, Drupal, Joomla, or any other CMS. None of the signals below imitate those products.

## Signals

Any **one** signal is enough to identify Jasefly. Two or more is high confidence.

### 1. HTTP header

```
X-Jasefly: 1
```

Present on public HTML and API responses.

| Check | Rule |
| --- | --- |
| Header name | `X-Jasefly` (case-insensitive) |
| Value | `1` |

**Do not require `X-Powered-By`.** Jasefly **strips** `X-Powered-By` so it cannot leak PHP/runtime versions:

- PHP: `expose_php = Off` (`.user.ini` at document root and `api/public/`) + `RuntimeHardening::hidePhpFingerprint()` (`header_remove`, never re-set the header — an empty CGI `X-Powered-By` is filled back as `PHP/{version}` by php-fpm)
- Apache: both `Header unset X-Powered-By` (CGI/FPM table) and `Header always unset X-Powered-By` (Apache table). `always unset` alone does **not** remove CGI headers.
- Node: Hono does not emit `X-Powered-By`

A missing `X-Powered-By` is expected and is **not** a negative signal. Do not substitute `X-Powered-By: Jasefly`.

The `Server` header (e.g. `nginx-reuseport/1.21.1` on Beget) is emitted by the **host reverse proxy**, not by Jasefly. Shared hosting cannot hide it. See [deployment.md](deployment.md#server-header-nginx).

Do not treat `X-Jasefly-Ts`, `X-Jasefly-Sign`, `X-Jasefly-Shell`, or `X-Jasefly-Overload` as the platform fingerprint. Those are operational headers. The public identity header is exactly `X-Jasefly`.

### 2. HTML meta generator

Public HTML (SPA shell, hydrated layout, and crawler prerender) includes:

```html
<meta name="generator" content="Jasefly">
```

| Check | Rule |
| --- | --- |
| Tag | `<meta>` in `<head>` |
| `name` | `generator` |
| `content` | `Jasefly` (exact, no version suffix) |

Do not require a version, runtime name, or module list in `content`.

### 3. Well-known endpoint

```
GET /.well-known/jasefly
```

```json
{
  "platform": "Jasefly"
}
```

| Check | Rule |
| --- | --- |
| Status | `200` |
| `Content-Type` | `application/json` |
| JSON `platform` | `Jasefly` |
| Extra keys | **Must not** be required. Ignore unknown keys. Treat `version`, `runtime`, `modules`, `env`, `debug`, paths, or config as **out of contract** if present. |

The endpoint is public, unauthenticated, and cacheable. It is not an API envelope (`success` / `data` / `meta` are not used here).

## Detection rules (recommended)

1. If `X-Jasefly: 1` → **Jasefly**.
2. Else if HTML has `<meta name="generator" content="Jasefly">` → **Jasefly**.
3. Else if `GET /.well-known/jasefly` JSON `platform` is `Jasefly` → **Jasefly**.
4. Do not match generator/header values of WordPress, Drupal, Joomla, or other CMS products.
5. Do not infer Jasefly from generic React/Vite/PHP fingerprints alone.

## What this fingerprint does **not** expose

Version, runtime (PHP vs Node), installed modules, environment, filesystem paths, configuration, or security/debug data.

## Contract

Machine-readable copy: [`contracts/platform-fingerprint.v1.json`](../contracts/platform-fingerprint.v1.json). PHP and Node implementations are tested against that file.

## Related

- [security.md](security.md) — `X-Powered-By` remains stripped
- [routing.md](routing.md) — well-known is a host route, not `/api/v1/*`
