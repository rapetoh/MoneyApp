// QR code for https://itsmurmur.com/plus (the Plus hand-off page), drawn as
// SVG so it stays sharp at any size and needs no runtime QR library.
//
// Error correction H (30% recoverable) leaves room for the Murmur mark in
// the centre: the 9x9 centre modules are cleared for it (7.4% of the code).
// The three finder squares are drawn rounded; readers only need their
// 1:1:3:1:1 proportions, which the rounding keeps.
//
// Regenerate only if the URL changes: qrcode@1.5.4,
// `QR.create(url, { errorCorrectionLevel: 'H' })`, one path run per row of
// dark modules, skipping the three finders and the 9x9 centre. Checked to
// decode from a real screenshot with jsQR (docs/plus-gate.md).
import { MurmurMark } from './MurmurMark'

const SIZE = 33
const MODULES =
  'M9 0h1v1h-1zM11 0h4v1h-4zM17 0h1v1h-1zM19 0h1v1h-1zM22 0h1v1h-1zM24 0h1v1h-1zM10 1h1v1h-1zM12 1h1v1h-1zM16 1h1v1h-1zM20 1h1v1h-1zM22 1h1v1h-1zM24 1h1v1h-1zM8 2h1v1h-1zM11 2h7v1h-7zM19 2h3v1h-3zM23 2h2v1h-2zM8 3h3v1h-3zM12 3h2v1h-2zM20 3h2v1h-2zM23 3h1v1h-1zM9 4h1v1h-1zM11 4h1v1h-1zM13 4h2v1h-2zM16 4h1v1h-1zM18 4h3v1h-3zM22 4h3v1h-3zM9 5h5v1h-5zM15 5h1v1h-1zM18 5h2v1h-2zM23 5h1v1h-1zM8 6h1v1h-1zM10 6h1v1h-1zM12 6h1v1h-1zM14 6h1v1h-1zM16 6h1v1h-1zM18 6h1v1h-1zM20 6h1v1h-1zM22 6h1v1h-1zM24 6h1v1h-1zM10 7h2v1h-2zM20 7h1v1h-1zM24 7h1v1h-1zM3 8h2v1h-2zM6 8h2v1h-2zM10 8h2v1h-2zM13 8h2v1h-2zM16 8h1v1h-1zM18 8h3v1h-3zM24 8h1v1h-1zM29 8h2v1h-2zM4 9h2v1h-2zM8 9h3v1h-3zM12 9h2v1h-2zM17 9h1v1h-1zM21 9h1v1h-1zM23 9h1v1h-1zM25 9h1v1h-1zM27 9h3v1h-3zM31 9h1v1h-1zM2 10h2v1h-2zM5 10h3v1h-3zM11 10h2v1h-2zM16 10h1v1h-1zM18 10h3v1h-3zM22 10h4v1h-4zM27 10h1v1h-1zM29 10h1v1h-1zM31 10h2v1h-2zM0 11h1v1h-1zM4 11h2v1h-2zM7 11h1v1h-1zM9 11h6v1h-6zM16 11h2v1h-2zM19 11h1v1h-1zM21 11h5v1h-5zM27 11h2v1h-2zM30 11h2v1h-2zM0 12h1v1h-1zM2 12h3v1h-3zM6 12h1v1h-1zM9 12h1v1h-1zM21 12h1v1h-1zM23 12h2v1h-2zM26 12h4v1h-4zM31 12h1v1h-1zM0 13h2v1h-2zM3 13h3v1h-3zM8 13h1v1h-1zM21 13h1v1h-1zM23 13h1v1h-1zM27 13h3v1h-3zM31 13h1v1h-1zM3 14h5v1h-5zM9 14h3v1h-3zM24 14h1v1h-1zM26 14h2v1h-2zM1 15h1v1h-1zM5 15h1v1h-1zM7 15h2v1h-2zM11 15h1v1h-1zM23 15h5v1h-5zM29 15h1v1h-1zM3 16h1v1h-1zM6 16h4v1h-4zM11 16h1v1h-1zM23 16h1v1h-1zM26 16h5v1h-5zM0 17h1v1h-1zM2 17h1v1h-1zM4 17h2v1h-2zM7 17h2v1h-2zM11 17h1v1h-1zM22 17h1v1h-1zM24 17h1v1h-1zM26 17h4v1h-4zM2 18h2v1h-2zM6 18h1v1h-1zM8 18h1v1h-1zM10 18h1v1h-1zM21 18h1v1h-1zM23 18h1v1h-1zM25 18h2v1h-2zM29 18h4v1h-4zM0 19h3v1h-3zM4 19h1v1h-1zM7 19h1v1h-1zM10 19h1v1h-1zM22 19h3v1h-3zM26 19h5v1h-5zM3 20h2v1h-2zM6 20h1v1h-1zM9 20h1v1h-1zM11 20h1v1h-1zM24 20h2v1h-2zM27 20h1v1h-1zM29 20h1v1h-1zM31 20h1v1h-1zM0 21h1v1h-1zM2 21h3v1h-3zM8 21h3v1h-3zM14 21h2v1h-2zM18 21h2v1h-2zM25 21h6v1h-6zM0 22h1v1h-1zM2 22h9v1h-9zM12 22h5v1h-5zM20 22h3v1h-3zM24 22h1v1h-1zM26 22h1v1h-1zM28 22h3v1h-3zM32 22h1v1h-1zM0 23h1v1h-1zM2 23h2v1h-2zM5 23h1v1h-1zM7 23h1v1h-1zM11 23h1v1h-1zM13 23h3v1h-3zM17 23h1v1h-1zM28 23h1v1h-1zM30 23h1v1h-1zM32 23h1v1h-1zM0 24h3v1h-3zM6 24h2v1h-2zM9 24h3v1h-3zM13 24h1v1h-1zM15 24h1v1h-1zM18 24h1v1h-1zM20 24h1v1h-1zM24 24h5v1h-5zM31 24h2v1h-2zM8 25h2v1h-2zM14 25h2v1h-2zM20 25h1v1h-1zM22 25h3v1h-3zM28 25h1v1h-1zM30 25h2v1h-2zM8 26h1v1h-1zM10 26h3v1h-3zM15 26h2v1h-2zM18 26h2v1h-2zM21 26h4v1h-4zM26 26h1v1h-1zM28 26h2v1h-2zM9 27h1v1h-1zM12 27h1v1h-1zM15 27h3v1h-3zM19 27h1v1h-1zM23 27h2v1h-2zM28 27h4v1h-4zM8 28h2v1h-2zM13 28h2v1h-2zM17 28h5v1h-5zM23 28h7v1h-7zM31 28h1v1h-1zM8 29h1v1h-1zM11 29h2v1h-2zM16 29h1v1h-1zM18 29h2v1h-2zM21 29h1v1h-1zM25 29h1v1h-1zM27 29h1v1h-1zM29 29h3v1h-3zM10 30h5v1h-5zM16 30h3v1h-3zM28 30h1v1h-1zM30 30h3v1h-3zM10 31h3v1h-3zM15 31h1v1h-1zM17 31h1v1h-1zM19 31h3v1h-3zM23 31h1v1h-1zM26 31h1v1h-1zM30 31h3v1h-3zM9 32h1v1h-1zM11 32h2v1h-2zM16 32h1v1h-1zM21 32h1v1h-1zM23 32h2v1h-2zM28 32h3v1h-3z'
const FINDERS: [number, number][] = [
  [0, 0],
  [SIZE - 7, 0],
  [0, SIZE - 7],
]

export function PlusQr({ size = 184, color = '#1B1915' }: { size?: number; color?: string }) {
  // A one-module quiet zone each side; the white tile around it adds more.
  const view = SIZE + 2
  const mark = Math.round(size * (7 / view))
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`-1 -1 ${view} ${view}`}
        role="img"
        aria-label="QR code that opens Murmur Plus on your iPhone"
        style={{ display: 'block' }}
      >
        <path d={MODULES} fill={color} shapeRendering="crispEdges" />
        {FINDERS.map(([x, y]) => (
          <g key={`${x}-${y}`}>
            <rect
              x={x + 0.5}
              y={y + 0.5}
              width={6}
              height={6}
              rx={1.7}
              fill="none"
              stroke={color}
              strokeWidth={1}
            />
            <rect x={x + 2} y={y + 2} width={3} height={3} rx={0.85} fill={color} />
          </g>
        ))}
      </svg>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          padding: 3,
          background: '#FFFFFF',
          borderRadius: Math.round(mark * 0.32),
          lineHeight: 0,
        }}
      >
        <MurmurMark size={mark} variant="sage" />
      </div>
    </div>
  )
}
