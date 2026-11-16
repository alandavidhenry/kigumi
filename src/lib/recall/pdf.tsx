import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer
} from '@react-pdf/renderer'

import type { RecallPrintView } from './sheet'

// Server-rendered recall sheet PDF (PLAN §4.7). Colours are literal because a
// PDF has no theme tokens. Only recorded values are printed.

const INK = '#1c1917'
const MUTED = '#57534e'
const LINE = '#d6d3d1'

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 9, color: INK, fontFamily: 'Helvetica' },
  title: { fontSize: 18, fontFamily: 'Helvetica-Bold' },
  sub: { color: MUTED, marginTop: 2 },
  h2: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginTop: 14,
    marginBottom: 4
  },
  strip: {
    borderBottomWidth: 0.5,
    borderBottomColor: LINE,
    paddingVertical: 4
  },
  stripHead: { flexDirection: 'row', fontFamily: 'Helvetica-Bold' },
  number: { width: 28 },
  line: { flexDirection: 'row', marginTop: 1.5, paddingLeft: 28 },
  section: { width: 52, color: MUTED },
  text: { flex: 1 },
  note: { color: MUTED, fontSize: 8, marginTop: 2, paddingLeft: 28 },
  footer: {
    position: 'absolute',
    bottom: 14,
    left: 28,
    right: 28,
    color: MUTED,
    fontSize: 8,
    flexDirection: 'row',
    justifyContent: 'space-between'
  }
})

export function RecallDocument({ view }: { view: RecallPrintView }) {
  return (
    <Document
      title={`${view.sessionName} recall sheet`}
      author={view.organisationName}
    >
      <Page size='A4' style={styles.page}>
        <Text style={styles.title}>{view.sessionName}: recall</Text>
        <Text style={styles.sub}>
          {view.when}
          {view.roomName ? ` · ${view.roomName}` : ''}
          {view.client ? ` · ${view.client}` : ''}
        </Text>
        <Text style={styles.sub}>Desk: {view.consoleName}</Text>

        <Text style={styles.h2}>Channels</Text>
        {view.channels.length === 0 && (
          <Text style={styles.sub}>No channels on this sheet.</Text>
        )}
        {view.channels.map((c) => (
          <View key={c.stripNumber} style={styles.strip} wrap={false}>
            <View style={styles.stripHead}>
              <Text style={styles.number}>{c.stripNumber}</Text>
              <Text>
                {c.label}
                {c.micName ? ` (${c.micName})` : ''}
              </Text>
            </View>
            {c.lines.map((l) => (
              <View key={l.section} style={styles.line}>
                <Text style={styles.section}>{l.section}</Text>
                <Text style={styles.text}>{l.text}</Text>
              </View>
            ))}
            {c.notes ? <Text style={styles.note}>{c.notes}</Text> : null}
          </View>
        ))}

        {view.master.length > 0 && (
          <View wrap={false}>
            <Text style={styles.h2}>Master section</Text>
            {view.master.map((l, i) => (
              <View key={`${l.section}-${i}`} style={styles.line}>
                <Text style={styles.section}>{l.section}</Text>
                <Text style={styles.text}>{l.text}</Text>
              </View>
            ))}
          </View>
        )}

        {view.outboard.length > 0 && (
          <View>
            <Text style={styles.h2}>Outboard</Text>
            {view.outboard.map((o) => (
              <View key={o.id} style={styles.strip} wrap={false}>
                <View style={styles.stripHead}>
                  <Text>
                    {o.name}
                    {o.insertOn ? `: ${o.insertOn}` : ''}
                  </Text>
                </View>
                {o.settings.length > 0 && (
                  <View style={styles.line}>
                    <Text style={styles.text}>
                      {o.settings
                        .map((s) => `${s.label} ${s.value}`)
                        .join(' · ')}
                    </Text>
                  </View>
                )}
                {o.notes ? <Text style={styles.note}>{o.notes}</Text> : null}
              </View>
            ))}
          </View>
        )}

        {view.notes ? (
          <View>
            <Text style={styles.h2}>Notes</Text>
            <Text>{view.notes}</Text>
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text>
            {view.branded
              ? `Planned with Kigumi for ${view.organisationName}`
              : view.organisationName}
          </Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  )
}

export async function renderRecallPdf(view: RecallPrintView): Promise<Buffer> {
  return renderToBuffer(<RecallDocument view={view} />)
}
