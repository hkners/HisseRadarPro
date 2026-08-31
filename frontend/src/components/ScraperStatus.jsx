import React, { useState, useEffect } from 'react';

export default function ScraperStatus() {
    const [status, setStatus] = useState('idle');
    const [logs, setLogs] = useState('');
    const [isOpen, setIsOpen] = useState(false);

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

    const runScrapers = () => {
        fetch(`${import.meta.env.VITE_API_URL}/admin/scrapers/run`, { method: 'POST' })
            .then(() => fetchStatus())
            .catch(err => console.error("Error starting scrapers", err));
    };

    const isRunning = status === 'running';

    return (
        <div style={{ position: 'relative', display: 'inline-block' }}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    background: 'rgba(0,0,0,0.85)',
                    color: isRunning ? 'var(--color-warning)' : 'var(--color-cyan)',
                    border: `1px solid ${isRunning ? 'var(--color-warning)' : '#333'}`,
                    padding: '6px 14px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    letterSpacing: '0.5px',
                    transition: 'all 0.2s ease'
                }}
            >
                {isRunning ? '[...] SCRAPERS RUNNING' : '[SYS] SCRAPER'}
            </button>

            {isOpen && (
                <div style={{
                    position: 'absolute',
                    bottom: '40px',
                    right: '0',
                    width: '550px',
                    background: '#0a0a0a',
                    border: '1px solid #333',
                    padding: '12px',
                    boxShadow: '0 8px 20px rgba(0,0,0,0.7)',
                    color: '#fff',
                    fontFamily: 'var(--font-mono)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid #222', paddingBottom: '8px' }}>
                        <span style={{ color: 'var(--color-cyan)', fontSize: '12px', fontWeight: 'bold' }}>SCRAPER ENGINE STATUS</span>
                        <button
                            onClick={runScrapers}
                            disabled={isRunning}
                            style={{
                                background: 'transparent',
                                color: isRunning ? '#555' : 'var(--color-up)',
                                border: `1px solid ${isRunning ? '#333' : 'var(--color-up)'}`,
                                padding: '4px 12px',
                                fontFamily: 'var(--font-mono)',
                                fontSize: '11px',
                                fontWeight: 'bold',
                                cursor: isRunning ? 'not-allowed' : 'pointer'
                            }}
                        >
                            {isRunning ? 'RUNNING...' : 'FORCE RUN ALL'}
                        </button>
                    </div>

                    <div style={{
                        background: '#000',
                        padding: '8px',
                        height: '250px',
                        overflowY: 'auto',
                        fontSize: '10px',
                        color: 'var(--color-neutral)',
                        border: '1px solid #1a1a1a',
                        whiteSpace: 'pre-wrap'
                    }}>
                        {logs || "No logs available."}
                    </div>
                </div>
            )}
        </div>
    );
}
