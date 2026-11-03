import { diagramImageSize } from './diagram-image'

test('preserves the authored location-label ratio', () => {
  const size = diagramImageSize({ width: 328, height: 148 })
  expect(size.aspectRatio).toBeCloseTo(328 / 148)
  expect(size.maxHeight).toBe(280)
  expect(size.maxWidth / size.aspectRatio).toBeCloseTo(280)
})

test.each([
  [200, 400, 140],
  [400, 400, 280],
  [1600, 400, 1120],
])('caps a %s by %s diagram without stretching it', (width, height, maxWidth) => {
  const size = diagramImageSize({ width, height })
  expect(size).toEqual({ aspectRatio: width / height, maxHeight: 280, maxWidth })
  // Full width on a narrow phone; width also shrinks when the height cap wins.
  for (const availableWidth of [120, 328, 800]) {
    const renderedWidth = Math.min(availableWidth, size.maxWidth)
    const renderedHeight = renderedWidth / size.aspectRatio
    expect(renderedHeight).toBeLessThanOrEqual(280)
    expect(renderedWidth / renderedHeight).toBeCloseTo(width / height)
  }
})

test.each([
  [0, 100], [100, 0], [-100, 100], [100, -100], [NaN, 100], [100, Infinity],
])('uses a finite square placeholder for invalid dimensions %s by %s', (width, height) => {
  expect(diagramImageSize({ width, height })).toEqual({ aspectRatio: 1, maxHeight: 280, maxWidth: 280 })
})
