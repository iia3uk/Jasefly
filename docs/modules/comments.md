# Comments

## Purpose

Own comments, reviews, and ratings.

## How it works

`CommentsModule` (`comments`). Builder widget in `builder/widgets/comments.tsx`. Admin moderation screens. FE module under `frontend/src/modules/comments/`.

## Execution flow

1. Public submits comment/review on a resource.
2. Moderation / publish rules in module.
3. Widget renders approved items.

## Key components

- `backend/src/Modules/Comments/`
- `frontend/src/builder/widgets/comments.tsx`

## Files involved

- `backend/src/Modules/Comments/CommentsModule.php`
- `backend/src/Modules/Comments/migrations/`

## Related pages

- [page-builder.md](../page-builder.md)
- [module-system.md](../module-system.md)

## Common mistakes

- Rendering unmoderated content when moderation is enabled in settings.

## Extension points

- Widget + module APIs only.

## See also

- [README.md](README.md)
