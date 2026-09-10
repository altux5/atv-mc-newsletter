import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { ManagedSubscriber } from '../../types/subscriber'
import { addManagedSubscriberApi, getManagedSubscribersApi, removeManagedSubscriberApi } from '../../utils/subscribersApi'
import Icon from '../components/Icon'
import deleteIcon from '../../icons/delete-16.svg'

const pageSize = 25
const dateLabel = (value: string | null) => value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '-'

export default function SubscribersPage() {
  const [subscribers, setSubscribers] = useState<ManagedSubscriber[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [department, setDepartment] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('active')
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [removing, setRemoving] = useState<ManagedSubscriber | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const mounted = useRef(true)

  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setLoadError('')
    void getManagedSubscribersApi(controller.signal).then((list) => {
      if (!controller.signal.aborted) setSubscribers(list)
    }).catch((reason) => {
      if (!controller.signal.aborted) setLoadError(reason instanceof Error ? reason.message : 'Unable to load subscribers.')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [refresh])
  useEffect(() => {
    if (removing) dialog.current?.showModal()
    else dialog.current?.close()
  }, [removing])

  const updateSubscriber = (subscriber: ManagedSubscriber) => {
    setSubscribers((current) => [subscriber, ...current.filter((item) => item.id !== subscriber.id)])
  }
  const addSubscriber = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    setBusy('add')
    setError('')
    setNotice('')
    try {
      const result = await addManagedSubscriberApi(email.trim(), { name: name.trim() || null, department: department.trim() || null })
      if (!mounted.current) return
      const wasActive = subscribers.some((item) => item.id === result.id && item.active)
      updateSubscriber(result)
      setNotice(wasActive ? `${result.email} is already subscribed.${name.trim() || department.trim() ? ' Subscriber details updated.' : ''}` : `${result.email} added to the distribution list.`)
      setEmail('')
      setName('')
      setDepartment('')
      setSearch('')
      setStatus('active')
      setPage(1)
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : 'Could not add the subscriber.')
    } finally { if (mounted.current) setBusy(null) }
  }
  const removeSubscriber = async () => {
    if (!removing || busy) return
    setBusy(removing.id)
    setError('')
    setNotice('')
    try {
      const result = await removeManagedSubscriberApi(removing.id)
      if (!mounted.current) return
      updateSubscriber(result)
      setNotice(`${result.email} removed from the distribution list.`)
      setRemoving(null)
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : 'Could not remove the subscriber.')
    } finally { if (mounted.current) setBusy(null) }
  }
  const activeCount = subscribers.filter((subscriber) => subscriber.active).length
  const filtered = subscribers.filter((subscriber) =>
    (status === 'all' || subscriber.active === (status === 'active')) &&
    [subscriber.email, subscriber.name, subscriber.department].some((value) => value?.toLowerCase().includes(search.trim().toLowerCase())),
  ).sort((first, second) => first.email.localeCompare(second.email))
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const cancelRemoval = () => { if (!busy) { setRemoving(null); setError('') } }

  return (
    <section className="subscribers-page" aria-labelledby="subscribers-title" aria-busy={loading}>
      <div className="subscribers-heading"><h2 id="subscribers-title">Subscribers</h2>
        {!loading && !loadError && <span>{activeCount.toLocaleString()} active / {(subscribers.length - activeCount).toLocaleString()} unsubscribed</span>}
      </div>
      <form className="subscriber-add" onSubmit={addSubscriber}>
        <label htmlFor="subscriber-email">Add subscriber</label>
        <div><input id="subscriber-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254}
          placeholder="name@infineon.com" autoComplete="off" disabled={loading || !!loadError || !!busy} />
          <button className="button subscriber-primary" type="submit" disabled={loading || !!loadError || !!busy}>{busy === 'add' ? 'Adding...' : 'Add subscriber'}</button></div>
        <div className="subscriber-metadata">
          <label htmlFor="subscriber-name">Name (optional)<input id="subscriber-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={200} autoComplete="off" disabled={loading || !!loadError || !!busy} /></label>
          <label htmlFor="subscriber-department">Department / DL (optional)<input id="subscriber-department" value={department} onChange={(event) => setDepartment(event.target.value)} maxLength={200} autoComplete="off" disabled={loading || !!loadError || !!busy} /></label>
        </div>
      </form>
      {notice && <p className="subscriber-notice" role="status">{notice}</p>}
      {error && !removing && <p className="subscriber-error" role="alert">{error}</p>}
      <div className="subscriber-filters">
        <label htmlFor="subscriber-search">Search subscribers<input id="subscriber-search" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Email, name or department" /></label>
        <label htmlFor="subscriber-status">Status<select id="subscriber-status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}>
          <option value="active">Active</option><option value="inactive">Unsubscribed</option><option value="all">All subscribers</option>
        </select></label>
      </div>
      {loading ? <p className="subscriber-state" role="status">Loading subscribers...</p> : loadError ? <div className="subscriber-state" role="alert"><p>{loadError}</p><button className="button" onClick={() => setRefresh((value) => value + 1)}>Try again</button></div> : <>
        <div className="subscriber-table-wrap"><table>
          <caption className="admin-visually-hidden">Newsletter subscribers</caption>
          <thead><tr><th scope="col">Email address</th><th scope="col">Name</th><th scope="col">Department / DL</th><th scope="col">Status</th><th scope="col">Subscribed (UTC)</th><th scope="col">Unsubscribed (UTC)</th><th scope="col"><span className="admin-visually-hidden">Actions</span></th></tr></thead>
          <tbody>{visible.map((subscriber) => <tr key={subscriber.id}>
            <td>{subscriber.email}</td><td className="subscriber-detail">{subscriber.name || '-'}</td><td className="subscriber-detail">{subscriber.department || '-'}</td>
            <td><span className={`subscriber-status ${subscriber.active ? 'is-active' : ''}`}>{subscriber.active ? 'Active' : 'Unsubscribed'}</span></td>
            <td>{dateLabel(subscriber.subscribedAt)}</td><td>{dateLabel(subscriber.unsubscribedAt)}</td>
            <td>{subscriber.active && <button className="subscriber-remove" type="button" title={`Remove ${subscriber.email}`} aria-label={`Remove ${subscriber.email}`} disabled={!!busy}
              onClick={() => { setRemoving(subscriber); setError(''); setNotice('') }}><Icon src={deleteIcon} size={18} /></button>}</td>
          </tr>)}
          {!visible.length && <tr><td colSpan={7} className="subscriber-empty">{search ? 'No matching subscribers.' : status === 'active' ? 'No active subscribers.' : status === 'inactive' ? 'No unsubscribed addresses.' : 'No subscribers yet.'}</td></tr>}
          </tbody>
        </table></div>
        <div className="subscriber-pagination"><span>{filtered.length ? `${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, filtered.length)} of ${filtered.length}` : '0 subscribers'}</span>
          <div><button className="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage} of {pageCount}</span><button className="button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></div>
        </div>
      </>}
      <dialog ref={dialog} className="subscriber-dialog" aria-labelledby="remove-subscriber-title" aria-describedby="remove-subscriber-description"
        onCancel={(event) => { event.preventDefault(); cancelRemoval() }} onClose={() => { if (!busy) setRemoving(null) }}>
        <h2 id="remove-subscriber-title">Remove subscriber?</h2>
        <p id="remove-subscriber-description"><strong>{removing?.email}</strong> will no longer receive newsletter emails.</p>
        {error && removing && <p className="subscriber-error" role="alert">{error}</p>}
        <div className="subscriber-dialog-actions"><button className="button" autoFocus disabled={!!busy} onClick={cancelRemoval}>Cancel</button><button className="button subscriber-danger" disabled={!!busy} onClick={() => { void removeSubscriber() }}>{busy ? 'Removing...' : 'Remove subscriber'}</button></div>
      </dialog>
    </section>
  )
}