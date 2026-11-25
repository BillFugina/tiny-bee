import { describe, expect, it } from 'vitest'
import { createTownDirectory, townLabel } from '../server/places/directory.js'
import { fixtureTowns } from './fixtures/towns.js'

const towns = createTownDirectory(fixtureTowns)

describe('town search', () => {
  it('matches name prefixes, biggest first', () => {
    expect(towns.search('west').map(townLabel)).toEqual(['Westfield, VA', 'Westford, NC', 'Westford, MA'])
  })

  it('puts exact name matches ahead of bigger prefix matches', () => {
    expect(towns.search('westford').map(townLabel)).toEqual(['Westford, NC', 'Westford, MA'])
  })

  it('narrows by region or country after a comma', () => {
    expect(towns.search('westford, ma').map(townLabel)).toEqual(['Westford, MA'])
    expect(towns.search('west, va').map(townLabel)).toEqual(['Westfield, VA'])
  })

  it('ignores case and accents', () => {
    expect(towns.search('SAO B').map(townLabel)).toEqual(['São Bento, BR'])
  })

  it('needs at least two letters', () => {
    expect(towns.search('w')).toEqual([])
  })

  it('caps the number of results', () => {
    expect(towns.search('west', 1)).toHaveLength(1)
  })
})

describe('town lookup', () => {
  it('finds a town by id', () => {
    expect(towns.get(3)?.name).toBe('Eastford')
    expect(towns.get(999)).toBeUndefined()
  })

  it('lists towns near a point, nearest first', () => {
    const near = towns.near({ lat: 35.0, lng: -79.5 }, 60).map((t) => t.name)
    expect(near).toEqual(['Midway', 'Westford', 'Eastford'])
  })

  it('leaves out towns beyond the radius', () => {
    expect(towns.near({ lat: 35.0, lng: -79.5 }, 10).map((t) => t.name)).toEqual(['Midway'])
  })
})
