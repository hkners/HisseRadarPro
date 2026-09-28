import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function Sidebar() {
  const location = useLocation();
  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const links = [
    { to: '/', label: 'DASHBOARD' },
    { to: '/discovery', label: 'HİSSE KEŞİF' },
    { to: '/alpha', label: 'ALPHA INSIGHTS' },
    { to: '/stocks', label: 'HİSSELER' },
    { to: '/screener', label: 'TARAYICI' },
    { to: '/technical-screener', label: 'TEKNİK RADAR' },
    { to: '/reports', label: 'RAPORLAR' },
    { to: '/brokerages', label: 'KURUMLAR', matchAlso: '/kurum' },
    { to: '/models', label: 'MODEL PORTFÖY' },
    { to: '/portfolio', label: 'PORTFÖYÜM' },
    { to: '/viop', label: 'VİOP' },
  ];

  return (
    <aside className="sidebar">
      {links.map(link => (
        <Link
          key={link.to}
          to={link.to}
          className={`sidebar-link ${isActive(link.to) || (link.matchAlso && location.pathname.startsWith(link.matchAlso)) ? 'active' : ''}`}
        >
          &gt; {link.label}
        </Link>
      ))}
    </aside>
  );
}
