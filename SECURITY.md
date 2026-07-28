# Security checklist — Jasefly CMS

Минимальный набор hardening для PHP-сайта на shared/VPS хостинге.

## Module packages

Установка ZIP-модуля равносильна установке серверного ПО. Проверки: Zip Slip/bomb, checksums, path jail, optional ed25519, permissions без auto-grant. См. `docs/MODULE-SECURITY.md`.

## В приложении (CMS)

| Требование | Статус |
|---|---|
| `PDO::prepare()` во всех SQL | Да — через `Database::run` / `one` / `all` |
| Пароли Argon2id / `PASSWORD_DEFAULT` | Да — `App\Utils\Password` (+ rehash при логине) |
| 2FA для админки | Да — TOTP (`/auth/2fa/*`, страница «Пароль») |
| Ограничение загрузок + запрет PHP в uploads | Да — MIME allowlist + `storage/uploads/.htaccess` |
| Зашифрованные бэкапы | Да — `.sql.enc` (libsodium / AES-256-GCM) |
| WAF / Anti-DDoS перед приложением | Плагин **DDoS защита** + edge (Cloudflare / DDoS-Guard / StormWall / Qrator) |
| Регулярная проверка по OWASP Top 10 | См. раздел ниже + code review перед релизом |

## На сервере / хостинге (обязательно вручную)

1. **MySQL недоступен из интернета** — `bind-address = 127.0.0.1` (или только private VLAN); в панели хостинга отключите remote MySQL.
2. **Приложение не под root** — PHP-FPM / Apache worker = отдельный пользователь (`www-data`, `u1234` и т.п.).
3. **Секреты вне document root** — `.env` / `config.local.php`, `.git`, логи и бэкапы не должны отдаваться по HTTP. В пакете хостинга `api/config`, `api/src`, `api/storage` закрыты `.htaccess`; на VPS предпочтительно вынести `api/` выше `public_html`.
4. **2FA** — включите в панели хостинга, для SSH (например Fail2ban + ключи) и в админке CMS (TOTP).
5. **SSH только по ключам**, `PermitRootLogin no`, парольный вход отключён.
6. **Обновления** — PHP, Composer-пакеты (если есть), ОС/панели по расписанию.
7. **WAF + Anti-DDoS** — Cloudflare / DDoS-Guard / StormWall / Qrator *перед* origin; в CMS включите соответствующий провайдер в плагине DDoS.
8. **Бэкапы** — копируйте `storage/backups/*.sql.enc` в отдельное хранилище (S3/другой сервер); ключ = `backup_key` или `jwt_secret`.

## OWASP Top 10 — привычки при разработке

- **A01 Broken Access Control** — все `/admin/*` и мутации через `AuthMiddleware` + permissions.
- **A02 Cryptographic Failures** — HTTPS only; секреты не в git; Argon2id; encrypted backups.
- **A03 Injection** — только prepared statements; никогда не склеивать SQL из user input.
- **A04 Insecure Design** — rate limit на login/2FA; challenge JWT с коротким TTL.
- **A05 Security Misconfiguration** — убрать `install.php` после установки; `display_errors=Off` в prod.
- **A06 Vulnerable Components** — обновлять PHP и зависимости.
- **A07 Auth Failures** — сильные пароли + 2FA; refresh token **rotation** on `/auth/refresh` + revocation on logout. SPA (`frontend/src/lib/api.ts`) делает single-flight silent refresh и один retry на admin 401, затем logout.
- **A08 Data Integrity** — не доверять клиентским расширениям файлов; проверять MIME.
- **A09 Logging/Monitoring** — activity log + `storage/logs`; не логировать пароли/токены (Automation `redact`).
- **A10 SSRF** — `App\Support\SsrfGuard` на Forms/Automation/Webhooks outbound HTTP; private hosts rejected.

### Platform modules

- Forms: honeypot, timing, IP/UA HMAC hashes, backend validation, CSV formula escape (`=+-@`), webhook SSRF via `SsrfGuard`.
- Scheduler: token-gated HTTP tick; job payload secrets masked in admin.
- Automation: no `eval`, recursion/max-steps guards, webhook SSRF via `SsrfGuard`.
- Newsletter: HMAC unsubscribe/confirm tokens; double opt-in.
- Analytics: hashed visitor/session by default; no raw IP storage unless explicitly configured.
- Orders: server-side totals; public_id for non-enumerable public refs.
- Webhooks plugin: SSRF on register/dispatch; HMAC signature header when secret is set.

Regression proof: `php backend/tests/run.php` → `SecurityVerificationTest`.

Подробности деплоя: `release/DEPLOYMENT-RU.md` рядом с ZIP после `build-hosting` (секция «Безопасность»).
