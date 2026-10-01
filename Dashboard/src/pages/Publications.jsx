import { useMemo, useState } from 'react'
import Icon from '../components/Icon'
import { Confirm, Empty, ErrorState, Field, Loading, Modal, PageHead, SearchBox, useToast } from '../components/ui'
import { api } from '../lib/api'
import { asList, matches, useAsync } from '../lib/hooks'
import { int, money } from '../lib/format'

function PublicationForm({ initial, onClose, onSaved }) {
  const toast = useToast()
  const isEdit = Boolean(initial?.PublicationID)
  const [f, setF] = useState({ Name: '', Type: 'Newspaper', PricePerIssue: '', ...initial })
  const [errs, setErrs] = useState({})
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    const v = {}
    if (!String(f.Name).trim()) v.Name = 'Title is required'
    const price = Number(f.PricePerIssue)
    if (f.PricePerIssue === '' || isNaN(price) || price < 0) v.PricePerIssue = 'Enter a price of 0 or more'
    setErrs(v)
    if (Object.keys(v).length) return
    setBusy(true)
    try {
      const body = { Name: f.Name.trim(), Type: f.Type, PricePerIssue: Math.round(price * 100) / 100 }
      if (isEdit) await api.publications.update(initial.PublicationID, body)
      else await api.publications.create(body)
      toast(isEdit ? 'Publication updated' : 'Publication added')
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      kicker={isEdit ? `Publication #${initial.PublicationID}` : 'New title'}
      title={isEdit ? 'Edit publication' : 'Add a publication'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" form="pub-form" disabled={busy}>
            {busy ? <span className="spinner" /> : <Icon name="check" size={14} />} Save
          </button>
        </>
      }
    >
      <form id="pub-form" className="form-grid" onSubmit={submit} noValidate>
        <Field label="Title" error={errs.Name} span2 htmlFor="p-name">
          <input id="p-name" className="input" value={f.Name} onChange={set('Name')} autoFocus maxLength={100} />
        </Field>
        <Field label="Type" htmlFor="p-type">
          <select id="p-type" className="select" value={f.Type} onChange={set('Type')}>
            <option>Newspaper</option>
            <option>Magazine</option>
          </select>
        </Field>
        <Field label="Price per issue (₹)" error={errs.PricePerIssue} hint="Locked into each delivery on the day it’s delivered" htmlFor="p-price">
          <input id="p-price" className="input" type="number" min="0" step="0.01" value={f.PricePerIssue} onChange={set('PricePerIssue')} />
        </Field>
      </form>
    </Modal>
  )
}

export default function Publications() {
  const toast = useToast()
  const { data, loading, error, reload } = useAsync(async () => {
    const [pubs, subs] = await Promise.all([api.publications.list(), api.subscriptions.list()])
    return { pubs: asList(pubs), subs: asList(subs) }
  }, [])
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)

  const circulation = useMemo(() => {
    const m = new Map()
    ;(data?.subs || [])
      .filter((s) => s.Status === 'Active')
      .forEach((s) => {
        const k = String(s.PublicationID)
        const cur = m.get(k) || { subs: 0, copies: 0 }
        cur.subs += 1
        cur.copies += Number(s.Quantity) || 0
        m.set(k, cur)
      })
    return m
  }, [data])

  const pubs = (data?.pubs || [])
    .filter((p) => (!type || p.Type === type) && matches(p, q, ['Name']))
    .sort((a, b) => String(a.Name).localeCompare(String(b.Name)))

  const doDelete = async () => {
    setBusy(true)
    try {
      await api.publications.remove(deleting.PublicationID)
      toast('Publication removed')
      setDeleting(null)
      reload()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHead kicker="The Rack" title="Publications" dek="Newspapers and magazines the agency distributes, with today’s cover price.">
        <button className="btn primary" onClick={() => setEditing({})}>
          <Icon name="plus" size={14} /> Add publication
        </button>
      </PageHead>

      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Search titles" />
        <div className="segmented" role="group" aria-label="Filter by type">
          {['', 'Newspaper', 'Magazine'].map((t) => (
            <button key={t || 'all'} className={type === t ? 'on' : ''} onClick={() => setType(t)}>{t || 'All'}</button>
          ))}
        </div>
      </div>

      {loading && <div className="panel"><Loading /></div>}
      {error && <div className="panel"><ErrorState error={error} onRetry={reload} /></div>}
      {data && !pubs.length && (
        <div className="panel">
          {data.pubs.length ? (
            <Empty title="No matches">Try a different search.</Empty>
          ) : (
            <Empty title="No publications yet" action={<button className="btn primary" onClick={() => setEditing({})}><Icon name="plus" size={14} /> Add a publication</button>}>
              Add the papers and magazines you distribute so customers can subscribe to them.
            </Empty>
          )}
        </div>
      )}
      {data && pubs.length > 0 && (
        <div className="pub-grid">
          {pubs.map((p) => {
            const c = circulation.get(String(p.PublicationID)) || { subs: 0, copies: 0 }
            return (
              <article key={p.PublicationID} className={`pub-card${p.Type === 'Magazine' ? ' magazine' : ''}`}>
                <div className="pub-type">
                  <span>{p.Type}</span>
                  <span>No. {p.PublicationID}</span>
                </div>
                <div className="pub-name">{p.Name}</div>
                <div className="pub-meta">
                  <span className="price">{money(p.PricePerIssue)}</span>
                  <span className="muted" style={{ fontSize: 12 }}>per issue</span>
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {int(c.subs)} active subscription{c.subs === 1 ? '' : 's'} · {int(c.copies)} copies/day
                </div>
                <div className="pub-actions">
                  <button className="btn sm" onClick={() => setEditing(p)}><Icon name="edit" size={13} /> Edit</button>
                  <button className="btn sm danger" onClick={() => setDeleting(p)} aria-label={`Delete ${p.Name}`}><Icon name="trash" size={13} /></button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {editing && <PublicationForm initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />}
      {deleting && (
        <Confirm
          title="Remove publication?"
          message={`“${deleting.Name}” will be removed. Titles with active subscriptions or delivery history may be protected by the backend.`}
          confirmLabel="Remove"
          busy={busy}
          onConfirm={doDelete}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  )
}
