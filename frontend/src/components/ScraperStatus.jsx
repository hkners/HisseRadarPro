import React, { useState, useEffect, useRef } from 'react';
import { Server } from 'lucide-react';

export default function ScraperStatus() {
    const [status, setStatus] = useState('idle');
    const [logs, setLogs] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const rootRef = useRef(null);

    const fetchStatus = () => {
        fetch(`${import.meta.env.VITE_API_URL}/admin/scrapers/status`)
            .then(res => res.json())
            .then(data => {
                setStatus(data.status);
                setLogs(data.logs);
            })
            .catch(err => console.error("Error fetching scraper status", err));
    };

    useEffect(() => {
        if (isOpen) {
            fetchStatus();
            const interval = setInterval(fetchStatus, 3000);
            return () => clearInterval(interval);
        }
    }, [isOpen]);

    // Close the dropdown on outside click.
    useEffect(() => {
        if (!isOpen) return;
        const onDown = (e) => { if (!rootRef.current?.contains(e.target)) setIsOpen(false); };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [isOpen]);

    const runScrapers = () => {
        fetch(`${import.meta.env.VITE_API_URL}/admin/scrapers/run`, { method: 'POST' })
            .then(() => fetchStatus())
            .catch(err => console.error("Error starting scrapers", err));
    };

    const isRunning = status === 'running';

    return (
        <div ref={rootRef} style={{ position: 'relative', display: 'inline-block' }}>
            <button
                type="button"
                className={`btn btn-sm${isRunning ? ' btn-outline-gold' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
                title="Scraper motoru durumu"
            >
                <Server size={13} />
                <span className="hide-sm">{isRunning ? 'Scraper çalışıyor' : 'Scraper'}</span>
            </button>

            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    right: 0,
                    width: 'min(550px, calc(100vw - 32px))',
                    background: 'var(--bg-raised)',
                    border: '1px solid var(--border-strong)',
                    borderRadius: 'var(--radius)',
                    padding: '12px',
                    boxShadow: '0 16px 40px rgba(0,0,0,0.7)',
                    zIndex: 100
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <span className="eyebrow">Scraper motoru · <span style={{ color: isRunning ? 'var(--warning)' : 'var(--positive)' }}>{isRunning ? 'ÇALIŞIYOR' : 'HAZIR'}</span></span>
                        <button type="button" className="btn btn-sm btn-primary" onClick={runScrapers} disabled={isRunning}>
                            {isRunning ? 'Çalışıyor…' : 'Tümünü şimdi çalıştır'}
                        </button>
                    </div>
                    <div className="sync-log" style={{ height: '250px', flex: 'none' }}>
                        {logs || 'Kayıt yok.'}
                    </div>
                </div>
            )}
        </div>
    );
}
