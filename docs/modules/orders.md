# Orders

## Purpose

Own carts, orders, and related commerce records (with Payments).

## How it works

`OrdersModule` (`orders`). Public refs use non-enumerable `public_id`. Totals computed server-side. FE gates: `orders` / `payments` in `pluginGates`. Payments module may adapt order payment state.

## Execution flow

1. Cart/checkout flows create order rows.
2. Payment module updates payment state.
3. Admin manages orders under `/admin` commerce screens.

## Key components

- `backend/src/Modules/Orders/`
- `frontend/src/modules/orders/`
- Related: `PaymentsModule`, `ProductsModule`

## Files involved

- `backend/src/Modules/Orders/OrdersModule.php`
- `backend/src/Modules/Orders/migrations/`

## Related pages

- [plugin-gates.md](../plugin-gates.md)
- [module-system.md](../module-system.md)
- [security.md](../security.md)

## Common mistakes

- Trusting client-supplied totals.
- Enumerating sequential public order IDs — use `public_id`.

## Extension points

- Commerce widgets in builder (`commerce.tsx`); payment providers in Payments module.

## See also

- [README.md](README.md)
- [page-builder.md](../page-builder.md)
