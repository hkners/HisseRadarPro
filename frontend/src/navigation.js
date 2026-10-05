// Single source of truth for navigation: sidebar, top tabs, command palette and document titles.
import {
  Briefcase, ShieldAlert, Layers, Sparkles, History, Filter, Compass, Radar,
  CandlestickChart, Factory, ArrowLeftRight, FileText, Landmark, Activity,
  LayoutDashboard, MessageSquare, Globe, TrendingUp, ClipboardCheck, Bell,
} from 'lucide-react';

export const APP_NAME = 'HisseRadar Pro';

export const TOP_TABS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/copilot', label: 'Copilot', icon: MessageSquare },
  { to: '/macro', label: 'Makro', icon: Globe },
];

export const NAV_GROUPS = [
  {
    label: 'PORTFÖY',
    items: [
      { to: '/portfolio', label: 'Portföyüm', icon: Briefcase },
      { to: '/analytics', label: 'Risk & Analiz', icon: ShieldAlert },
      { to: '/models', label: 'Model Portföyler', icon: Layers },
      { to: '/strategies', label: 'Strateji Merkezi', icon: TrendingUp },
      { to: '/alarms', label: 'Alarmlar', icon: Bell },
    ],
  },
  {
    label: 'OLUŞTUR',
    items: [
      { to: '/studio', label: 'Studio', icon: Sparkles },
      { to: '/backtest', label: 'Backtest', icon: History },
    ],
  },
  {
    label: 'ARAŞTIRMA',
    items: [
      { to: '/screener', label: 'Tarayıcı', icon: Filter },
      { to: '/discovery', label: 'Hisse Keşif', icon: Compass },
      { to: '/technical-screener', label: 'Teknik Radar', icon: Radar, matchAlso: ['/teknik-radar'] },
      { to: '/karne', label: 'Skor Karnesi', icon: ClipboardCheck },
      { to: '/stocks', label: 'Hisseler', icon: CandlestickChart, matchAlso: ['/hisse/'] },
      { to: '/industries', label: 'Sektörler', icon: Factory },
      { to: '/compare', label: 'Karşılaştır', icon: ArrowLeftRight },
      { to: '/reports', label: 'Raporlar', icon: FileText },
      { to: '/brokerages', label: 'Kurumlar', icon: Landmark, matchAlso: ['/kurum/'] },
      { to: '/viop', label: 'VİOP', icon: Activity },
    ],
  },
];

export const ALL_NAV_ITEMS = [...TOP_TABS, ...NAV_GROUPS.flatMap(g => g.items)];

export function isNavActive(item, pathname) {
  if (item.exact || item.to === '/') return pathname === '/';
  if (pathname === item.to || pathname.startsWith(item.to + '/')) return true;
  return (item.matchAlso || []).some(p => pathname.startsWith(p));
}

export function titleForPath(pathname) {
  const stock = pathname.match(/^\/hisse\/([^/]+)/);
  if (stock) return `${decodeURIComponent(stock[1]).toUpperCase()} · ${APP_NAME}`;
  const broker = pathname.match(/^\/kurum\/([^/]+)/);
  if (broker) {
    const name = decodeURIComponent(broker[1]).split('-').map(w => w.charAt(0).toLocaleUpperCase('tr') + w.slice(1)).join(' ');
    return `${name} · Kurumlar · ${APP_NAME}`;
  }
  const item = ALL_NAV_ITEMS.find(i => isNavActive(i, pathname));
  if (item) return `${item.label} · ${APP_NAME}`;
  return pathname === '/' ? `Dashboard · ${APP_NAME}` : `Sayfa bulunamadı · ${APP_NAME}`;
}
