import React, { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '../ui';
import DisclosureList from './DisclosureList';

const API = import.meta.env.VITE_API_URL || '/api';

// One stock's KAP disclosures (stored feed, last 12 months).
export default function StockKap({ ticker }) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    setItems(null);
    fetch(`${API}/kap/stock/${ticker}?days=365`).then(r => r.json()).then(d => setItems(d.items || [])).catch(() => setItems([]));
  }, [ticker]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="text-muted" style={{ fontSize: 12 }}>Son 12 ayın KAP bildirimleri{items ? ` · ${items.length}` : ''}. Satıra tıklayınca bildirim metni açılır.</span>
        <Button size="sm" to={`/alarms?ticker=${ticker}`}><Bell size={12} /> KAP alarmı kur</Button>
      </div>
      <div className="panel" style={{ marginBottom: 0 }}>
        <div className="panel-content" style={{ padding: 0, flex: 'none' }}>
          {items == null ? <p className="text-muted" style={{ padding: 10 }}>Yükleniyor…</p>
            : <DisclosureList items={items} showTickers={false} empty="Saklanan KAP geçmişinde bu hisse için bildirim yok. Geçmiş indirmesi KAP Akışı sayfasından başlatılabilir." />}
        </div>
      </div>
    </div>
  );
}
