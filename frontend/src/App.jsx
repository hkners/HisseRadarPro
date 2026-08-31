import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import ErrorBoundary from "./components/ErrorBoundary";
import ScraperStatus from "./components/ScraperStatus";
import './index.css';

// Lazy-loaded pages for code splitting — only loaded when navigated to
const Home = React.lazy(() => import("./pages/Home"));
const Stocks = React.lazy(() => import("./pages/Stocks"));
const StockDetail = React.lazy(() => import("./pages/StockDetail"));
const BrokerageDetail = React.lazy(() => import("./pages/BrokerageDetail"));
const Screener = React.lazy(() => import("./pages/Screener"));
const TechnicalScreener = React.lazy(() => import("./pages/TechnicalScreener"));
const Brokerages = React.lazy(() => import("./pages/Brokerages"));
const Portfolio = React.lazy(() => import("./pages/Portfolio"));
const Models = React.lazy(() => import("./pages/Models"));
const ResearchReports = React.lazy(() => import("./pages/ResearchReports"));
const Discovery = React.lazy(() => import("./pages/Discovery"));

const PageLoader = () => (
  <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '60px', fontSize: '14px' }}>
    <div style={{ fontSize: '24px', marginBottom: '10px' }}>●</div>
    Yükleniyor...
  </div>
);

function SyncButton() {
  const [syncing, setSyncing] = React.useState(false);
  const [logs, setLogs] = React.useState([]);

  const handleSync = () => {
    if (syncing) return;
    setSyncing(true);
    setLogs([]);

    const eventSource = new EventSource(`${import.meta.env.VITE_API_URL?.replace(/\/api$/, '') || 'http://127.0.0.1:8015'}/api/scraped-reports/stream-scrape`);

    eventSource.onmessage = (event) => {
      if (event.data === "[DONE]") {
        eventSource.close();
        setLogs(prev => [...prev, "Sync completed successfully. Refreshing..."]);
        setTimeout(() => {
          setSyncing(false);
          window.location.reload(); // Reload to fetch fresh data everywhere
        }, 2000);
      } else {
        setLogs(prev => [...prev, event.data]);
      }
    };

    eventSource.onerror = (err) => {
      console.error("EventSource failed:", err);
      eventSource.close();
      setLogs(prev => [...prev, "ERROR: Connection lost or failed to start sync."]);
      setSyncing(false);
    };
  };

  return (
    <>
      <button 
        onClick={handleSync}
        disabled={syncing}
        style={{
          background: 'transparent',
          color: 'var(--color-neutral)',
          border: '1px solid var(--border-color)',
          padding: '4px 10px',
          marginRight: '15px',
          cursor: 'pointer',
          fontSize: '12px',
          borderRadius: '4px'
        }}
      >
        {syncing ? "Senkronize Ediliyor..." : "Verileri Senkronize Et"}
      </button>

      {syncing && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', zIndex: 9999,
          display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>
          <div style={{
            width: '80%', maxWidth: '800px', height: '60vh',
            background: 'var(--bg-panel)', border: '1px solid var(--border-color)',
            borderRadius: '8px', padding: '20px',
            display: 'flex', flexDirection: 'column'
          }}>
            <h3 style={{ margin: '0 0 15px 0', color: 'var(--text-highlight)' }}>Veri Senkronizasyonu</h3>
            <div style={{
              flex: 1, overflowY: 'auto', background: '#111', 
              padding: '10px', borderRadius: '4px', fontFamily: 'monospace',
              fontSize: '12px', color: '#0f0', whiteSpace: 'pre-wrap'
            }}>
              {logs.map((log, i) => (
                <div key={i}>{log}</div>
              ))}
              <div style={{ float: 'left', clear: 'both' }}
                ref={(el) => { el && el.scrollIntoView({ behavior: 'smooth' }) }}>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <div className="terminal-container">
          <header className="terminal-header">
            <div className="terminal-logo">HisseRadar Pro</div>
            <div className="terminal-status" style={{ display: 'flex', alignItems: 'center' }}>
              <SyncButton />
              <ScraperStatus />
              <span style={{ color: 'var(--color-up)', marginRight: '5px' }}>●</span> BIST Canlı
            </div>
          </header>
          
          <div className="app-container">
            <Sidebar />
            
            <main className="main-content">
              <ErrorBoundary>
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/discovery" element={<Discovery />} />
                    <Route path="/stocks" element={<Stocks />} />
                    <Route path="/screener" element={<Screener />} />
                    <Route path="/technical-screener" element={<TechnicalScreener />} />
                    <Route path="/reports" element={<ResearchReports />} />
                    <Route path="/brokerages" element={<Brokerages />} />
                    <Route path="/models" element={<Models />} />
                    <Route path="/portfolio" element={<Portfolio />} />
                    <Route path="/hisse/:ticker" element={<StockDetail />} />
                    <Route path="/kurum/:kurumName" element={<BrokerageDetail />} />
                  </Routes>
                </Suspense>
              </ErrorBoundary>
            </main>
          </div>
        </div>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

