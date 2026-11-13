import { PATTERN_NOTE } from '@/lib/layout/pattern'
import type { Scene } from '@/lib/layout/scene'
import type { ShapeTone } from '@/lib/layout/shapes'
import { cn } from '@/lib/utils'

const PART_CLASS: Record<ShapeTone, string> = {
  body: 'fill-secondary stroke-foreground',
  accent: 'fill-brand stroke-foreground',
  detail: 'fill-card stroke-foreground',
  beam: 'fill-brand/20 stroke-brand'
}

// Read-only plan view of a layout, as plain SVG (ADR 0016 decision 5). Used on
// the session page and the public share page, so Konva only loads in the
// editor. Everything is drawn in millimetres inside the viewBox.
export function SceneSvg({
  scene,
  className,
  label = 'Top-down room layout'
}: {
  readonly scene: Scene
  readonly className?: string
  readonly label?: string
}) {
  const font = Math.max(110, Math.round(scene.widthMm / 55))
  const points = (poly: Array<{ x: number; y: number }>) =>
    poly.map((p) => `${p.x},${p.y}`).join(' ')

  return (
    <figure className={cn('space-y-2', className)}>
      <svg
        viewBox={`0 0 ${scene.widthMm} ${scene.lengthMm}`}
        role='img'
        aria-label={label}
        className='h-auto w-full rounded-md border bg-card'
      >
        <rect
          width={scene.widthMm}
          height={scene.lengthMm}
          className='fill-card stroke-foreground'
          strokeWidth={font / 8}
        />
        {scene.gridLines.vertical.map((x) => (
          <line
            key={`v${x}`}
            x1={x}
            x2={x}
            y1={0}
            y2={scene.lengthMm}
            className='stroke-border'
            strokeWidth={font / 25}
          />
        ))}
        {scene.gridLines.horizontal.map((y) => (
          <line
            key={`h${y}`}
            y1={y}
            y2={y}
            x1={0}
            x2={scene.widthMm}
            className='stroke-border'
            strokeWidth={font / 25}
          />
        ))}
        {scene.items.map((item) => (
          <g key={item.id}>
            {item.pattern && (
              <polygon
                points={points(item.pattern)}
                className='fill-brand/15 stroke-brand'
                strokeWidth={font / 25}
              />
            )}
            {item.parts ? (
              <>
                {item.outsideRoom && (
                  <polygon
                    points={points(item.polygon)}
                    className='fill-none stroke-destructive'
                    strokeWidth={font / 18}
                  />
                )}
                {item.parts.map((part, i) => (
                  <polygon
                    key={i}
                    points={points(part.points)}
                    className={PART_CLASS[part.tone]}
                    strokeWidth={font / 25}
                    strokeLinejoin='round'
                  />
                ))}
              </>
            ) : (
              <polygon
                points={points(item.polygon)}
                className={cn(
                  'fill-secondary',
                  item.outsideRoom ? 'stroke-destructive' : 'stroke-foreground'
                )}
                strokeWidth={font / 18}
              />
            )}
            {item.arrow && !item.parts && (
              <line
                x1={item.arrow.from.x}
                y1={item.arrow.from.y}
                x2={item.arrow.to.x}
                y2={item.arrow.to.y}
                className='stroke-foreground'
                strokeWidth={font / 10}
                strokeLinecap='round'
              />
            )}
            {item.label && (
              <text
                x={item.labelAt.x + font * 0.7}
                y={item.labelAt.y + font * 1.4}
                fontSize={font}
                className='fill-foreground'
              >
                {item.label}
              </text>
            )}
          </g>
        ))}
        <text
          x={scene.widthMm / 2}
          y={font * 1.2}
          fontSize={font * 0.8}
          textAnchor='middle'
          className='fill-muted-foreground'
        >
          front of room
        </text>
      </svg>
      {scene.hasPattern && (
        <figcaption className='text-xs text-muted-foreground'>
          {PATTERN_NOTE}.
        </figcaption>
      )}
    </figure>
  )
}
