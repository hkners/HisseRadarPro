import React from 'react';
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Stocks from "./pages/Stocks";
import StockDetail from "./pages/StockDetail";
import BrokerageDetail from "./pages/BrokerageDetail";
import Screener from "./pages/Screener";
import Brokerages from "./pages/Brokerages";
import Portfolio from "./pages/Portfolio";
import Models from "./pages/Models";
import ResearchReports from "./pages/ResearchReports";
import Sidebar from "./components/Sidebar";
import './index.css';

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
          color: 'var(--neon-blue)',
          border: '1px solid var(--neon-blue)',
          padding: '2px 8px',
          marginRight: '15px',
          cursor: 'pointer',
          fontSize: '12px'
        }}
      >
        {syncing ? "SENKRONIZE EDILIYOR..." : "[ VERILERI SENKRONIZE ET ]"}
      </button>

      {syncing && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', zIndex: 9999,
          display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>
          <div style={{
            width: '80%', maxWidth: '800px', height: '60vh',
            background: '#000', border: '1px solid var(--neon-blue)',
            borderRadius: '8px', padding: '20px',
            display: 'flex', flexDirection: 'column'
          }}>
            <h3 style={{ margin: '0 0 15px 0', color: 'var(--text-highlight)' }}>SENKRONIZASYON TERMINALI</h3>
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
      <div className="terminal-container">
        <header className="terminal-header">
          <div className="terminal-logo">HISSERADAR PRO v2.0 // TERMINAL</div>
          <div className="terminal-status" style={{ display: 'flex', alignItems: 'center' }}>
            <SyncButton />
            <span className="blink">●</span> BIST LIVE CONNECTED
          </div>
        </header>
        
        <div className="app-container">
          <Sidebar />
          
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/stocks" element={<Stocks />} />
              <Route path="/screener" element={<Screener />} />
              <Route path="/reports" element={<ResearchReports />} />
              <Route path="/brokerages" element={<Brokerages />} />
              <Route path="/models" element={<Models />} />
              <Route path="/portfolio" element={<Portfolio />} />
              <Route path="/hisse/:ticker" element={<StockDetail />} />
              <Route path="/kurum/:kurumName" element={<BrokerageDetail />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}

