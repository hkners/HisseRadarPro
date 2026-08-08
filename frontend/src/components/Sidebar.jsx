import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function Sidebar() {
  const location = useLocation();
  return (
    <aside className="sidebar">
      <Link to="/" className={`sidebar-link ${location.pathname === '/' ? 'active' : ''}`}>&gt; DASHBOARD</Link>
      <Link to="/stocks" className={`sidebar-link ${location.pathname === '/stocks' ? 'active' : ''}`}>&gt; HİSSELER</Link>
      <Link to="/screener" className={`sidebar-link ${location.pathname === '/screener' ? 'active' : ''}`}>&gt; SCREENER</Link>
      <Link to="/reports" className={`sidebar-link ${location.pathname === '/reports' ? 'active' : ''}`}>&gt; RAPORLAR</Link>
      <Link to="/brokerages" className={`sidebar-link ${location.pathname.startsWith('/kurum') || location.pathname === '/brokerages' ? 'active' : ''}`}>&gt; BROKERAGES</Link>
      <Link to="/models" className={`sidebar-link ${location.pathname === '/models' ? 'active' : ''}`} style={{ color: 'var(--text-highlight)' }}>&gt; MODEL PORTFÖYLER</Link>
      <Link to="/portfolio" className={`sidebar-link ${location.pathname === '/portfolio' ? 'active' : ''}`}>&gt; PORTFOLIO</Link>
    </aside>
  );
}
