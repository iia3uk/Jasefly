# Automation

Модуль запускает декларативные сценарии по событиям CMS. По умолчанию отключён и требует Scheduler.

Definition:

```json
{
  "conditions": {"all": [{"path": "submission.form_id", "operator": "equals", "value": 1}]},
  "steps": [{"action": "create_notification", "config": {"title": "Новая заявка", "body": "{{submission.public_id}}"}}]
}
```

Действия: `send_email`, `send_telegram`, `send_webhook`, `create_notification`, `update_submission`, `delay`, `branch`, `stop`. Webhook запрещает локальные и private/reserved адреса. Задержки выполняет cron Scheduler через `automation.resume`.
