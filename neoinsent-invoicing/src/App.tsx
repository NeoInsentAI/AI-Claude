import { Link, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { InvoiceFormPage } from './routes/InvoiceFormPage'

/** Start view until the dashboard (Task 20) replaces it. */
function StartPage() {
  return (
    <div>
      <h1>NeoInsent Invoicing</h1>
      <Link className="btn btn-primary" to="/invoices/new">
        + New invoice
      </Link>
    </div>
  )
}

/**
 * Where a saved invoice lands until the invoice detail page (Task 19) replaces it. A redirect can
 * pass `{ notice }` in router state to explain why the user ended up here.
 */
function InvoicePlaceholder() {
  const location = useLocation()
  const notice = (location.state as { notice?: unknown } | null)?.notice
  return (
    <div>
      <h1>Invoice</h1>
      {typeof notice === 'string' && notice !== '' && (
        <p role="status" className="card">
          {notice}
        </p>
      )}
      <p>
        <Link to="/">Back to start</Link>
      </p>
    </div>
  )
}

/** Keyed by id so moving from one draft's edit page to another's starts with a fresh form. */
function EditInvoiceRoute() {
  const { id } = useParams()
  return <InvoiceFormPage key={id} mode="edit" />
}

function NotFound() {
  return (
    <div>
      <h1>Page not found</h1>
      <Link to="/">Back to start</Link>
    </div>
  )
}

/** The app's header and routes; main.tsx supplies the router (tests use a MemoryRouter). */
export function App() {
  return (
    <>
      <header style={{ marginBottom: 24 }}>
        <Link to="/">
          <img src="/logo.png" alt="NeoInsent" style={{ height: 40 }} />
        </Link>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<StartPage />} />
          <Route path="/invoices/new" element={<InvoiceFormPage key="new" mode="new" />} />
          <Route path="/invoices/:id/edit" element={<EditInvoiceRoute />} />
          <Route path="/invoices/:id" element={<InvoicePlaceholder />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </>
  )
}
