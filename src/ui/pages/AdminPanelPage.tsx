import type { KeyboardEvent } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import '../admin.css'

const tabs = [
  { name: 'Analytics', path: '/admin/panel/analytics', id: 'admin-tab-analytics' },
  { name: 'Subscribers', path: '/admin/panel/subscribers', id: 'admin-tab-subscribers' },
]

export default function AdminPanelPage() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const activeIndex = Math.max(0, tabs.findIndex((tab) => pathname === tab.path))
  const handleKey = (event: KeyboardEvent<HTMLAnchorElement>, index: number) => {
    let next: number
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    else return
    event.preventDefault()
    navigate(tabs[next].path)
    document.getElementById(tabs[next].id)?.focus()
  }
  return (
    <div className="admin-panel">
      <header className="admin-panel-heading"><p>EDITOR WORKSPACE</p><h1>Admin Panel</h1></header>
      <div className="admin-tabs" role="tablist" aria-label="Admin Panel sections">
        {tabs.map((tab, index) => <NavLink key={tab.id} id={tab.id} to={tab.path} role="tab"
          aria-selected={activeIndex === index} aria-controls="admin-tab-content" tabIndex={activeIndex === index ? 0 : -1}
          onKeyDown={(event) => handleKey(event, index)}>{tab.name}</NavLink>)}
      </div>
      <div id="admin-tab-content" role="tabpanel" aria-labelledby={tabs[activeIndex].id}><Outlet /></div>
    </div>
  )
}