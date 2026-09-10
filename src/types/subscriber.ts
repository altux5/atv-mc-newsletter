export interface ManagedSubscriber {
  id: string
  email: string
  active: boolean
  subscribedAt: string
  unsubscribedAt: string | null
}