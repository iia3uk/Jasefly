/**
 * Node tests for Maps pure core (no DOM).
 * Run: node --test modules-src/maps/tests/maps-core.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDirectionsUrl,
  computeBounds,
  normalizeMarkers,
  resolveCenter,
  createProviderRegistry,
  resolveDirectionsTarget,
} from '../frontend-dist/maps-core.js'

describe('buildDirectionsUrl', () => {
  it('builds OSM directions from coords', () => {
    const url = buildDirectionsUrl({ lat: 55.7558, lng: 37.6173 }, 'osm')
    assert.ok(url.includes('openstreetmap.org/directions'))
    assert.ok(url.includes('55.7558'))
    assert.ok(url.includes('37.6173'))
  })

  it('builds Google directions from coords', () => {
    const url = buildDirectionsUrl({ lat: 55.75, lng: 37.62 }, 'google')
    assert.equal(url, 'https://www.google.com/maps/dir/?api=1&destination=55.75,37.62')
  })

  it('builds Yandex directions from coords', () => {
    const url = buildDirectionsUrl({ lat: 55.75, lng: 37.62 }, 'yandex')
    assert.ok(url.includes('yandex.ru/maps'))
    assert.ok(url.includes('55.75,37.62'))
  })

  it('builds OSM search from address string', () => {
    const url = buildDirectionsUrl('Москва, Красная площадь', 'osm')
    assert.ok(url.includes('openstreetmap.org/search'))
    assert.ok(url.includes(encodeURIComponent('Москва, Красная площадь')))
  })

  it('returns null for empty target', () => {
    assert.equal(buildDirectionsUrl({}), null)
  })
})

describe('resolveDirectionsTarget', () => {
  it('accepts string address', () => {
    assert.deepEqual(resolveDirectionsTarget('  Foo  '), { address: 'Foo' })
  })

  it('accepts lat/lng object', () => {
    assert.deepEqual(resolveDirectionsTarget({ lat: 1, lng: 2 }), { coords: { lat: 1, lng: 2 } })
  })
})

describe('computeBounds', () => {
  it('returns null for empty', () => {
    assert.equal(computeBounds([]), null)
  })

  it('pads single point', () => {
    const b = computeBounds([{ lat: 10, lng: 20 }])
    assert.ok(b.south < 10 && b.north > 10)
    assert.ok(b.west < 20 && b.east > 20)
  })

  it('covers multiple points', () => {
    const b = computeBounds([
      { lat: 1, lng: 1 },
      { lat: 3, lng: 5 },
    ])
    assert.equal(b.south, 1)
    assert.equal(b.north, 3)
    assert.equal(b.west, 1)
    assert.equal(b.east, 5)
  })
})

describe('normalizeMarkers', () => {
  it('filters invalid and assigns ids', () => {
    const markers = normalizeMarkers([
      { lat: 55.7, lng: 37.6, title: 'A' },
      { lat: 'bad', lng: 1 },
      { id: 'clinic', lat: 1, lng: 2, description: 'D', icon_url: '/x.png' },
    ])
    assert.equal(markers.length, 2)
    assert.equal(markers[0].id, 'm-1')
    assert.equal(markers[0].title, 'A')
    assert.equal(markers[1].id, 'clinic')
    assert.equal(markers[1].iconUrl, '/x.png')
  })
})

describe('resolveCenter', () => {
  it('prefers explicit center', () => {
    assert.deepEqual(
      resolveCenter({ lat: 1, lng: 2 }, [{ lat: 9, lng: 9 }]),
      { lat: 1, lng: 2 },
    )
  })

  it('uses single marker', () => {
    assert.deepEqual(resolveCenter(undefined, [{ lat: 3, lng: 4 }]), { lat: 3, lng: 4 })
  })
})

describe('createProviderRegistry', () => {
  it('registers and resolves default osm', () => {
    const reg = createProviderRegistry()
    const stub = {
      id: 'osm',
      label: 'OSM',
      load: async () => {},
      createMap: () => ({}),
      destroy: () => {},
    }
    reg.register(stub)
    assert.equal(reg.get().id, 'osm')
    assert.equal(reg.get('OSM').id, 'osm')
    assert.equal(reg.list().length, 1)
  })

  it('rejects invalid adapter', () => {
    const reg = createProviderRegistry()
    assert.throws(() => reg.register({ id: 'x' }), /Invalid MapProviderAdapter/)
  })
})
