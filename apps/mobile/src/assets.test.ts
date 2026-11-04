import { readFileSync } from 'node:fs'
import { join } from 'node:path'

test.each([
  ['icon.png', 1024],
  ['adaptive-icon.png', 1024],
  ['notification-icon.png', 96],
] as const)('%s is a PNG at the required native resource size', (file, size) => {
  const png = readFileSync(join(__dirname, '../assets', file))

  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  expect(png.readUInt32BE(8)).toBe(13)
  expect(png.toString('ascii', 12, 16)).toBe('IHDR')
  expect(png.readUInt32BE(16)).toBe(size)
  expect(png.readUInt32BE(20)).toBe(size)
})
