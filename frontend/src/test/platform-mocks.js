import { vi } from 'vitest'

// Boundary mocks shared by the tests. Each one starts from the real module, so a new export
// is mocked (or kept) without editing every test, and a test can never see a module with
// exports the app lacks. Use inside the factory, because vi.mock is hoisted above imports:
//   vi.mock('../platform/sound.js', async orig => (await import('../test/platform-mocks.js')).mockSound(await orig()))

const stubFunctions = actual => Object.fromEntries(
  Object.entries(actual).map(([name, value]) => [name, typeof value === 'function' ? vi.fn() : value]),
)

/** Sound and haptics: every function silent, nothing reaches Web Audio or `navigator.vibrate`. */
export const mockSound = actual => stubFunctions(actual)

/** The native shell: a web build (`MOBILE` false) with no saved file, unless `overrides` say otherwise. */
export const mockMobile = (actual, overrides = {}) => ({
  ...stubFunctions(actual),
  MOBILE: false,
  nativeLoad: vi.fn(async () => null),
  nativeSave: vi.fn(async () => {}),
  syncReminder: vi.fn(async () => true),
  shareExport: vi.fn(async () => {}),
  ...overrides,
})
