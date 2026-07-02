import type { CSSProperties } from 'react'

interface IconProps {
  /** Imported SVG URL (e.g. `import editIcon from '../../icons/edit.svg'`). */
  src: string
  /** Square size in pixels. Defaults to 16. */
  size?: number
  className?: string
  title?: string
}

/**
 * Renders a monochrome SVG as a CSS mask so it inherits the current text color
 * (`currentColor`). This lets one icon asset match whatever button it sits in —
 * dark on neutral buttons, red on danger buttons, white on colored buttons.
 */
export default function Icon({ src, size = 16, className, title }: IconProps) {
  const style: CSSProperties = {
    '--icon': `url("${src}")`,
    width: size,
    height: size,
  } as CSSProperties
  return (
    <span
      className={`ui-icon${className ? ` ${className}` : ''}`}
      style={style}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    />
  )
}
