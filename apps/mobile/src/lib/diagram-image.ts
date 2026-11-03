export function diagramImageSize({ width, height }: { width: number; height: number }) {
  const ratio = width / height
  const aspectRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1
  const maxHeight = 280
  return { aspectRatio, maxHeight, maxWidth: maxHeight * aspectRatio }
}
