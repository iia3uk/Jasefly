# Maps — примеры

## Одна точка

```jsx
<Map
  center={{ lat: 55.7558, lng: 37.6173 }}
  zoom={15}
  markers={[{
    id: 'clinic',
    lat: 55.7558,
    lng: 37.6173,
    title: 'Стоматологическая клиника',
    description: 'г. Москва, ул. Примерная, д. 123',
  }]}
/>
```

## Несколько точек

```jsx
<Map
  fitBounds
  markers={[
    { id: 'a', lat: 55.75, lng: 37.62, title: 'A' },
    { id: 'b', lat: 55.76, lng: 37.64, title: 'B' },
    { id: 'c', lat: 55.74, lng: 37.60, title: 'C' },
  ]}
/>
```

## Пользовательский маркер

```jsx
<Map
  center={{ lat: 55.751244, lng: 37.618423 }}
  zoom={14}
  markers={[{
    id: 'custom',
    lat: 55.751244,
    lng: 37.618423,
    title: 'Кастом',
    iconUrl: '/modules/maps/assets/images/marker-icon.png',
    iconSize: [25, 41],
  }]}
/>
```

## Открытие маршрута

```js
import { buildDirectionsUrl, openDirections } from '/modules/maps/index.js'

openDirections({ lat: 55.7558, lng: 37.6173 }, 'osm')
// или Google / Yandex:
buildDirectionsUrl('Москва, Красная площадь', 'google')
```

В UI: `showDirectionsLink` + `directions={{ target, service: 'osm' }}`.

## Fallback при ошибке

```jsx
<Map
  forceError  // demo only; или сбой загрузки Leaflet
  address="г. Москва, ул. Примерная, д. 123"
  showDirectionsLink
  markers={[{ id: 'x', lat: 55.7558, lng: 37.6173, title: 'Клиника' }]}
  onError={(err) => console.warn(err)}
/>
```

Страница не падает: адрес + кнопка «Построить маршрут».

## Билдер

Виджет `maps.map`: задайте `center_lat` / `center_lng` / `zoom` / `address` / `marker_*` или `markers_json`.
