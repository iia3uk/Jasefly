# Frontend

React + TypeScript + Vite SPA for Jasefly: public site, admin CMS, and page builder.

Talks to **either** production runtime over `/api/v1` (PHP shared or Node VPS). Contracts for the API live in [`../contracts/`](../contracts/README.md).

## Commands

```bash
npm install
npm run dev
npm test
npm run build
```

Full stack local (PHP + Node + Vite):

```bash
node ../scripts/jasefly/cli.mjs dev --runtime=dual --target=local
```

## Architecture

See [`../docs/frontend-architecture.md`](../docs/frontend-architecture.md) and [`../docs/page-builder.md`](../docs/page-builder.md).

Entry: `src/main.tsx`. Routes: `src/routes/AppRouter.tsx`. Modules: `src/modules/`. Builder: `src/builder/`. Platform FE SDK: `src/platform/`.

## See also

- [`../README.md`](../README.md)
- [`../docs/README.md`](../docs/README.md)
- [`../CMS_MAP.md`](../CMS_MAP.md)
