import { api } from '../../lib/api'
import { useAsync } from '../../lib/hooks'
import { money, date } from '../../lib/format'
import { PageHead, Badge, Loading, ErrorState, DataTable } from '../../components/ui'
import Icon from '../../components/Icon'
import { Link } from 'react-router-dom'

export default function MyOverdue() {
  const { data, loading, error, reload } = useAsync(() => api.me.overdue(), [])

  if (loading) return <Loading />
  if (error) return <ErrorState error={error} onRetry={reload} />

  const invoices = data?.invoices || []
  const totalOverdue = data?.total_overdue || 0

  const columns = [
    { key: 'InvoiceID', label: '#', sortable: true },
    { key: 'BillingMonth', label: 'Billing Month', render: (r) => date(r.BillingMonth, { month: 'short', year: 'numeric' }), sortable: true },
    { key: 'TotalAmount', label: 'Amount', render: (r) => money(r.TotalAmount), align: 'right', sortable: true },
    { key: 'AmountPaid', label: 'Paid', render: (r) => money(r.AmountPaid), align: 'right' },
    { key: 'Balance', label: 'Balance', render: (r) => <strong style={{color: 'var(--accent)'}}>{money(r.Balance)}</strong>, align: 'right', sortable: true },
    { key: 'PaymentStatus', label: 'Status', render: (r) => <Badge tone={r.PaymentStatus?.toLowerCase()}>{r.PaymentStatus}</Badge> },
    { key: 'DaysOutstanding', label: 'Days', sortable: true, align: 'right' },
  ]

  return (
    <>
      <PageHead
        kicker="My Account"
        title="Outstanding Invoices"
        dek={`Total overdue: ${money(totalOverdue)}`}
      >
        {totalOverdue > 0 && (
          <Link to="/my-account/payment-requests" className="btn btn-primary">
            <Icon name="wallet" size={14} /> Submit Payment
          </Link>
        )}
      </PageHead>

      {invoices.length === 0 ? (
        <div className="panel" style={{padding: '3rem', textAlign: 'center'}}>
          <Icon name="check" size={40} style={{color: 'var(--green)', marginBottom: '1rem'}} />
          <h3 style={{fontFamily: 'var(--font-head)', margin: 0}}>All Clear!</h3>
          <p style={{color: 'var(--ink-3)', marginTop: '0.5rem'}}>You have no outstanding invoices. 🎉</p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={invoices}
          rowKey="InvoiceID"
          initialSort={{ key: 'DaysOutstanding', dir: 'desc' }}
        />
      )}
    </>
  )
}
