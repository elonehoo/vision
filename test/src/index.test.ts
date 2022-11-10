import { describe, expect, it } from 'vitest'
import { one } from 'vision'

describe('should', () => {
  it('exported', () => {
    expect(one).toEqual(1)
  })
})
