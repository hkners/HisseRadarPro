import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';

const STREAM_URL = `${import.meta.env.VITE_API_URL?.replace(/\/api$/, '') || 'http://127.0.0.1:8015'}/api/scraped-reports/stream-scrape`;

export default function SyncButton() {
  const [syncing, setSyncing] = useState(false);
  const [logs, setLogs] = useState([]);

  const handleSync = () => {
    if (syncing) return;
    setSyncing(true);
    setLogs([]);

    const eventSource = new EventSource(STREAM_URL);

    eventSource.onmessage = (event) => {
      if (event.data === '[DONE]') {
        eventSource.close();
        setLogs(prev => [...prev, 'Senkronizasyon tamamlandı. Sayfa yenileniyor…']);
        setTimeout(() => {
          setSyncing(false);
          window.location.reload(); // Reload to fetch fresh data everywhere
        }, 2000);
      } else {
        setLogs(prev => [...prev, event.data]);
      }
    };

    eventSource.onerror = (err) => {
      console.error('EventSource failed:', err);
      eventSource.close();
      setLogs(prev => [...prev, 'HATA: Bağlantı koptu veya senkronizasyon başlatılamadı.']);
      setSyncing(false);
    };
  };

  return (
    <>
      <button type="button" className="btn btn-sm" onClick={handleSync} disabled={syncing} title="Kurum raporlarını ve fiyatları yeniden çek">
        <RefreshCw size={13} style={syncing ? { animation: 'spin .8s linear infinite' } : undefined} />
        <span className="hide-sm">{syncing ? 'Senkronize ediliyor…' : 'Senkronize et'}</span>
      </button>

      {syncing && (
        <div className="sync-overlay">
          <div className="sync-modal">
            <div className="eyebrow" style={{ marginBottom: 6 }}>Veri senkronizasyonu</div>
            <h3 className="display-title" style={{ fontSize: 18, marginBottom: 14 }}>Kurum raporları ve fiyatlar güncelleniyor</h3>
            <div className="sync-log">
              {logs.map((log, i) => <div key={i}>{log}</div>)}
              <div ref={(el) => el?.scrollIntoView({ behavior: 'smooth' })} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
