import { useState } from 'react'
import { subscribeApi } from '../../utils/subscribersApi'

type Status = 'idle' | 'submitting' | 'success' | 'error'

/**
 * Compact subscribe form for visitors to join the newsletter distribution list.
 * Rendered in the site footer so it is reachable from every page.
 */
export default function SubscribeForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) {
      setStatus('error')
      setMessage('Please enter your email address.')
      return
    }
    setStatus('submitting')
    setMessage('')
    try {
      await subscribeApi(trimmed)
      setStatus('success')
      setMessage("You're subscribed! You'll get an email whenever a new newsletter is published.")
      setEmail('')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Could not subscribe. Please try again.')
    }
  }

  return (
    <div className="subscribe">
      <div className="subscribe-copy">
        <strong className="subscribe-title">Subscribe to the newsletter</strong>
        <span className="subscribe-sub">Get an email whenever a new edition is published.</span>
      </div>
      <form className="subscribe-form" onSubmit={handleSubmit}>
        <input
          type="email"
          className="subscribe-input"
          placeholder="your.name@infineon.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === 'submitting'}
          aria-label="Email address"
          required
        />
        <button type="submit" className="subscribe-button" data-analytics-action="subscribe" disabled={status === 'submitting'}>
          {status === 'submitting' ? 'Subscribing…' : 'Subscribe'}
        </button>
      </form>
      {message && (
        <p className={`subscribe-message${status === 'error' ? ' is-error' : ' is-success'}`} role="status">
          {message}
        </p>
      )}
    </div>
  )
}
