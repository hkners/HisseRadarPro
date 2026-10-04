import React, { useState, useEffect } from 'react';
import { AreaChart, Area, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function MiniChart({ ticker }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    fetch(`${import.meta.env.VITE_API_URL}/stocks/${ticker}/history`)
      .then(res => res.json())
      .then(json => {
        if (Array.isArray(json)) {
          // Keep the last 90 days
          const recentData = json.slice(-90).map(d => ({
            date: d.date,
            price: d.close
          }));
          setData(recentData);
        }
      })
      .catch(err => console.error("MiniChart error:", err))
      .finally(() => setLoading(false));
  }, [ticker]);

  if (!ticker) return null;

  return (
    <div style={{ width: '100%', height: '100%', minHeight: '180px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, position: 'relative' }}>
        {loading ? (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'var(--text-muted)' }}>
            LOADING TREND...
          </div>
        ) : data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-cyan)" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="var(--bg-panel)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <YAxis domain={['auto', 'auto']} hide />
              <Tooltip 
                contentStyle={{ backgroundColor: '#000', border: '1px solid var(--border-color)', fontSize: '11px', fontFamily: 'var(--font-mono)' }} 
                itemStyle={{ color: 'var(--color-cyan)' }}
                labelStyle={{ color: 'var(--text-muted)' }}
              />
              <Area type="monotone" dataKey="price" stroke="var(--color-cyan)" fillOpacity={1} fill="url(#colorPrice)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'var(--color-warning)', fontSize: '10px' }}>
            AWAITING DATA SYNC
          </div>
        )}
      </div>
    </div>
  );
}
