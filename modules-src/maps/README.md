# Maps — универсальный модуль интерактивных карт

ZIP-пакет для Jasefly Platform SDK. Провайдерный адаптер; **по умолчанию Яндекс Карты** (официальный map-widget, удобно для РФ). Опционально — OpenStreetMap + Leaflet (SVG-маркеры, без политического prefix Leaflet).

Публичный API компонента не привязан к поставщику: Google / Mapbox можно добавить адаптером без смены props.

## Установка

```bash
node scripts/build-module.js maps --yes
# затем загрузить ZIP через админку Модули или MCP cms_module_install
```

После включения: виджет билдера `maps.map`, админка `/admin/maps`, демо `/maps-demo`.

## Публичный API

```js
import { createMapsApi, buildDirectionsUrl, openDirections } from '/modules/maps/index.js'

const { Map, Marker, Popup } = createMapsApi(ui) // ui = ctx.ui (host React)

ui.createElement(Map, {
  center: { lat: 55.7558, lng: 37.6173 },
  zoom: 15,
  markers: [{
    id: 'clinic',
    lat: 55.7558,
    lng: 37.6173,
    title: 'Стоматологическая клиника',
    description: 'г. Москва, ул. Примерная, д. 123',
  }],
  address: 'г. Москва, ул. Примерная, д. 123',
  showDirectionsLink: true,
  onMapClick: (ll) => {},
  onMarkerClick: (m) => {},
  onBoundsChange: (b) => {},
  onZoomChange: (z) => {},
  onReady: () => {},
  onError: (err) => {},
})
```

### Map props (v1)

| Prop | Тип | Описание |
| --- | --- | --- |
| `center` | `{lat,lng}` | Центр карты |
| `zoom` | number | Масштаб |
| `markers` | `MapMarker[]` | Маркеры |
| `height` | number \| string | Высота |
| `interactive` | boolean | Выключить drag/zoom/click |
| `scrollWheelZoom` | boolean | Zoom колёсиком |
| `dragging` | boolean | Перетаскивание |
| `fitBounds` | boolean | Вписать все маркеры |
| `showReset` / `showZoomControls` | boolean | Кнопки управления |
| `provider` | string | По умолчанию `osm` |
| `apiKey` / `mapStyle` / `locale` | string | Конфиг провайдера |
| `address` | string | A11y + fallback |
| `showDirectionsLink` | boolean | Кнопка «Построить маршрут» |
| `directions` | `{ target, service? }` | Цель маршрута (`osm`\|`google`\|`yandex`) |
| события | callbacks | `onMapClick`, `onMarkerClick`, `onBoundsChange`, `onZoomChange`, `onReady`, `onError` |

### Адаптер провайдера

```ts
type MapProviderAdapter = {
  id: string
  label: string
  load(assetBase: string): Promise<void>
  createMap(container: HTMLElement, options: MapInitOptions): MapHandle
  destroy(handle: MapHandle): void
}
```

Регистрация: `createProviderRegistry().register(adapter)`.

## Примеры

См. [docs/examples.md](docs/examples.md) и живое демо `/maps-demo`.

## Вне scope v1

Геокодирование, маршруты внутри карты, кластеры, тепловые карты, редактор геометрии — архитектура позволяет добавить позже.

## Тесты

```bash
node --test modules-src/maps/tests/maps-core.test.mjs
```
