import { describe, expect, it } from 'vitest'
import { DEF, normalizeState, SCHEMA_VERSION } from './index.js'
import { PROFILE_CLEAN } from './fields.js'

// Every DEF key needs one decision about cleaning. A new field fails here until it joins one list.

// normalizeState shapes these itself: admit stamps the version, collections are reset to their type.
const STRUCTURAL = ['schemaVersion', 'workouts', 'routines', 'bodyweight', 'customEx', 'favorites', 'week', 'dayPlan', 'reminder', 'active']

// Kept as stored, because every reader already defends itself.
const PASS_THROUGH = {
  sound: 'read as truthy (`!!S.sound`), so any value is a boolean',
  keepAwake: 'read as `!== false`, so any other value means on',
  body: "Settings reads `=== 'female'` and BodyMap falls back to the male map",
  targetW: 'stats-selectors keeps only a finite positive number as the goal',
  gifSize: "Media reads `=== 'mini'`, so any other value is full size",
  effort: 'effortOf falls back to the default for an unknown value',
  lastExport: 'read only by backupDue, where a bad value at worst shows or hides the backup reminder',
}

function unlistedKeys(def) {
  const listed = new Set([...Object.keys(PROFILE_CLEAN), ...STRUCTURAL, ...Object.keys(PASS_THROUGH)])
  return Object.keys(def).filter(key => !listed.has(key))
}

describe('every DEF key is cleaned, structural or pass-through', () => {
  it('leaves no DEF key undecided', () => {
    expect(unlistedKeys(DEF)).toEqual([])
  })

  it('fails a new DEF field that joins no list', () => {
    expect(unlistedKeys({ ...DEF, newField: 1 })).toEqual(['newField'])
  })

  it('puts each key on one list only', () => {
    const all = [...Object.keys(PROFILE_CLEAN), ...STRUCTURAL, ...Object.keys(PASS_THROUGH)]
    expect(all).toHaveLength(new Set(all).size)
  })

  it('lists no key DEF lacks', () => {
    const all = [...Object.keys(PROFILE_CLEAN), ...STRUCTURAL, ...Object.keys(PASS_THROUGH)]
    expect(all.filter(key => !Object.hasOwn(DEF, key))).toEqual([])
  })

  it('gives each pass-through key a reason', () => {
    for (const reason of Object.values(PASS_THROUGH)) expect(reason).toMatch(/\w{3}/)
  })
})

describe('a hostile payload comes in as a clean Profile', () => {
  it('cleans unit, restSec and theme', () => {
    const S = normalizeState({ schemaVersion: SCHEMA_VERSION, unit: 'lbs', restSec: 'x', theme: 5 })
    expect(S.unit).toBe('lb')
    expect(S.restSec).toBe(90)
    expect(S.theme).toBe('dark')
  })

  it.each([0, -30, NaN, Infinity, '90', null])('turns restSec %s into 90', restSec => {
    expect(normalizeState({ schemaVersion: SCHEMA_VERSION, restSec }).restSec).toBe(90)
  })

  it('keeps a stored rest and a light theme', () => {
    const S = normalizeState({ schemaVersion: SCHEMA_VERSION, restSec: 150, theme: 'light' })
    expect(S.restSec).toBe(150)
    expect(S.theme).toBe('light')
  })

  it('reads a non-string displayName as no name', () => {
    expect(normalizeState({ schemaVersion: SCHEMA_VERSION, displayName: 5 }).displayName).toBe(null)
    expect(normalizeState({ schemaVersion: SCHEMA_VERSION, displayName: 'Sky' }).displayName).toBe('Sky')
  })
})
