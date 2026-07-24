# Comments

Комментарии и отзывы для `blog_post`, `project`, `product`, `page`.

- Публичные API: `GET /api/v1/comments`, `POST /api/v1/comments`.
- Новые записи попадают в статус `pending`; модерация — `/admin/comments`.
- Отзывы требуют рейтинг 1–5, для товаров определяется подтверждённая покупка.
- Виджеты: `comments`, `reviews`, `rating-summary`, `review-form`.
- Права: `comments.view`, `comments.moderate`, `comments.manage`.
- События: `comment.created`, `comment.approved`, `review.created`.

Модуль по умолчанию выключен.
