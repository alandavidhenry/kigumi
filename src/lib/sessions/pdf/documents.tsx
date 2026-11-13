import {
  Document,
  G,
  Line,
  Page,
  Polygon,
  Rect,
  StyleSheet,
  Svg,
  Text,
  View,
  renderToBuffer
} from '@react-pdf/renderer'

import { PATTERN_NOTE } from '@/lib/layout/pattern'
import type { Scene } from '@/lib/layout/scene'
import type { LayoutSheet, SharedSessionView } from '@/lib/sessions/sheet'

// Server-rendered PDFs (ADR 0016 decision 5). The layout is drawn as vector
// shapes from the same Scene the web pages use, so no browser canvas is needed.
// Colours are literal because a PDF has no theme tokens.

const INK = '#1c1917'
const MUTED = '#57534e'
const LINE = '#d6d3d1'
const ACCENT = '#a16207'
const DANGER = '#b91c1c'

const PART_FILL = {
  body: '#e7e5e4',
  accent: ACCENT,
  detail: '#ffffff',
  beam: ACCENT
} as const

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 9, color: INK, fontFamily: 'Helvetica' },
  title: { fontSize: 18, fontFamily: 'Helvetica-Bold' },
  sub: { color: MUTED, marginTop: 2 },
  section: { marginTop: 14 },
  h2: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: LINE,
    paddingVertical: 3
  },
  head: { fontFamily: 'Helvetica-Bold', color: MUTED },
  footer: {
    position: 'absolute',
    bottom: 14,
    left: 28,
    right: 28,
    color: MUTED,
    fontSize: 8,
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  warning: { color: DANGER, marginBottom: 2 },
  note: { color: MUTED, fontSize: 8, marginTop: 3 }
})

const COLUMNS: Array<{ key: string; label: string; flex: number }> = [
  { key: 'number', label: '#', flex: 0.5 },
  { key: 'source', label: 'Source', flex: 2 },
  { key: 'mic', label: 'Microphone', flex: 2.4 },
  { key: 'stand', label: 'Stand', flex: 1.2 },
  { key: 'preampInput', label: 'Preamp', flex: 1 },
  { key: 'phantom', label: '48V', flex: 0.6 },
  { key: 'pad', label: 'Pad', flex: 0.6 }
]

function Footer({ view }: { view: SharedSessionView }) {
  return (
    <View style={styles.footer} fixed>
      <Text>
        {view.branded
          ? `Planned with Kigumi for ${view.organisationName}`
          : view.organisationName}
      </Text>
      <Text
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
      />
    </View>
  )
}

function SceneDrawing({
  scene,
  maxWidth,
  maxHeight
}: {
  scene: Scene
  maxWidth: number
  maxHeight: number
}) {
  const k = Math.min(maxWidth / scene.widthMm, maxHeight / scene.lengthMm)
  const w = scene.widthMm * k
  const h = scene.lengthMm * k
  const pts = (poly: Array<{ x: number; y: number }>) =>
    poly.map((p) => `${(p.x * k).toFixed(1)},${(p.y * k).toFixed(1)}`).join(' ')
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <Rect
        x={0}
        y={0}
        width={w}
        height={h}
        stroke={INK}
        strokeWidth={1.2}
        fill='#fafaf9'
      />
      {scene.gridLines.vertical.map((x) => (
        <Line
          key={`v${x}`}
          x1={x * k}
          x2={x * k}
          y1={0}
          y2={h}
          stroke={LINE}
          strokeWidth={0.3}
        />
      ))}
      {scene.gridLines.horizontal.map((y) => (
        <Line
          key={`h${y}`}
          x1={0}
          x2={w}
          y1={y * k}
          y2={y * k}
          stroke={LINE}
          strokeWidth={0.3}
        />
      ))}
      {scene.items.map((item) => (
        <G key={item.id}>
          {item.pattern && (
            <Polygon
              points={pts(item.pattern)}
              fill={ACCENT}
              fillOpacity={0.15}
              stroke={ACCENT}
              strokeWidth={0.5}
            />
          )}
          {item.parts ? (
            <>
              {item.outsideRoom && (
                <Polygon
                  points={pts(item.polygon)}
                  fill='none'
                  stroke={DANGER}
                  strokeWidth={0.6}
                />
              )}
              {item.parts.map((part, i) => (
                <Polygon
                  key={i}
                  points={pts(part.points)}
                  fill={PART_FILL[part.tone]}
                  fillOpacity={part.tone === 'beam' ? 0.2 : 1}
                  stroke={part.tone === 'beam' ? ACCENT : INK}
                  strokeWidth={0.4}
                />
              ))}
            </>
          ) : (
            <Polygon
              points={pts(item.polygon)}
              fill='#e7e5e4'
              stroke={item.outsideRoom ? DANGER : INK}
              strokeWidth={0.6}
            />
          )}
          {item.arrow && !item.parts && (
            <Line
              x1={item.arrow.from.x * k}
              y1={item.arrow.from.y * k}
              x2={item.arrow.to.x * k}
              y2={item.arrow.to.y * k}
              stroke={INK}
              strokeWidth={1}
            />
          )}
        </G>
      ))}
    </Svg>
  )
}

// Labels are drawn as PDF text over the drawing: Svg Text in react-pdf is
// limited, and absolutely positioned Views are predictable.
function SceneLabels({
  scene,
  maxWidth,
  maxHeight
}: {
  scene: Scene
  maxWidth: number
  maxHeight: number
}) {
  const k = Math.min(maxWidth / scene.widthMm, maxHeight / scene.lengthMm)
  return (
    <>
      {scene.items
        .filter((i) => i.label)
        .map((item) => (
          <Text
            key={item.id}
            style={{
              position: 'absolute',
              left: item.labelAt.x * k + 4,
              top: item.labelAt.y * k + 4,
              fontSize: 6.5,
              color: INK
            }}
          >
            {item.label}
          </Text>
        ))}
    </>
  )
}

function Layout({
  scene,
  maxWidth,
  maxHeight
}: {
  scene: Scene
  maxWidth: number
  maxHeight: number
}) {
  const k = Math.min(maxWidth / scene.widthMm, maxHeight / scene.lengthMm)
  return (
    <View
      style={{
        width: scene.widthMm * k,
        height: scene.lengthMm * k,
        position: 'relative'
      }}
    >
      <SceneDrawing scene={scene} maxWidth={maxWidth} maxHeight={maxHeight} />
      <SceneLabels scene={scene} maxWidth={maxWidth} maxHeight={maxHeight} />
    </View>
  )
}

function cell(view: SharedSessionView['channels'][number], key: string) {
  switch (key) {
    case 'number':
      return String(view.number)
    case 'source':
      return view.source
    case 'mic':
      return view.mic ?? (view.kind === 'line' ? 'Line' : '')
    case 'stand':
      return view.stand ?? ''
    case 'preampInput':
      return view.preampInput ?? ''
    case 'phantom':
      return view.phantom ? '48V' : ''
    case 'pad':
      return view.padDb ? `-${view.padDb}` : ''
    default:
      return ''
  }
}

export function SessionSheetDocument({ view }: { view: SharedSessionView }) {
  return (
    <Document
      title={`${view.name} session sheet`}
      author={view.organisationName}
    >
      <Page size='A4' style={styles.page}>
        <Text style={styles.title}>{view.name}</Text>
        <Text style={styles.sub}>
          {view.when}
          {view.roomName ? ` · ${view.roomName}` : ''}
          {view.client ? ` · ${view.client}` : ''}
        </Text>

        {view.warnings.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.h2}>Check before the session</Text>
            {view.warnings.map((w, i) => (
              <Text
                key={i}
                style={w.severity === 'blocking' ? styles.warning : {}}
              >
                {w.severity === 'blocking' ? 'Must fix: ' : 'Note: '}
                {w.text}
              </Text>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.h2}>Input list</Text>
          <View style={[styles.row, styles.head]}>
            {COLUMNS.map((c) => (
              <Text key={c.key} style={{ flex: c.flex }}>
                {c.label}
              </Text>
            ))}
          </View>
          {view.channels.length === 0 && (
            <Text style={styles.note}>No inputs yet.</Text>
          )}
          {view.channels.map((c) => (
            <View key={c.number} wrap={false}>
              <View style={styles.row}>
                {COLUMNS.map((col) => (
                  <Text key={col.key} style={{ flex: col.flex }}>
                    {cell(c, col.key)}
                  </Text>
                ))}
              </View>
              {c.notes ? <Text style={styles.note}>{c.notes}</Text> : null}
            </View>
          ))}
        </View>

        {view.scene && (
          <View style={styles.section} break={view.channels.length > 18}>
            <Text style={styles.h2}>
              Layout (top-down, front of room at the top)
            </Text>
            <Layout scene={view.scene} maxWidth={535} maxHeight={330} />
            {view.scene.hasPattern && (
              <Text style={styles.note}>{PATTERN_NOTE}.</Text>
            )}
          </View>
        )}

        {view.notes ? (
          <View style={styles.section}>
            <Text style={styles.h2}>Notes</Text>
            <Text>{view.notes}</Text>
          </View>
        ) : null}
        <Footer view={view} />
      </Page>
    </Document>
  )
}

export function LayoutDocument({ sheet }: { sheet: LayoutSheet }) {
  const view = {
    organisationName: sheet.organisationName,
    branded: sheet.branded
  } as SharedSessionView
  return (
    <Document title={sheet.name} author={sheet.organisationName}>
      <Page size='A4' orientation='landscape' style={styles.page}>
        <Text style={styles.title}>{sheet.name}</Text>
        <Text style={styles.sub}>
          {(sheet.scene.widthMm / 1000).toFixed(1)} m ×{' '}
          {(sheet.scene.lengthMm / 1000).toFixed(1)} m · front of room at the
          top
        </Text>
        <View style={styles.section}>
          <Layout scene={sheet.scene} maxWidth={780} maxHeight={430} />
          {sheet.scene.hasPattern && (
            <Text style={styles.note}>{PATTERN_NOTE}.</Text>
          )}
        </View>
        <Footer view={view} />
      </Page>
    </Document>
  )
}

export async function renderSessionSheetPdf(
  view: SharedSessionView
): Promise<Buffer> {
  return renderToBuffer(<SessionSheetDocument view={view} />)
}

export async function renderLayoutPdf(sheet: LayoutSheet): Promise<Buffer> {
  return renderToBuffer(<LayoutDocument sheet={sheet} />)
}
