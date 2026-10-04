import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Search, HelpCircle } from 'lucide-react';
import { startTour } from './tours';
import Brand from './BrandMark';
import SyncButton from './SyncButton';
import ScraperStatus from '../ScraperStatus';
import { TOP_TABS, isNavActive } from '../../navigation';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export default function TopBar({ onOpenSearch }) {
  const { pathname } = useLocation();

  return (
    <header className="topbar">
      <div className="topbar-left">
        <Brand />
        <nav className="topbar-tabs" style={{ display: 'flex', gap: 4 }} aria-label="Ana sekmeler">
          {TOP_TABS.map(tab => {
            const Icon = tab.icon;
            const active = isNavActive(tab, pathname);
            return (
              <Link key={tab.to} to={tab.to} className={`topbar-tab${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined}>
                <Icon size={14} strokeWidth={1.7} />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="topbar-center">
        <button type="button" className="search-trigger" onClick={onOpenSearch} aria-label="Ara">
          <Search size={14} />
          <span className="grow">Hisse, şirket, kurum veya sayfa ara</span>
          <kbd className="kbd">{isMac ? '⌘' : 'Ctrl'} K</kbd>
        </button>
      </div>

      <div className="topbar-right">
        <button type="button" className="btn btn-sm btn-ghost" data-tour="help" onClick={startTour} title="Bu sayfanın tanıtımını göster" aria-label="Sayfa tanıtımı">
          <HelpCircle size={15} />
        </button>
        <SyncButton />
        <ScraperStatus />
      </div>
    </header>
  );
}
