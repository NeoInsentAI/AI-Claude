/**
 * The stored invoices can't be turned into tax records (e.g. a line at a VAT rate the return has
 * no rubriek for). Its message names the invoice and is meant for the user, unlike a database error.
 */
export class TaxReportDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TaxReportDataError'
  }
}
