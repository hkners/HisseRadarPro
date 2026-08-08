import React from 'react';

export default function Portfolio() {
  return (
    <div className="panel flex-1">
      <div className="panel-header" style={{ color: 'var(--color-neutral)' }}>
        PORTFOLIO MANAGER // COMING SOON
      </div>
      <div className="panel-content" style={{ textAlign: 'center', marginTop: '100px' }}>
        <h2 style={{ color: 'var(--text-highlight)' }}>FEATURE IN DEVELOPMENT</h2>
        <p className="text-muted" style={{ marginTop: '20px' }}>
          Portfolio tracking, PnL analysis, and AI risk management will be available in the upcoming PHASE 4 update.
        </p>
      </div>
    </div>
  );
}