import React, { useMemo } from 'react';

// The empty-data guard lives in the wrapper so the hooks below always run in the same order.
const TechnicalRatingsWidget = ({ taData, currentPrice }) => {
    if (!taData || !taData.indicators) return null;
    return <TechnicalRatingsBody taData={taData} currentPrice={currentPrice} />;
};

const TechnicalRatingsBody = ({ taData, currentPrice }) => {

    const { summary, indicators, oscillators, moving_averages } = taData;

    // Translation maps
    const textMap = {
        "STRONG_BUY": "GÜÇLÜ AL",
        "BUY": "AL",
        "NEUTRAL": "NÖTR",
        "SELL": "SAT",
        "STRONG_SELL": "GÜÇLÜ SAT"
    };

    const colorMap = {
        "STRONG_BUY": "var(--color-up)",
        "BUY": "var(--color-up)",
        "NEUTRAL": "var(--text-muted)",
        "SELL": "var(--color-down)",
        "STRONG_SELL": "var(--color-down)"
    };

    const gaugeMap = {
        "STRONG_BUY": 100,
        "BUY": 75,
        "NEUTRAL": 50,
        "SELL": 25,
        "STRONG_SELL": 0
    };

    // Needle angle mapping: 0deg is vertical (Neutral), negative is left (Sell), positive is right (Buy)
    const angleMap = {
        "STRONG_SELL": -72,
        "SELL": -36,
        "NEUTRAL": 0,
        "BUY": 36,
        "STRONG_BUY": 72
    };

    const overallRec = summary.RECOMMENDATION || "NEUTRAL";
    const rotation = angleMap[overallRec] ?? 0;

    const renderActionBadge = (action) => {
        const bg = action === 'BUY' ? 'var(--color-up)' : action === 'SELL' ? 'var(--color-down)' : 'transparent';
        const color = action === 'NEUTRAL' || action === 'NÖTR' ? 'var(--text-muted)' : 'var(--text-primary)';
        const text = action === 'BUY' ? 'AL' : action === 'SELL' ? 'SAT' : 'NÖTR';
        return (
            <span style={{
                background: bg, color, borderRadius: '3px', width: '28px', textAlign: 'center', 
                fontWeight: 'bold', fontSize: '9px', padding: '2px 0', display: 'inline-block'
            }}>
                {text}
            </span>
        );
    };

    const oscList = [
        { name: 'RSI (14)', key: 'RSI', valKey: 'RSI' },
        { name: 'Stokastik %K', key: 'STOCH.K', valKey: 'Stoch.K' },
        { name: 'CCI (20)', key: 'CCI', valKey: 'CCI20' },
        { name: 'MACD', key: 'MACD', valKey: 'MACD.macd' },
        { name: 'ADX (14)', key: 'ADX', valKey: 'ADX' },
        { name: 'Williams %R', key: 'W.R', valKey: 'W.R' },
        { name: 'Boğa/Ayı Gücü', key: 'BBPower', valKey: 'BBPower' },
        { name: 'Ult. Osc', key: 'UO', valKey: 'UO' }
    ];

    const maList = [5, 10, 20, 30, 50, 100, 200];

    const getMaAction = (val) => {
        if (!val || !currentPrice) return "NEUTRAL";
        return currentPrice > val ? "BUY" : "SELL";
    };

    const pivotTypes = [
        { key: 'Classic', label: 'Klasik' },
        { key: 'Fibonacci', label: 'Fibonacci' },
        { key: 'Camarilla', label: 'Camarilla' },
        { key: 'Woodie', label: 'Woodie' },
        { key: 'Demark', label: 'Demark' }
    ];

    const getPivotData = (type) => {
        return {
            name: type.label,
            S3: indicators[`Pivot.M.${type.key}.S3`],
            S2: indicators[`Pivot.M.${type.key}.S2`],
            S1: indicators[`Pivot.M.${type.key}.S1`],
            Pivot: indicators[`Pivot.M.${type.key}.Middle`],
            R1: indicators[`Pivot.M.${type.key}.R1`],
            R2: indicators[`Pivot.M.${type.key}.R2`],
            R3: indicators[`Pivot.M.${type.key}.R3`],
        };
    };

    // Summary counts across oscillators and moving averages
    const counts = useMemo(() => {
        let sell = 0, neutral = 0, buy = 0;
        if (oscillators && oscillators.COMPUTE) {
            Object.values(oscillators.COMPUTE).forEach(sig => {
                if (sig === 'BUY') buy++;
                else if (sig === 'SELL') sell++;
                else neutral++;
            });
        }
        if (indicators && currentPrice) {
            maList.forEach(len => {
                const sma = indicators[`SMA${len}`];
                const ema = indicators[`EMA${len}`];
                if (sma) { currentPrice > sma ? buy++ : sell++; }
                if (ema) { currentPrice > ema ? buy++ : sell++; }
            });
        }
        return { sell, neutral, buy };
    }, [oscillators, indicators, currentPrice]);

    return (
        <div style={{ background: 'var(--bg-secondary)', borderRadius: '5px', padding: '12px 10px', border: '1px solid var(--border-color)', width: '100%', boxSizing: 'border-box' }}>
            <h2 style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '15px', color: 'var(--color-neutral)', display: 'flex', alignItems: 'center', gap: '5px', letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                OTO-ANALİZ (TRADINGVIEW - ÖZET)
            </h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '4px 0' }}>
                <svg viewBox="0 0 200 115" style={{ width: '180px', height: '105px', overflow: 'visible' }}>
                    {/* Background track */}
                    <path
                        d="M 28 95 A 72 72 0 0 1 172 95"
                        fill="none"
                        stroke="rgba(255,255,255,0.06)"
                        strokeWidth="11"
                        strokeLinecap="round"
                    />

                    {/* Segment 1: GÜÇLÜ SAT (178° -> 146°) */}
                    <path
                        d="M 28.04 92.49 A 72 72 0 0 1 40.31 54.74"
                        fill="none"
                        stroke="var(--negative)"
                        strokeWidth={overallRec === "STRONG_SELL" ? 13 : 9}
                        strokeLinecap="round"
                        opacity={overallRec === "STRONG_SELL" ? 1.0 : 0.45}
                        style={{ transition: 'stroke-width 0.3s, opacity 0.3s' }}
                    />

                    {/* Segment 2: SAT (142° -> 110°) */}
                    <path
                        d="M 43.26 50.67 A 72 72 0 0 1 75.37 27.34"
                        fill="none"
                        stroke="var(--negative)"
                        strokeWidth={overallRec === "SELL" ? 13 : 9}
                        strokeLinecap="round"
                        opacity={overallRec === "SELL" ? 1.0 : 0.45}
                        style={{ transition: 'stroke-width 0.3s, opacity 0.3s' }}
                    />

                    {/* Segment 3: NÖTR (106° -> 74°) */}
                    <path
                        d="M 80.15 25.79 A 72 72 0 0 1 119.85 25.79"
                        fill="none"
                        stroke="var(--text-tertiary)"
                        strokeWidth={overallRec === "NEUTRAL" ? 13 : 9}
                        strokeLinecap="round"
                        opacity={overallRec === "NEUTRAL" ? 1.0 : 0.45}
                        style={{ transition: 'stroke-width 0.3s, opacity 0.3s' }}
                    />

                    {/* Segment 4: AL (70° -> 38°) */}
                    <path
                        d="M 124.63 27.34 A 72 72 0 0 1 156.74 50.67"
                        fill="none"
                        stroke="var(--positive)"
                        strokeWidth={overallRec === "BUY" ? 13 : 9}
                        strokeLinecap="round"
                        opacity={overallRec === "BUY" ? 1.0 : 0.45}
                        style={{ transition: 'stroke-width 0.3s, opacity 0.3s' }}
                    />

                    {/* Segment 5: GÜÇLÜ AL (34° -> 2°) */}
                    <path
                        d="M 159.69 54.74 A 72 72 0 0 1 171.96 92.49"
                        fill="none"
                        stroke="var(--positive)"
                        strokeWidth={overallRec === "STRONG_BUY" ? 13 : 9}
                        strokeLinecap="round"
                        opacity={overallRec === "STRONG_BUY" ? 1.0 : 0.45}
                        style={{ transition: 'stroke-width 0.3s, opacity 0.3s' }}
                    />

                    {/* Labels around gauge */}
                    <text x="18" y="108" fill={overallRec === "STRONG_SELL" ? "var(--negative)" : "var(--text-tertiary)"} fontSize="8" fontWeight={overallRec === "STRONG_SELL" ? "bold" : "normal"} textAnchor="middle">Güçlü sat</text>
                    <text x="48" y="34" fill={overallRec === "SELL" ? "var(--negative)" : "var(--text-tertiary)"} fontSize="8" fontWeight={overallRec === "SELL" ? "bold" : "normal"} textAnchor="middle">Sat</text>
                    <text x="100" y="14" fill={overallRec === "NEUTRAL" ? "var(--text-tertiary)" : "var(--text-tertiary)"} fontSize="8" fontWeight={overallRec === "NEUTRAL" ? "bold" : "normal"} textAnchor="middle">Nötr</text>
                    <text x="152" y="34" fill={overallRec === "BUY" ? "var(--positive)" : "var(--text-tertiary)"} fontSize="8" fontWeight={overallRec === "BUY" ? "bold" : "normal"} textAnchor="middle">Al</text>
                    <text x="182" y="108" fill={overallRec === "STRONG_BUY" ? "var(--positive)" : "var(--text-tertiary)"} fontSize="8" fontWeight={overallRec === "STRONG_BUY" ? "bold" : "normal"} textAnchor="middle">Güçlü al</text>

                    {/* Needle with pivot */}
                    <g style={{
                        transform: `rotate(${rotation}deg)`,
                        transformOrigin: '100px 95px',
                        transition: 'transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)'
                    }}>
                        <polygon points="98.5,95 99.5,35 100.5,35 101.5,95" fill="var(--text-primary)" filter="drop-shadow(0 1px 2px rgba(0,0,0,0.8))" />
                        <circle cx="100" cy="95" r="5" fill="var(--text-primary)" stroke="var(--bg-raised)" strokeWidth="2" />
                        <circle cx="100" cy="95" r="2" fill="var(--bg-raised)" />
                    </g>
                </svg>

                {/* Rating title */}
                <div style={{ fontSize: '16px', fontWeight: '900', color: colorMap[overallRec], marginTop: '2px', letterSpacing: '0.4px' }}>
                    {textMap[overallRec]}
                </div>

                {/* Signal count badges */}
                <div style={{ display: 'flex', gap: '14px', fontSize: '10px', marginTop: '4px', fontWeight: 'bold' }}>
                    <span style={{ color: 'var(--negative)' }}>Sat: {counts.sell}</span>
                    <span style={{ color: 'var(--text-tertiary)' }}>Nötr: {counts.neutral}</span>
                    <span style={{ color: 'var(--positive)' }}>Al: {counts.buy}</span>
                </div>
            </div>

            {/* Oscillators Table */}
            <div style={{ marginTop: '25px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--border-color)', paddingBottom: '5px', marginBottom: '8px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-highlight)', fontWeight: 'bold' }}>Teknik İndikatörler</div>
                    <div style={{ fontSize: '9px', color: colorMap[oscillators.RECOMMENDATION], fontWeight: 'bold' }}>
                        {textMap[oscillators.RECOMMENDATION]}
                    </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-muted)', marginBottom: '5px', padding: '0 2px' }}>
                    <span>İsim</span>
                    <div style={{ display: 'flex', gap: '15px', width: '80px', justifyContent: 'flex-end' }}>
                        <span style={{ width: '35px', textAlign: 'right' }}>Değer</span>
                        <span style={{ width: '30px', textAlign: 'center' }}>Sinyal</span>
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {oscList.map((osc, idx) => {
                        const val = indicators[osc.valKey];
                        const act = oscillators.COMPUTE[osc.key];
                        return (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent', padding: '3px 2px', borderRadius: '3px' }}>
                                <span style={{ color: 'var(--text-muted)' }}>{osc.name}</span>
                                <div style={{ display: 'flex', gap: '15px', alignItems: 'center', width: '80px', justifyContent: 'flex-end' }}>
                                    <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', width: '35px', textAlign: 'right', fontSize: '9px' }}>{val !== undefined && val !== null ? val.toFixed(2) : '-'}</span>
                                    {renderActionBadge(act)}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Moving Averages Table */}
            <div style={{ marginTop: '25px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--border-color)', paddingBottom: '5px', marginBottom: '8px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-highlight)', fontWeight: 'bold' }}>Hareketli Ortalama</div>
                    <div style={{ fontSize: '9px', color: colorMap[moving_averages.RECOMMENDATION], fontWeight: 'bold' }}>
                        {textMap[moving_averages.RECOMMENDATION]}
                    </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-muted)', marginBottom: '5px', padding: '0 2px' }}>
                    <span style={{ width: '35px' }}>İsim</span>
                    <div style={{ display: 'flex', gap: '5px', flex: 1, justifyContent: 'flex-end' }}>
                        <span style={{ width: '80px', textAlign: 'center' }}>Basit (SMA)</span>
                        <span style={{ width: '80px', textAlign: 'center' }}>Üssel (EMA)</span>
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {maList.map((len, idx) => {
                        const sma = indicators[`SMA${len}`];
                        const ema = indicators[`EMA${len}`];
                        return (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent', padding: '3px 2px', borderRadius: '3px' }}>
                                <span style={{ color: 'var(--text-muted)', width: '35px', fontWeight: 'bold' }}>{len}</span>
                                <div style={{ display: 'flex', gap: '5px', flex: 1, justifyContent: 'flex-end' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', width: '80px', justifyContent: 'space-between' }}>
                                        <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '9px' }}>{sma ? sma.toFixed(2) : '-'}</span>
                                        {renderActionBadge(getMaAction(sma))}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', width: '80px', justifyContent: 'space-between' }}>
                                        <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '9px' }}>{ema ? ema.toFixed(2) : '-'}</span>
                                        {renderActionBadge(getMaAction(ema))}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Pivot Points Table */}
            {indicators['Pivot.M.Classic.Pivot'] !== undefined && (
            <div style={{ marginTop: '25px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-highlight)', fontWeight: 'bold', borderBottom: '1px solid var(--border-color)', paddingBottom: '5px', marginBottom: '8px' }}>
                    Pivot Noktaları
                </div>
                <div style={{ overflowX: 'auto', width: '100%', paddingBottom: '5px' }}>
                    <table style={{ width: '100%', fontSize: '9px', color: 'var(--text-muted)', borderCollapse: 'collapse', textAlign: 'center', minWidth: '320px' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                <th style={{ padding: '3px', textAlign: 'left' }}>İsim</th>
                                <th style={{ padding: '3px' }}>S3</th>
                                <th style={{ padding: '3px' }}>S2</th>
                                <th style={{ padding: '3px' }}>S1</th>
                                <th style={{ padding: '3px', color: 'var(--text-primary)' }}>Pivot</th>
                                <th style={{ padding: '3px' }}>R1</th>
                                <th style={{ padding: '3px' }}>R2</th>
                                <th style={{ padding: '3px' }}>R3</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pivotTypes.map((pt, idx) => {
                                const p = getPivotData(pt);
                                return (
                                    <tr key={idx} style={{ background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                                        <td style={{ padding: '3px', textAlign: 'left', fontWeight: 'bold' }}>{p.name}</td>
                                        <td style={{ padding: '3px', fontFamily: 'var(--font-mono)' }}>{p.S3 ? p.S3.toFixed(2) : '-'}</td>
                                        <td style={{ padding: '3px', fontFamily: 'var(--font-mono)' }}>{p.S2 ? p.S2.toFixed(2) : '-'}</td>
                                        <td style={{ padding: '3px', fontFamily: 'var(--font-mono)' }}>{p.S1 ? p.S1.toFixed(2) : '-'}</td>
                                        <td style={{ padding: '3px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 'bold' }}>{p.Pivot ? p.Pivot.toFixed(2) : '-'}</td>
                                        <td style={{ padding: '3px', fontFamily: 'var(--font-mono)' }}>{p.R1 ? p.R1.toFixed(2) : '-'}</td>
                                        <td style={{ padding: '3px', fontFamily: 'var(--font-mono)' }}>{p.R2 ? p.R2.toFixed(2) : '-'}</td>
                                        <td style={{ padding: '3px', fontFamily: 'var(--font-mono)' }}>{p.R3 ? p.R3.toFixed(2) : '-'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
            )}
        </div>
    );
};

export default TechnicalRatingsWidget;
