import { NavLink } from 'react-router-dom'

const tabs = [
  { to: '/home', label: 'Home' },
  { to: '/record', label: 'Record' },
  { to: '/progress', label: 'Progress' },
  { to: '/plan', label: 'Plan' },
  { to: '/profile', label: 'Profile' },
]

export function NavBar() {
  return (
    <nav aria-label="Main">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} className={({ isActive }) => (isActive ? 'active' : '')}>
          {t.label}
        </NavLink>
      ))}
    </nav>
  )
}
