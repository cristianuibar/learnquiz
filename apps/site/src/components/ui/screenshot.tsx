export function Screenshot({
  name,
  alt,
  width,
  height,
  priority = false,
  dark = true,
  className,
}: {
  name: string
  alt: string
  width: number
  height: number
  priority?: boolean
  dark?: boolean
  className: string
}) {
  const variants = dark ? [name, `${name}-dark`] : [name]
  return variants.map((file, i) => (
    <img
      key={file}
      src={`/screenshots/${file}.webp`}
      srcSet={`/screenshots/${file}.webp 1x, /screenshots/${file}@2x.webp 2x`}
      alt={alt}
      width={width}
      height={height}
      loading={priority && i === 0 ? 'eager' : 'lazy'}
      fetchPriority={priority && i === 0 ? 'high' : undefined}
      className={[className, dark ? (i === 0 ? 'shot-light' : 'shot-dark') : ''].filter(Boolean).join(' ')}
    />
  ))
}
