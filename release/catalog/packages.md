# Extracted domain packages (catalog)

> Derived index. **Implementation sources are external** (not bundled Core).
> Canonical source repo: https://github.com/iia3uk/Jasefly-Modules
> Identity snapshots: `release/catalog/manifests/{slug}.json`
> Regenerate: `node scripts/build-package-catalog.mjs`

## Architecture

- **ONE PACKAGE** identity per slug (`module.json`)
- **Source ownership:** https://github.com/iia3uk/Jasefly-Modules
- **Core repo:** contracts · loaders · catalog · tooling (not package PHP/Node source)
- Local checkout (optional, gitignored by Core): `Jasefly-Modules/modules-src/{slug}/`
- Distributable ZIP: `jasefly-module-{slug}-{version}.zip` (release storage / Hub — not Core git)
- PHP / Node = optional runtime entrypoints on the **same** ZIP

## Packages (15)

| slug | version | artifact | PHP | Node | surfaces |
| --- | --- | --- | --- | --- | --- |
| webhooks | 1.0.0 | `jasefly-module-webhooks-1.0.0.zip` | yes | yes | no |
| comments | 1.0.0 | `jasefly-module-comments-1.0.0.zip` | yes | yes | yes |
| forms | 1.0.0 | `jasefly-module-forms-1.0.0.zip` | yes | yes | no |
| analytics | 1.0.0 | `jasefly-module-analytics-1.0.0.zip` | yes | yes | no |
| newsletter | 1.0.0 | `jasefly-module-newsletter-1.0.0.zip` | yes | yes | no |
| automation | 1.0.0 | `jasefly-module-automation-1.0.0.zip` | yes | yes | no |
| notifications | 1.0.0 | `jasefly-module-notifications-1.0.0.zip` | yes | yes | no |
| support | 1.0.0 | `jasefly-module-support-1.0.0.zip` | yes | yes | no |
| translate | 1.0.0 | `jasefly-module-translate-1.0.0.zip` | yes | yes | no |
| products | 1.0.0 | `jasefly-module-products-1.0.0.zip` | yes | yes | yes |
| orders | 1.0.0 | `jasefly-module-orders-1.0.0.zip` | yes | yes | yes |
| payments | 1.0.0 | `jasefly-module-payments-1.0.0.zip` | yes | yes | yes |
| registration | 1.0.0 | `jasefly-module-registration-1.0.0.zip` | yes | yes | no |
| blog | 1.0.0 | `jasefly-module-blog-1.0.0.zip` | yes | yes | yes |
| projects | 1.0.0 | `jasefly-module-projects-1.0.0.zip` | yes | yes | yes |

## Runtime views

- [runtime/php.md](runtime/php.md)
- [runtime/node.md](runtime/node.md)
- [runtime/dual-runtime.md](runtime/dual-runtime.md)

Machine-readable: [packages.json](packages.json)
