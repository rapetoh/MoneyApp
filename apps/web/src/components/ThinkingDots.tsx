// Three-dot wave used inside the Ask Murmur thread while the reasoner is
// thinking. Pure CSS keyframes (defined in globals.css) so the animation
// keeps playing without re-rendering.
import { colors } from '../lib/theme'

export function ThinkingDots({ color = colors.accent }: { color?: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 12,
      }}
      aria-label="Thinking"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="murmur-thinking-dot"
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            background: color,
            animationDelay: `${i * 160}ms`,
          }}
        />
      ))}
    </span>
  )
}
