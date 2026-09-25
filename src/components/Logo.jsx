import { useId } from 'react'
import { useTheme } from '../context/ThemeContext'

/**
 * Shared brand badge logo.
 *
 * Dark mode: raw logo pixels on the badge matched to the logo's baked
 * dark-green field (#2B5D50 sampled from images/logo.png).
 * Light mode: white badge + monogram in brand emerald (#00A86B) via a
 * calibrated duotone filter (bg luminance <= 0.40 -> white, stroke
 * luminance >= 0.98 -> emerald), scoped to the light theme only.
 *
 * The image (images/logo-badge.png) is a pre-rendered SQUARE badge asset:
 * the original monogram centered on the same baked green field, so
 * object-cover fills the badge edge-to-edge with NO cropping and NO
 * letterboxing — the monogram keeps its margins at every size.
 * Pass sizing/decoration via `className`.
 */
const DARK_BADGE = '#2B5D50'
const LIGHT_BADGE = '#FFFFFF'

export default function Logo({ className = '', imgClassName = '' }) {
  const { theme } = useTheme()
  const rawId = useId()
  const filterId = `mm-logo-duotone-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`
  const isLight = theme === 'light'

  return (
    <div
      className={`relative overflow-hidden shrink-0 ${className}`}
      style={{ backgroundColor: isLight ? LIGHT_BADGE : DARK_BADGE }}
    >
      <img
        src={`${import.meta.env.BASE_URL}images/logo-badge.png`}
        alt="MM Padel Academy Logo"
        className={`block w-full h-full object-cover ${imgClassName}`}
        style={isLight ? { filter: `url(#${filterId})` } : undefined}
      />
      <svg width="0" height="0" className="absolute w-0 h-0" aria-hidden="true" focusable="false">
        <filter id={filterId} colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values="0.2126 0.7152 0.0722 0 0
                    0.2126 0.7152 0.0722 0 0
                    0.2126 0.7152 0.0722 0 0
                    0      0      0      1 0"
          />
          <feComponentTransfer>
            <feFuncR type="linear" slope="-1.7241" intercept="1.6897" />
            <feFuncG type="linear" slope="-0.5879" intercept="1.2352" />
            <feFuncB type="linear" slope="-1.0000" intercept="1.4000" />
          </feComponentTransfer>
        </filter>
      </svg>
    </div>
  )
}
