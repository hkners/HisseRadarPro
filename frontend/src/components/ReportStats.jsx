import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function ReportStats({ reports = [] }) {
  const totalReportsCount = reports.length;
  const uniqueBrokersCount = useMemo(() => new Set(reports.map(r => r.broker)).size, [reports]);
  
  const topReport = useMemo(() => {
    return [...reports]
      .filter(r => r.potansiyel !== undefined && r.potansiyel !== null && !isNaN(r.potansiyel))
      .sort((a, b) => b.potansiyel - a.potansiyel)[0];
  }, [reports]);

  const topPotentialDisplay = topReport ? `+${topReport.potansiyel.toFixed(2)}%` : 'BEKLENİYOR';

  // Distribution chart data: Upside potential range buckets
  const distributionData = useMemo(() => {
    const buckets = {
      '0-20%': 0,
      '20-40%': 0,
      '40-60%': 0,
      '60%+': 0,
      'Diğer/NA': 0,
    };
    reports.forEach(r => {
      const pot = r.potansiyel;
      if (pot === undefined || pot === null || isNaN(pot) || pot <= 0) {
        buckets['Diğer/NA']++;
      } else if (pot <= 20) {
        buckets['0-20%']++;
      } else if (pot <= 40) {
        buckets['20-40%']++;
      } else if (pot <= 60) {
        buckets['40-60%']++;
      } else {
        buckets['60%+']++;
      }
    });
    return Object.keys(buckets).map(range => ({
      range,
      count: buckets[range],
    }));
  }, [reports]);

  const barColors = ['#88aa88', '#55cc55', '#00ff00', '#00e5ff', '#ffaa00'];

  return (
    <div style={{ marginBottom: '15px' }}>
      <div className="flex-row" style={{ gap: '15px', marginBottom: '15px' }}>
        <div className="panel flex-1" style={{ margin: 0 }}>
          <div className="panel-header">TOPLAM RAPOR</div>
          <div className="panel-content" style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text-highlight)' }}>
            {totalReportsCount} <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Adet</span>
          </div>
        </div>

        <div className="panel flex-1" style={{ margin: 0 }}>
          <div className="panel-header">ARACI KURUM SAYISI</div>
          <div className="panel-content" style={{ fontSize: '20px', fontWeight: 'bold', color: '#00e5ff' }}>
            {uniqueBrokersCount} <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Kurum</span>
          </div>
        </div>

        <div className="panel flex-1" style={{ margin: 0 }}>
          <div className="panel-header">EN YÜKSEK POTANSİYEL</div>
          <div className="panel-content" style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--color-up)' }}>
            {topPotentialDisplay}
            {topReport && (
              <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)' }}>
                ({topReport.ticker} - {topReport.broker})
              </span>
            )}
          </div>
        </div>
      </div>

      {reports.length > 0 && (
        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">// POTANSİYEL DAĞILIM ANALİZİ (RECHARTS)</div>
          <div className="panel-content" style={{ height: '140px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distributionData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <XAxis dataKey="range" stroke="#888" fontSize={11} tickLine={false} />
                <YAxis stroke="#888" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0c0d10', border: '1px solid #333', fontSize: '12px' }}
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                />
                <Bar dataKey="count" name="Rapor Sayısı" radius={[4, 4, 0, 0]}>
                  {distributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={barColors[index % barColors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
