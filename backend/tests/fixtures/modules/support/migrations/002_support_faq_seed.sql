-- Seed FAQ for Support bot (obvious templates — edit in /admin/support/faq)

INSERT INTO `support_faq` (`question`, `answer`, `keywords`, `sort_order`, `is_active`)
SELECT * FROM (
  SELECT
    'Сколько стоит?' AS question,
    'БАЗОВЫЙ ОТВЕТ (отредактируйте): цены зависят от тарифа. Напишите, какой сайт/объём нужен — пришлём актуальный прайс. Страница с ценами: /products (если есть).' AS answer,
    'цена,стоимость,прайс,сколько стоит,тариф,оплата' AS keywords,
    10 AS sort_order,
    1 AS is_active
) AS t
WHERE NOT EXISTS (SELECT 1 FROM `support_faq` WHERE `question` = 'Сколько стоит?' LIMIT 1);

INSERT INTO `support_faq` (`question`, `answer`, `keywords`, `sort_order`, `is_active`)
SELECT * FROM (
  SELECT
    'Как связаться с вами?' AS question,
    'БАЗОВЫЙ ОТВЕТ (отредактируйте): напишите сюда в чат — оператор ответит, когда будет онлайн. Или укажите email/Telegram в форме контакта. Также: страница «Контакты» на сайте.' AS answer,
    'контакт,связаться,телефон,email,телеграм,написать' AS keywords,
    20 AS sort_order,
    1 AS is_active
) AS t
WHERE NOT EXISTS (SELECT 1 FROM `support_faq` WHERE `question` = 'Как связаться с вами?' LIMIT 1);

INSERT INTO `support_faq` (`question`, `answer`, `keywords`, `sort_order`, `is_active`)
SELECT * FROM (
  SELECT
    'Какие сроки?' AS question,
    'БАЗОВЫЙ ОТВЕТ (отредактируйте): типовой срок — от N дней после согласования ТЗ. Точные сроки зависят от объёма. Опишите задачу — оценим.' AS answer,
    'срок,сроки,когда,долго,быстро,дедлайн' AS keywords,
    30 AS sort_order,
    1 AS is_active
) AS t
WHERE NOT EXISTS (SELECT 1 FROM `support_faq` WHERE `question` = 'Какие сроки?' LIMIT 1);

INSERT INTO `support_faq` (`question`, `answer`, `keywords`, `sort_order`, `is_active`)
SELECT * FROM (
  SELECT
    'Как заказать / купить?' AS question,
    'БАЗОВЫЙ ОТВЕТ (отредактируйте): выберите услугу/товар на сайте и оформите заказ, либо напишите сюда «хочу заказать» — подскажем шаги. После оплаты пришлём детали на email.' AS answer,
    'заказать,купить,оформить,заказ,как купить' AS keywords,
    40 AS sort_order,
    1 AS is_active
) AS t
WHERE NOT EXISTS (SELECT 1 FROM `support_faq` WHERE `question` = 'Как заказать / купить?' LIMIT 1);

INSERT INTO `support_faq` (`question`, `answer`, `keywords`, `sort_order`, `is_active`)
SELECT * FROM (
  SELECT
    'Что входит в услуги?' AS question,
    'БАЗОВЫЙ ОТВЕТ (отредактируйте): обычно — консультация, настройка/разработка, передача доступов, краткая инструкция. Точный состав — в описании услуги или по запросу.' AS answer,
    'услуги,что входит,состав,пакет,что получаю' AS keywords,
    50 AS sort_order,
    1 AS is_active
) AS t
WHERE NOT EXISTS (SELECT 1 FROM `support_faq` WHERE `question` = 'Что входит в услуги?' LIMIT 1);

INSERT INTO `support_faq` (`question`, `answer`, `keywords`, `sort_order`, `is_active`)
SELECT * FROM (
  SELECT
    'Есть ли демо / примеры работ?' AS question,
    'БАЗОВЫЙ ОТВЕТ (отредактируйте): да — смотрите раздел «Проекты» / портфолио на сайте. Если нужно демо админки — напишите, дадим ссылку или доступ.' AS answer,
    'демо,примеры,портфолио,кейсы,работы,посмотреть' AS keywords,
    60 AS sort_order,
    1 AS is_active
) AS t
WHERE NOT EXISTS (SELECT 1 FROM `support_faq` WHERE `question` = 'Есть ли демо / примеры работ?' LIMIT 1);

INSERT INTO `support_faq` (`question`, `answer`, `keywords`, `sort_order`, `is_active`)
SELECT * FROM (
  SELECT
    'Как войти в админку?' AS question,
    'БАЗОВЫЙ ОТВЕТ (отредактируйте): адрес админки — /admin (или ваш кастомный путь). Логин — email, пароль вы задавали при регистрации/выдаче. Забыли пароль? Напишите оператору с email аккаунта.' AS answer,
    'админка,вход,логин,пароль,войти,cms' AS keywords,
    70 AS sort_order,
    1 AS is_active
) AS t
WHERE NOT EXISTS (SELECT 1 FROM `support_faq` WHERE `question` = 'Как войти в админку?' LIMIT 1);

INSERT INTO `support_faq` (`question`, `answer`, `keywords`, `sort_order`, `is_active`)
SELECT * FROM (
  SELECT
    'Не работает сайт / ошибка' AS question,
    'БАЗОВЫЙ ОТВЕТ (отредактируйте): опишите, что именно сломалось (страница, форма, оплата) и приложите скрин/текст ошибки. Оператор разберёт. Срочно — оставьте телефон/Telegram.' AS answer,
    'не работает,ошибка,сломалось,баг,не открывается,проблема' AS keywords,
    80 AS sort_order,
    1 AS is_active
) AS t
WHERE NOT EXISTS (SELECT 1 FROM `support_faq` WHERE `question` = 'Не работает сайт / ошибка' LIMIT 1);

INSERT INTO `support_faq` (`question`, `answer`, `keywords`, `sort_order`, `is_active`)
SELECT * FROM (
  SELECT
    'Можно ли правки после сдачи?' AS question,
    'БАЗОВЫЙ ОТВЕТ (отредактируйте): небольшие правки в гарантийный период — бесплатно (укажите срок). Крупные доработки — отдельная оценка. Напишите, что нужно изменить.' AS answer,
    'правки,доработка,изменения,после сдачи,гарантия' AS keywords,
    90 AS sort_order,
    1 AS is_active
) AS t
WHERE NOT EXISTS (SELECT 1 FROM `support_faq` WHERE `question` = 'Можно ли правки после сдачи?' LIMIT 1);

INSERT INTO `support_faq` (`question`, `answer`, `keywords`, `sort_order`, `is_active`)
SELECT * FROM (
  SELECT
    'Какие способы оплаты?' AS question,
    'БАЗОВЫЙ ОТВЕТ (отредактируйте): карта, СБП / ЮKassa и др. (что включено на сайте). Счёт для юрлиц — по запросу. Напишите «нужен счёт».' AS answer,
    'оплата,карта,сбп,счёт,юкасса,как оплатить' AS keywords,
    100 AS sort_order,
    1 AS is_active
) AS t
WHERE NOT EXISTS (SELECT 1 FROM `support_faq` WHERE `question` = 'Какие способы оплаты?' LIMIT 1);

INSERT INTO `support_faq` (`question`, `answer`, `keywords`, `sort_order`, `is_active`)
SELECT * FROM (
  SELECT
    'Работаете с юрлицами?' AS question,
    'БАЗОВЫЙ ОТВЕТ (отредактируйте): да, работаем с ИП и ООО: договор, счёт, закрывающие. Пришлите реквизиты — подготовим документы.' AS answer,
    'юрлицо,ооо,ип,договор,реквизиты,счёт' AS keywords,
    110 AS sort_order,
    1 AS is_active
) AS t
WHERE NOT EXISTS (SELECT 1 FROM `support_faq` WHERE `question` = 'Работаете с юрлицами?' LIMIT 1);

INSERT INTO `support_faq` (`question`, `answer`, `keywords`, `sort_order`, `is_active`)
SELECT * FROM (
  SELECT
    'Часы работы поддержки' AS question,
    'БАЗОВЫЙ ОТВЕТ (отредактируйте): операторы онлайн примерно Пн–Пт, 10:00–19:00 (МСК). Вне часов отвечает бот и сохраняет ваш контакт — ответим в рабочее время.' AS answer,
    'часы,график,когда отвечаете,режим,онлайн' AS keywords,
    120 AS sort_order,
    1 AS is_active
) AS t
WHERE NOT EXISTS (SELECT 1 FROM `support_faq` WHERE `question` = 'Часы работы поддержки' LIMIT 1);
