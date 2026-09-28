import React, { useState, useEffect } from 'react';

export default function AddToPortfolioModal({ ticker, currentPrice, isOpen, onClose, onSuccess }) {
  const [buyMode, setBuyMode] = useState('amount'); // 'amount' (Tutar/TL) | 'quantity' (Adet)
  const [targetAmount, setTargetAmount] = useState('10000'); // Varsayılan 10k TL
  const [quantity, setQuantity] = useState('100');
  const [cost, setCost] = useState(currentPrice ? currentPrice.toFixed(2) : '');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Fiyat güncellendiğinde maliyet alanını güncelle
  useEffect(() => {
    if (currentPrice) {
      setCost(currentPrice.toFixed(2));
    }
  }, [currentPrice]);

  // Mod değiştiğinde mantıklı değer aktarımı
  const handleModeChange = (newMode) => {
    setBuyMode(newMode);
    setError('');
    const p = parseFloat(cost) || (currentPrice || 1);
    
    if (newMode === 'amount') {
      // Adetten tutara geçiş
      const q = parseFloat(quantity) || 100;
      setTargetAmount((q * p).toFixed(0));
    } else {
      // Tutardan adede geçiş
      const a = parseFloat(targetAmount) || 10000;
      const calculatedQty = p > 0 ? Math.floor(a / p) : 100;
      setQuantity(String(Math.max(1, calculatedQty)));
    }
  };

  if (!isOpen) return null;

  // Hesaplamalar
  const priceNum = parseFloat(cost) || 0;
  const targetAmtNum = parseFloat(targetAmount) || 0;
  const qtyNum = parseFloat(quantity) || 0;

  // Tutar modunda hesaplanan tam adet
  const calculatedQtyFromAmount = priceNum > 0 && targetAmtNum > 0 ? Math.floor(targetAmtNum / priceNum) : 0;
  
  // Efektif alınacak adet ve toplam tutar
  const effectiveQty = buyMode === 'amount' ? calculatedQtyFromAmount : qtyNum;
  const actualTotalAmount = effectiveQty * priceNum;
  const remainingBudget = buyMode === 'amount' && targetAmtNum > actualTotalAmount ? targetAmtNum - actualTotalAmount : 0;

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!ticker || priceNum <= 0) {
      setError('Lütfen geçerli bir hisse fiyatı giriniz.');
      return;
    }

    if (buyMode === 'amount') {
      if (targetAmtNum <= 0) {
        setError('Lütfen geçerli bir yatırım tutarı (TL) giriniz.');
        return;
      }
      if (calculatedQtyFromAmount < 1) {
        setError(`Girilen tutar (${targetAmtNum.toLocaleString('tr-TR')} TL), 1 adet ${ticker} (${priceNum.toFixed(2)} TL) almaya yetmemektedir.`);
        return;
      }
    } else {
      if (qtyNum <= 0 || isNaN(qtyNum)) {
        setError('Lütfen en az 1 adet pay giriniz.');
        return;
      }
    }

    setSubmitting(true);
    setError('');

    const finalQty = effectiveQty;

    fetch(`${import.meta.env.VITE_API_URL}/portfolio/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticker: ticker.toUpperCase(),
        tx_type: 'BUY',
        quantity: finalQty,
        price: priceNum,
        tx_date: date
      })
    })
      .then(res => {
        if (!res.ok) throw new Error('İşlem portföye kaydedilemedi.');
        return res.json();
      })
      .then(() => {
        setSubmitting(false);
        setSuccessMsg(`${finalQty} adet ${ticker} (Toplam ${actualTotalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL) portföye eklendi.`);
        setTimeout(() => {
          setSuccessMsg('');
          if (onSuccess) onSuccess();
          onClose();
        }, 1300);
      })
      .catch(err => {
        setSubmitting(false);
        setError(err.message || 'Hata oluştu.');
      });
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      backdropFilter: 'blur(5px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px'
    }}>
      <div 
        className="panel-neon"
        style={{
          width: '100%',
          maxWidth: '480px',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          padding: '22px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.85)'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: '800', color: 'var(--text-highlight)', letterSpacing: '0.5px' }}>
              PORTFÖYE EKLE:
            </span>
            <span style={{ fontSize: '16px', fontWeight: '900', color: 'var(--color-cyan)' }}>
              {ticker}
            </span>
            {currentPrice && (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '4px' }}>
                {currentPrice.toFixed(2)} TL
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '2px 6px',
              borderRadius: '4px',
              lineHeight: 1
            }}
          >
            ✕
          </button>
        </div>

        {/* Hata ve Başarı Bildirimleri */}
        {error && (
          <div style={{ background: 'rgba(248, 81, 73, 0.15)', color: 'var(--color-down)', padding: '10px 12px', borderRadius: '6px', fontSize: '12px', marginBottom: '14px', border: '1px solid rgba(248, 81, 73, 0.3)' }}>
            ⚠️ {error}
          </div>
        )}

        {successMsg && (
          <div style={{ background: 'rgba(63, 185, 80, 0.15)', color: 'var(--color-up)', padding: '10px 12px', borderRadius: '6px', fontSize: '12px', marginBottom: '14px', border: '1px solid rgba(63, 185, 80, 0.3)', fontWeight: 'bold' }}>
            ✓ {successMsg}
          </div>
        )}

        {/* ALIM YÖNTEMİ SEÇİCİ (TUTAR / ADET TOGGLE) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '6px',
          background: '#12141a',
          padding: '4px',
          borderRadius: '8px',
          marginBottom: '16px',
          border: '1px solid var(--border-color)'
        }}>
          <button
            type="button"
            onClick={() => handleModeChange('amount')}
            style={{
              background: buyMode === 'amount' ? 'rgba(57, 197, 207, 0.2)' : 'transparent',
              color: buyMode === 'amount' ? 'var(--color-cyan)' : 'var(--text-muted)',
              border: `1px solid ${buyMode === 'amount' ? 'var(--color-cyan)' : 'transparent'}`,
              borderRadius: '6px',
              padding: '8px 12px',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
          >
            <span>💰</span> Tutar (TL) ile Al
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('quantity')}
            style={{
              background: buyMode === 'quantity' ? 'rgba(57, 197, 207, 0.2)' : 'transparent',
              color: buyMode === 'quantity' ? 'var(--color-cyan)' : 'var(--text-muted)',
              border: `1px solid ${buyMode === 'quantity' ? 'var(--color-cyan)' : 'transparent'}`,
              borderRadius: '6px',
              padding: '8px 12px',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
          >
            <span>📊</span> Adet ile Al
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          
          {/* ─── DURUM 1: TUTAR BAZLI GİRİŞ ─── */}
          {buyMode === 'amount' ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: '700' }}>
                  YATIRIM TUTARI (TL BÜTÇE)
                </label>
                <span style={{ fontSize: '11px', color: 'var(--color-cyan)' }}>
                  {priceNum > 0 ? `1 Adet = ${priceNum.toFixed(2)} TL` : ''}
                </span>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={targetAmount}
                  onChange={e => setTargetAmount(e.target.value)}
                  className="search-box"
                  style={{
                    width: '100%',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    padding: '9px 40px 9px 12px',
                    fontVariantNumeric: 'tabular-nums'
                  }}
                  placeholder="Örn: 10000"
                  required
                />
                <span style={{
                  position: 'absolute',
                  right: '12px',
                  top: '9px',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  color: 'var(--text-muted)'
                }}>
                  TL
                </span>
              </div>

              {/* Hızlı Tutar Butonları (5k, 10k, 25k, 50k, 100k) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px', marginTop: '8px' }}>
                {[
                  { label: '5.000 ₺', val: 5000 },
                  { label: '10.000 ₺', val: 10000 },
                  { label: '25.000 ₺', val: 25000 },
                  { label: '50.000 ₺', val: 50000 },
                  { label: '100.000 ₺', val: 100000 }
                ].map(chip => (
                  <button
                    key={chip.val}
                    type="button"
                    onClick={() => setTargetAmount(String(chip.val))}
                    style={{
                      background: targetAmount === String(chip.val) ? 'rgba(57, 197, 207, 0.25)' : 'rgba(255,255,255,0.05)',
                      color: targetAmount === String(chip.val) ? 'var(--color-cyan)' : 'var(--text-muted)',
                      border: `1px solid ${targetAmount === String(chip.val) ? 'var(--color-cyan)' : 'var(--border-color)'}`,
                      borderRadius: '4px',
                      padding: '5px 0',
                      fontSize: '11px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      transition: 'all 0.1s'
                    }}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              {/* Hesaplanan Pay Açıklaması */}
              {targetAmtNum > 0 && priceNum > 0 && (
                <div style={{
                  marginTop: '10px',
                  padding: '10px 12px',
                  background: calculatedQtyFromAmount >= 1 ? 'rgba(57, 197, 207, 0.08)' : 'rgba(248, 81, 73, 0.08)',
                  border: `1px solid ${calculatedQtyFromAmount >= 1 ? 'rgba(57, 197, 207, 0.25)' : 'rgba(248, 81, 73, 0.25)'}`,
                  borderRadius: '6px',
                  fontSize: '12px'
                }}>
                  {calculatedQtyFromAmount >= 1 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Alınabilecek Tam Pay:</span>
                        <strong style={{ color: 'var(--color-cyan)', fontSize: '14px' }}>{calculatedQtyFromAmount} ADET</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11.5px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Gerçekleşecek Tutar:</span>
                        <span style={{ color: '#fff', fontWeight: '600' }}>{actualTotalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</span>
                      </div>
                      {remainingBudget > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
                          <span>Bütçeden Kalan Nakit:</span>
                          <span style={{ color: 'var(--color-warning)' }}>{remainingBudget.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <span style={{ color: 'var(--color-down)' }}>
                      Girilen tutar en az 1 hisse ({priceNum.toFixed(2)} TL) almaya yetmiyor.
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* ─── DURUM 2: ADET BAZLI GİRİŞ ─── */
            <div>
              <label style={{ display: 'block', fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: '700' }}>
                ADET (PAY SAYISI)
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                className="search-box"
                style={{ width: '100%', fontSize: '15px', fontWeight: 'bold', padding: '9px 12px', fontVariantNumeric: 'tabular-nums' }}
                required
              />
              {/* Quick Pills */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px', marginTop: '8px' }}>
                {[50, 100, 250, 500, 1000].map(qty => (
                  <button
                    key={qty}
                    type="button"
                    onClick={() => setQuantity(String(qty))}
                    style={{
                      background: quantity === String(qty) ? 'rgba(57, 197, 207, 0.25)' : 'rgba(255,255,255,0.05)',
                      color: quantity === String(qty) ? 'var(--color-cyan)' : 'var(--text-muted)',
                      border: `1px solid ${quantity === String(qty) ? 'var(--color-cyan)' : 'var(--border-color)'}`,
                      borderRadius: '4px',
                      padding: '5px 0',
                      fontSize: '11px',
                      fontWeight: '700',
                      cursor: 'pointer'
                    }}
                  >
                    +{qty}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Alış Fiyatı (TL) */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
              <label style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: '700' }}>
                BİRİM ALIŞ FİYATI (TL)
              </label>
              {currentPrice && (
                <button
                  type="button"
                  onClick={() => setCost(currentPrice.toFixed(2))}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-cyan)',
                    fontSize: '11px',
                    cursor: 'pointer',
                    padding: 0,
                    textDecoration: 'underline'
                  }}
                >
                  Piyasa Fiyatına Eşitle ({currentPrice.toFixed(2)} TL)
                </button>
              )}
            </div>
            <input
              type="number"
              step="any"
              min="0"
              value={cost}
              onChange={e => setCost(e.target.value)}
              className="search-box"
              style={{ width: '100%', fontSize: '14px', fontWeight: 'bold', padding: '8px 12px', fontVariantNumeric: 'tabular-nums' }}
              required
            />
          </div>

          {/* İşlem Tarihi */}
          <div>
            <label style={{ display: 'block', fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '5px', fontWeight: '700' }}>
              İŞLEM TARİHİ
            </label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="search-box"
              style={{ width: '100%', fontSize: '12px', padding: '8px 12px' }}
              required
            />
          </div>

          {/* Özet Kutusu */}
          <div style={{
            background: '#12141a',
            padding: '12px 16px',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
              <span>Portföye Eklenecek:</span>
              <strong style={{ color: '#fff' }}>{effectiveQty} Adet {ticker}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '6px' }}>
              <span style={{ fontSize: '12.5px', color: 'var(--text-muted)', fontWeight: '600' }}>Toplam Portföy Girişi:</span>
              <span style={{ fontSize: '16px', fontWeight: '800', color: 'var(--color-cyan)', fontVariantNumeric: 'tabular-nums' }}>
                {actualTotalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
              </span>
            </div>
          </div>

          {/* Butonlar */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
            <button
              type="button"
              onClick={onClose}
              className="action-button"
              style={{
                flex: 1,
                padding: '10px 0',
                fontSize: '12px',
                textAlign: 'center',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                background: 'rgba(255,255,255,0.05)',
                color: 'var(--text-muted)',
                cursor: 'pointer'
              }}
            >
              İPTAL
            </button>
            <button
              type="submit"
              disabled={submitting || effectiveQty < 1}
              className="action-button"
              style={{
                flex: 1.6,
                padding: '10px 0',
                fontSize: '12.5px',
                background: effectiveQty >= 1 ? 'var(--color-up)' : 'rgba(255,255,255,0.1)',
                color: effectiveQty >= 1 ? '#000' : 'var(--text-muted)',
                fontWeight: '800',
                textAlign: 'center',
                borderRadius: '6px',
                border: 'none',
                cursor: submitting || effectiveQty < 1 ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {submitting ? 'KAYDEDİLİYOR...' : `PORTFÖYE EKLE (${effectiveQty} ADET)`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
