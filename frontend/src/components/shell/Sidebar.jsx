import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NAV_GROUPS, isNavActive } from '../../navigation';

const STORAGE_KEY = 'hr.sidebar.collapsed';

function readCollapsed() {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

export default function Sidebar() {
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const toggle = () => {
    setCollapsed(c => {
      try { localStorage.setItem(STORAGE_KEY, c ? '0' : '1'); } catch { /* storage unavailable */ }
      return !c;
    });
  };

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`} aria-label="Ana menü">
      {NAV_GROUPS.map(group => (
        <nav key={group.label} className="sidebar-group">
          <div className="sidebar-group-label">{group.label}</div>
          {group.items.map(item => {
            const Icon = item.icon;
            const active = isNavActive(item, pathname);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`sidebar-link${active ? ' active' : ''}`}
                title={collapsed ? item.label : undefined}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={15} strokeWidth={1.7} />
                <span className="link-label">{item.label}</span>
                {item.soon && <span className="soon">YAKINDA</span>}
              </Link>
            );
          })}
        </nav>
      ))}
      <button type="button" className="sidebar-collapse" onClick={toggle} aria-label={collapsed ? 'Menüyü genişlet' : 'Menüyü daralt'}>
        {collapsed ? <PanelLeftOpen size={15} strokeWidth={1.7} /> : <PanelLeftClose size={15} strokeWidth={1.7} />}
        <span>Daralt</span>
      </button>
    </aside>
  );
}
