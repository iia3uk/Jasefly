# Jasefly Character — дух CMS

Не чат-бот: поведение, взгляд, поза. Реагирует на события CMS и сам приходит играть: гоняется за курсором, бродит, прячется у логотипа, подсказывает пункты меню.

## Палитра

| Роль | HEX |
| --- | --- |
| Основной | `#17A8FF` |
| Тёмный | `#0A1625` |
| Белый | `#FFFFFF` |
| Доп. голубой | `#5FD6FF` |

## Event API (предпочтительно)

Ядро и ZIP-модули шлют состояние; Character сам выбирает эмоцию по маппингу настроек.

```js
// Core / bundled FE
import { emitSpirit, SPIRIT_EVENTS } from '@/lib/jaseflySpirit'
emitSpirit(SPIRIT_EVENTS.MODULE_INSTALL_SUCCESS)

// ZIP / runtime
window.jaseflySpirit.emit('indexnow.done')
window.dispatchEvent(new CustomEvent('jasefly-spirit', {
  detail: { event: 'ai.finished', force: false },
}))
```

Известные события: `module.install.start|success|error`, `module.update.success`, `admin.welcome`, `admin.idle`, `content.publish`, `content.save`, `cms.error`, `indexnow.done`, `ai.finished`, `build.success|error`, `landing.visit`.

Любой новый `event` можно привязать к эмоции/позе в админке **Оформление → Дух CMS** без правки ядра.

Presence: `cooldown_sec`, `max_per_hour`, `idle_minutes`; `force: true` обходит лимиты (критичные success/error).

## Imperative API

```js
window.jaseflyCharacter.show({ emotion, pose, anchor, duration, size })
window.jaseflyCharacter.hide()
window.jaseflyCharacter.react('content.publish')
window.jaseflyCharacter.wave()
window.jaseflyCharacter.celebrate()
window.jaseflyCharacter.error()
```

Legacy: `CustomEvent('jasefly-character', { detail: { action: 'celebrate' } })`.

Эмоции: `neutral` `happy` `sleep` `think` `love` `angry` `loading` `error` `success`  
Позы: `idle` `hover` `wave` `look` `thinking` `inspect` `sleep` `celebrate`

## Figma / SVG

Статический нейтральный вариант: `assets/jasefly-character-neutral.svg`
