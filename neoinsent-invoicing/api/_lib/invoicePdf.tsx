/** @jsxRuntime automatic */
/** @jsxImportSource react */
// The pragmas above make this file use the automatic JSX runtime under tsx too: the server is
// run with `tsx server/index.ts`, and the root tsconfig.json has no `jsx` option of its own.
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'
import { COMPANY } from './company'
import type { InvoicePdfModel } from './invoicePdfModel'

/** Resolved from this module's location, so it does not depend on the working directory. */
export const DEFAULT_LOGO_PATH = fileURLToPath(new URL('../../assets/neoinsent-logo.png', import.meta.url))

export interface RenderInvoicePdfOptions {
  /** Override for tests; a missing file renders the invoice without a logo. */
  logoPath?: string
}

// react-pdf hyphenates with English rules by default, which splits Dutch words oddly; wrap at
// whole words instead.
Font.registerHyphenationCallback((word) => [word])

const INK = '#111a2e'
const MUTED = '#5b6b85'
const RULE = '#dde3ec'
const RULE_LIGHT = '#eef1f5'
const ACCENT = '#0d47a1'
const ACCENT_LIGHT = '#1565c0'

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 96,
    paddingHorizontal: 48,
    fontFamily: 'Helvetica',
    fontSize: 9.5,
    lineHeight: 1.4,
    color: INK,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logo: { width: 150 },
  logoFallback: { fontFamily: 'Helvetica-Bold', fontSize: 14 },
  titleBlock: { alignItems: 'flex-end' },
  title: { fontFamily: 'Helvetica-Bold', fontSize: 20, lineHeight: 1.2, color: INK },
  titleNumber: { marginTop: 4, color: ACCENT_LIGHT, fontSize: 10 },
  rule: { borderBottomWidth: 0.75, borderBottomColor: RULE, marginTop: 24, marginBottom: 24 },
  parties: { flexDirection: 'row', justifyContent: 'space-between' },
  sectionLabel: {
    fontSize: 7.5,
    letterSpacing: 1,
    color: MUTED,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  clientName: { fontFamily: 'Helvetica-Bold' },
  dates: { width: 190 },
  dateRow: { flexDirection: 'row', justifyContent: 'space-between' },
  muted: { color: MUTED },
  table: { marginTop: 36 },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 0.75,
    borderBottomColor: INK,
    paddingBottom: 5,
    fontSize: 7.5,
    letterSpacing: 0.5,
    color: MUTED,
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: RULE_LIGHT,
    paddingVertical: 6,
  },
  colDescription: { flex: 1, paddingRight: 12 },
  colQuantity: { width: 44, textAlign: 'right' },
  colUnitPrice: { width: 100, textAlign: 'right' },
  colVat: { width: 40, textAlign: 'right' },
  colAmount: { width: 92, textAlign: 'right' },
  totals: { marginTop: 18, marginLeft: 'auto', width: 250 },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 0.75,
    borderTopColor: INK,
  },
  totalText: { fontFamily: 'Helvetica-Bold', fontSize: 13, color: ACCENT },
  reverseCharge: {
    marginTop: 24,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: ACCENT_LIGHT,
  },
  reverseChargeNote: { fontFamily: 'Helvetica-Bold' },
  block: { marginTop: 20 },
  footer: {
    position: 'absolute',
    bottom: 32,
    left: 48,
    right: 48,
    paddingTop: 8,
    borderTopWidth: 0.75,
    borderTopColor: RULE,
    fontSize: 7.5,
    color: MUTED,
  },
})

function InvoiceDocument({ model, logoPath }: { model: InvoicePdfModel; logoPath: string | null }) {
  const { labels } = model
  return (
    <Document
      title={`${labels.title} ${model.invoiceNumber}`}
      author={COMPANY.name}
      creator={COMPANY.name}
      producer={COMPANY.name}
      language={model.language}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {logoPath ? (
            <Image src={logoPath} style={styles.logo} />
          ) : (
            <Text style={styles.logoFallback}>{COMPANY.name}</Text>
          )}
          <View style={styles.titleBlock}>
            <Text style={styles.title}>{labels.title}</Text>
            <Text style={styles.titleNumber}>{model.invoiceNumber}</Text>
          </View>
        </View>

        <View style={styles.rule} />

        <View style={styles.parties}>
          <View>
            <Text style={styles.sectionLabel}>{labels.billTo}</Text>
            <Text style={styles.clientName}>{model.client.name}</Text>
            {model.client.lines.map((line, i) => (
              <Text key={i}>{line}</Text>
            ))}
          </View>
          <View style={styles.dates}>
            <View style={styles.dateRow}>
              <Text style={styles.muted}>{labels.invoiceNumber}</Text>
              <Text>{model.invoiceNumber}</Text>
            </View>
            <View style={styles.dateRow}>
              <Text style={styles.muted}>{labels.issueDate}</Text>
              <Text>{model.issueDate}</Text>
            </View>
            <View style={styles.dateRow}>
              <Text style={styles.muted}>{labels.dueDate}</Text>
              <Text>{model.dueDate}</Text>
            </View>
          </View>
        </View>

        <View style={styles.table}>
          {/* `fixed` repeats the header row at the top of every page the table continues on. */}
          <View style={styles.tableHeader} fixed>
            <Text style={styles.colDescription}>{labels.description}</Text>
            <Text style={styles.colQuantity}>{labels.quantity}</Text>
            <Text style={styles.colUnitPrice}>{labels.unitPrice}</Text>
            <Text style={styles.colVat}>{labels.vatRate}</Text>
            <Text style={styles.colAmount}>{labels.amountExclVat}</Text>
          </View>
          {/* Rows are kept whole (wrap={false}): a row never splits its description and its
              amounts across two pages; long descriptions still wrap within the cell. */}
          {model.lines.map((line, i) => (
            <View key={i} style={styles.tableRow} wrap={false}>
              <Text style={styles.colDescription}>{line.description}</Text>
              <Text style={styles.colQuantity}>{line.quantity}</Text>
              <Text style={styles.colUnitPrice}>{line.unitPrice}</Text>
              <Text style={styles.colVat}>{line.vatRate}</Text>
              <Text style={styles.colAmount}>{line.amountExclVat}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals} wrap={false}>
          <View style={styles.totalsRow}>
            <Text style={styles.muted}>{labels.subtotal}</Text>
            <Text>{model.totals.subtotal}</Text>
          </View>
          {model.vatBreakdown.map((group) => (
            <View key={group.rate} style={styles.totalsRow}>
              <Text style={styles.muted}>{group.label}</Text>
              <Text>{group.amount}</Text>
            </View>
          ))}
          {model.vatBreakdown.length > 1 && (
            <View style={styles.totalsRow}>
              <Text style={styles.muted}>{labels.vatTotal}</Text>
              <Text>{model.totals.vatTotal}</Text>
            </View>
          )}
          <View style={styles.totalRow}>
            <Text style={styles.totalText}>{labels.total}</Text>
            <Text style={styles.totalText}>{model.totals.total}</Text>
          </View>
        </View>

        {model.reverseCharge && (
          <View style={styles.reverseCharge} wrap={false}>
            <Text style={styles.reverseChargeNote}>{model.reverseCharge.note}</Text>
            <Text>{model.reverseCharge.clientVatNumber}</Text>
          </View>
        )}

        {model.notes && (
          <View style={styles.block}>
            <Text style={styles.sectionLabel}>{labels.notes}</Text>
            <Text>{model.notes}</Text>
          </View>
        )}

        <View style={styles.block} wrap={false}>
          <Text>{model.paymentLine}</Text>
        </View>

        {/* No page numbers: in @react-pdf/renderer 4.9, `render` text inside a fixed/absolute
            footer makes the whole footer disappear. */}
        <View style={styles.footer} fixed>
          {model.footer.map((line, i) => (
            <Text key={i}>{line}</Text>
          ))}
        </View>
      </Page>
    </Document>
  )
}

/** Renders the invoice PDF (A4, Helvetica). The logo is skipped if its file is missing. */
export async function renderInvoicePdf(
  model: InvoicePdfModel,
  options: RenderInvoicePdfOptions = {},
): Promise<Buffer> {
  const requested = options.logoPath ?? DEFAULT_LOGO_PATH
  const logoPath = existsSync(requested) ? requested : null
  return renderToBuffer(<InvoiceDocument model={model} logoPath={logoPath} />)
}
