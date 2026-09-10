export interface ManagedSubscriber {
  id: string
  email: string
  name: string | null
  department: string | null
  active: boolean
  subscribedAt: string
  unsubscribedAt: string | null
}