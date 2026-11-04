import { Link, Route, Routes, useParams } from 'react-router-dom'
import { DashboardPage } from './routes/DashboardPage'
import { InvoiceDetailPage } from './routes/InvoiceDetailPage'
import { InvoiceFormPage } from './routes/InvoiceFormPage'
import { TaxPage } from './routes/TaxPage'

/** Keyed by id so moving from one invoice to another starts with fresh page state. */
function InvoiceDetailRoute() {
  const { id } = useParams()
  return <InvoiceDetailPage key={id} />
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
      <header style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 24 }}>
        <Link to="/">
          <img src="/logo.png" alt="NeoInsent" style={{ height: 40 }} />
        </Link>
        <nav aria-label="Main">
          <Link to="/tax">Tax</Link>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/invoices/new" element={<InvoiceFormPage key="new" mode="new" />} />
          <Route path="/invoices/:id/edit" element={<EditInvoiceRoute />} />
          <Route path="/invoices/:id" element={<InvoiceDetailRoute />} />
          <Route path="/tax" element={<TaxPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </>
  )
}
