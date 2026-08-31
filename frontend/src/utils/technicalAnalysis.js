export function calculateSMA(data, period, key = 'close') {
    const result = new Array(data.length).fill(null);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
        sum += data[i][key];
        if (i >= period) {
            sum -= data[i - period][key];
            result[i] = sum / period;
        } else if (i === period - 1) {
            result[i] = sum / period;
        }
    }
    return result;
}

export function calculateEMA(data, period, key = 'close') {
    const result = new Array(data.length).fill(null);
    const multiplier = 2 / (period + 1);
    let ema = null;
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            sum += data[i][key];
        } else if (i === period - 1) {
            sum += data[i][key];
            ema = sum / period;
            result[i] = ema;
        } else {
            ema = (data[i][key] - ema) * multiplier + ema;
            result[i] = ema;
        }
    }
    return result;
}

export function calculateMACD(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    const fastEma = calculateEMA(data, fastPeriod, 'close');
    const slowEma = calculateEMA(data, slowPeriod, 'close');
    const macdLine = new Array(data.length).fill(null);
    const macdLineObjects = [];
    for (let i = 0; i < data.length; i++) {
        if (fastEma[i] !== null && slowEma[i] !== null) {
            const val = fastEma[i] - slowEma[i];
            macdLine[i] = val;
            macdLineObjects.push({ close: val });
        } else {
            macdLineObjects.push({ close: null });
        }
    }
    let firstValidIndex = macdLine.findIndex(v => v !== null);
    const signalLine = new Array(data.length).fill(null);
    const histogram = new Array(data.length).fill(null);
    if (firstValidIndex !== -1) {
        const validMacdData = macdLineObjects.slice(firstValidIndex);
        const validSignalLine = calculateEMA(validMacdData, signalPeriod, 'close');
        for (let i = 0; i < validSignalLine.length; i++) {
            const actualIndex = i + firstValidIndex;
            signalLine[actualIndex] = validSignalLine[i];
            if (macdLine[actualIndex] !== null && signalLine[actualIndex] !== null) {
                histogram[actualIndex] = macdLine[actualIndex] - signalLine[actualIndex];
            }
        }
    }
    return { macdLine, signalLine, histogram };
}

export function calculateRSI(data, period = 14) {
    const result = new Array(data.length).fill(null);
    if (data.length <= period) return result;
    let gains = 0;
    let losses = 0;
    for (let i = 1; i <= period; i++) {
        const change = data[i].close - data[i - 1].close;
        if (change >= 0) gains += change;
        else losses -= change;
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;
    if (avgLoss === 0) result[period] = 100;
    else {
        const rs = avgGain / avgLoss;
        result[period] = 100 - (100 / (1 + rs));
    }
    for (let i = period + 1; i < data.length; i++) {
        const change = data[i].close - data[i - 1].close;
        let gain = 0, loss = 0;
        if (change > 0) gain = change;
        else loss = -change;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
        if (avgLoss === 0) result[i] = 100;
        else {
            const rs = avgGain / avgLoss;
            result[i] = 100 - (100 / (1 + rs));
        }
    }
    return result;
}

export function calculateStochRSI(rsiData, period = 14) {
    const result = new Array(rsiData.length).fill(null);
    for (let i = period - 1; i < rsiData.length; i++) {
        if (rsiData[i] === null) continue;
        let highest = -Infinity, lowest = Infinity;
        for (let j = 0; j < period; j++) {
            const val = rsiData[i - j];
            if (val === null) continue;
            if (val > highest) highest = val;
            if (val < lowest) lowest = val;
        }
        if (highest === lowest) {
            result[i] = 0;
        } else {
            result[i] = ((rsiData[i] - lowest) / (highest - lowest)) * 100;
        }
    }
    return result;
}

export function calculateATR(data, period = 14) {
    const result = new Array(data.length).fill(null);
    if (data.length <= 1) return result;
    const tr = new Array(data.length).fill(null);
    for (let i = 1; i < data.length; i++) {
        const hl = data[i].high - data[i].low;
        const hc = Math.abs(data[i].high - data[i - 1].close);
        const lc = Math.abs(data[i].low - data[i - 1].close);
        tr[i] = Math.max(hl, hc, lc);
    }
    let sum = 0;
    for (let i = 1; i <= period; i++) sum += tr[i];
    result[period] = sum / period;
    for (let i = period + 1; i < data.length; i++) {
        result[i] = (result[i - 1] * (period - 1) + tr[i]) / period;
    }
    return result;
}

export function calculateADX(data, period = 14) {
    const result = new Array(data.length).fill(null);
    if (data.length <= period * 2) return result;
    const tr = new Array(data.length).fill(0);
    const plusDM = new Array(data.length).fill(0);
    const minusDM = new Array(data.length).fill(0);

    for (let i = 1; i < data.length; i++) {
        const hl = data[i].high - data[i].low;
        const hc = Math.abs(data[i].high - data[i - 1].close);
        const lc = Math.abs(data[i].low - data[i - 1].close);
        tr[i] = Math.max(hl, hc, lc);
        const upMove = data[i].high - data[i - 1].high;
        const downMove = data[i - 1].low - data[i].low;
        if (upMove > downMove && upMove > 0) plusDM[i] = upMove;
        if (downMove > upMove && downMove > 0) minusDM[i] = downMove;
    }

    const smoothedTR = new Array(data.length).fill(0);
    const smoothedPlusDM = new Array(data.length).fill(0);
    const smoothedMinusDM = new Array(data.length).fill(0);
    const dx = new Array(data.length).fill(0);

    let sumTR = 0, sumPlusDM = 0, sumMinusDM = 0;
    for (let i = 1; i <= period; i++) {
        sumTR += tr[i]; sumPlusDM += plusDM[i]; sumMinusDM += minusDM[i];
    }
    smoothedTR[period] = sumTR; smoothedPlusDM[period] = sumPlusDM; smoothedMinusDM[period] = sumMinusDM;

    for (let i = period + 1; i < data.length; i++) {
        smoothedTR[i] = smoothedTR[i - 1] - (smoothedTR[i - 1] / period) + tr[i];
        smoothedPlusDM[i] = smoothedPlusDM[i - 1] - (smoothedPlusDM[i - 1] / period) + plusDM[i];
        smoothedMinusDM[i] = smoothedMinusDM[i - 1] - (smoothedMinusDM[i - 1] / period) + minusDM[i];
        const plusDI = (smoothedPlusDM[i] / smoothedTR[i]) * 100;
        const minusDI = (smoothedMinusDM[i] / smoothedTR[i]) * 100;
        const diDiff = Math.abs(plusDI - minusDI);
        const diSum = plusDI + minusDI;
        dx[i] = diSum === 0 ? 0 : (diDiff / diSum) * 100;
    }

    let adxSum = 0;
    for (let i = period + 1; i <= period * 2; i++) adxSum += dx[i];
    result[period * 2] = adxSum / period;

    for (let i = period * 2 + 1; i < data.length; i++) {
        result[i] = (result[i - 1] * (period - 1) + dx[i]) / period;
    }
    return result;
}

export function calculateStochastic(data, period = 14) {
    const result = new Array(data.length).fill(null);
    for (let i = period - 1; i < data.length; i++) {
        let highestHigh = -Infinity, lowestLow = Infinity;
        for (let j = 0; j < period; j++) {
            if (data[i - j].high > highestHigh) highestHigh = data[i - j].high;
            if (data[i - j].low < lowestLow) lowestLow = data[i - j].low;
        }
        const currentClose = data[i].close;
        const k = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
        result[i] = isNaN(k) ? 50 : k;
    }
    return result;
}

export function calculateWilliamsR(data, period = 14) {
    const result = new Array(data.length).fill(null);
    for (let i = period - 1; i < data.length; i++) {
        let highestHigh = -Infinity, lowestLow = Infinity;
        for (let j = 0; j < period; j++) {
            if (data[i - j].high > highestHigh) highestHigh = data[i - j].high;
            if (data[i - j].low < lowestLow) lowestLow = data[i - j].low;
        }
        const r = ((highestHigh - data[i].close) / (highestHigh - lowestLow)) * -100;
        result[i] = isNaN(r) ? -50 : r;
    }
    return result;
}

export function calculateCCI(data, period = 14) {
    const result = new Array(data.length).fill(null);
    const tp = new Array(data.length).fill(null);
    for (let i = 0; i < data.length; i++) tp[i] = (data[i].high + data[i].low + data[i].close) / 3;
    for (let i = period - 1; i < data.length; i++) {
        let sumTp = 0;
        for (let j = 0; j < period; j++) sumTp += tp[i - j];
        const smaTp = sumTp / period;
        let meanDevSum = 0;
        for (let j = 0; j < period; j++) meanDevSum += Math.abs(tp[i - j] - smaTp);
        const meanDev = meanDevSum / period;
        result[i] = meanDev === 0 ? 0 : (tp[i] - smaTp) / (0.015 * meanDev);
    }
    return result;
}

export function calculateUltimateOscillator(data) {
    const result = new Array(data.length).fill(null);
    if (data.length < 29) return result;
    const bp = new Array(data.length).fill(0);
    const tr = new Array(data.length).fill(0);
    for (let i = 1; i < data.length; i++) {
        const prevClose = data[i - 1].close;
        bp[i] = data[i].close - Math.min(data[i].low, prevClose);
        tr[i] = Math.max(data[i].high, prevClose) - Math.min(data[i].low, prevClose);
    }
    for (let i = 28; i < data.length; i++) {
        let bp7 = 0, tr7 = 0;
        for (let j = 0; j < 7; j++) { bp7 += bp[i - j]; tr7 += tr[i - j]; }
        let bp14 = 0, tr14 = 0;
        for (let j = 0; j < 14; j++) { bp14 += bp[i - j]; tr14 += tr[i - j]; }
        let bp28 = 0, tr28 = 0;
        for (let j = 0; j < 28; j++) { bp28 += bp[i - j]; tr28 += tr[i - j]; }
        const avg7 = tr7 === 0 ? 0 : bp7 / tr7;
        const avg14 = tr14 === 0 ? 0 : bp14 / tr14;
        const avg28 = tr28 === 0 ? 0 : bp28 / tr28;
        result[i] = 100 * ((4 * avg7) + (2 * avg14) + avg28) / 7;
    }
    return result;
}

export function calculateROC(data, period = 9) {
    const result = new Array(data.length).fill(null);
    for (let i = period; i < data.length; i++) {
        const prevClose = data[i - period].close;
        result[i] = prevClose !== 0 ? ((data[i].close - prevClose) / prevClose) * 100 : 0;
    }
    return result;
}

export function calculateBullBearPower(data, period = 13) {
    const ema13 = calculateEMA(data, period, 'close');
    const result = new Array(data.length).fill(null);
    for (let i = 0; i < data.length; i++) {
        if (ema13[i] !== null) {
            result[i] = (data[i].high - ema13[i]) + (data[i].low - ema13[i]);
        }
    }
    return result;
}

export function calculatePivotPoints(data) {
    if (!data || data.length < 2) return null;
    const prev = data[data.length - 2];
    const H = prev.high; const L = prev.low; const C = prev.close; const O = prev.open;

    const P = (H + L + C) / 3;
    const klasik = { name: 'Klasik', S3: P - 2*(H-L), S2: P - (H-L), S1: 2*P - H, P: P, R1: 2*P - L, R2: P + (H-L), R3: P + 2*(H-L) };
    const fib = { name: 'Fibonacci', S3: P - 1.0*(H-L), S2: P - 0.618*(H-L), S1: P - 0.382*(H-L), P: P, R1: P + 0.382*(H-L), R2: P + 0.618*(H-L), R3: P + 1.0*(H-L) };
    const cam = { name: 'Camarilla', S3: C - (H-L)*1.1/4, S2: C - (H-L)*1.1/6, S1: C - (H-L)*1.1/12, P: P, R1: C + (H-L)*1.1/12, R2: C + (H-L)*1.1/6, R3: C + (H-L)*1.1/4 };
    const wP = (H + L + 2*C) / 4;
    const woodie = { name: 'Woodie', S3: wP - 2*(H-L), S2: wP - H + L, S1: 2*wP - H, P: wP, R1: 2*wP - L, R2: wP + H - L, R3: wP + 2*(H-L) };
    let X;
    if (C < O) X = H + 2*L + C; else if (C > O) X = 2*H + L + C; else X = H + L + 2*C;
    const demark = { name: 'Demark', S3: null, S2: null, S1: X/2 - H, P: X/4, R1: X/2 - L, R2: null, R3: null };

    return [klasik, fib, cam, woodie, demark];
}

export function analyzeData(data) {
    if (!data || data.length < 200) return { signals: [], currentStatus: null, technicalSummary: null };

    const lastIndex = data.length - 1;
    const currentPrice = data[lastIndex].close;

    // --- Moving Averages ---
    const periods = [5, 10, 20, 50, 100, 200];
    const maResults = [];
    let maBuyCount = 0; let maSellCount = 0; let maNeutralCount = 0;

    periods.forEach(p => {
        const smaArr = calculateSMA(data, p);
        const emaArr = calculateEMA(data, p);
        const smaVal = smaArr[lastIndex];
        const emaVal = emaArr[lastIndex];
        const smaAction = smaVal ? (currentPrice > smaVal ? 'BUY' : 'SELL') : 'NEUTRAL';
        const emaAction = emaVal ? (currentPrice > emaVal ? 'BUY' : 'SELL') : 'NEUTRAL';
        
        if (smaAction === 'BUY') maBuyCount++; else if (smaAction === 'SELL') maSellCount++; else maNeutralCount++;
        if (emaAction === 'BUY') maBuyCount++; else if (emaAction === 'SELL') maSellCount++; else maNeutralCount++;
        
        maResults.push({ name: `MA${p}`, sma: smaVal, smaAction, ema: emaVal, emaAction });
    });

    let maSummaryText = "NÖTR"; let maSummaryColor = "#94a3b8";
    if (maBuyCount > maSellCount * 2) { maSummaryText = "GÜÇLÜ AL"; maSummaryColor = "#22c55e"; }
    else if (maBuyCount > maSellCount) { maSummaryText = "AL"; maSummaryColor = "#4ade80"; }
    else if (maSellCount > maBuyCount * 2) { maSummaryText = "GÜÇLÜ SAT"; maSummaryColor = "#ef4444"; }
    else if (maSellCount > maBuyCount) { maSummaryText = "SAT"; maSummaryColor = "#f87171"; }

    // --- Oscillators ---
    const rsi = calculateRSI(data, 14);
    const stoch = calculateStochastic(data, 14);
    const stochRSI = calculateStochRSI(rsi, 14);
    const macd = calculateMACD(data, 12, 26, 9);
    const adx = calculateADX(data, 14);
    const williams = calculateWilliamsR(data, 14);
    const cci = calculateCCI(data, 14);
    const atr = calculateATR(data, 14);
    const uo = calculateUltimateOscillator(data);
    const roc = calculateROC(data, 9);
    const bullBear = calculateBullBearPower(data, 13);

    let oscBuyCount = 0; let oscSellCount = 0; let oscNeutralCount = 0;
    const evaluateOsc = (val, buyCond, sellCond) => {
        if (val === null) { oscNeutralCount++; return 'NEUTRAL'; }
        if (buyCond) { oscBuyCount++; return 'BUY'; }
        if (sellCond) { oscSellCount++; return 'SELL'; }
        oscNeutralCount++; return 'NEUTRAL';
    };

    const rsiVal = rsi[lastIndex];
    const stochVal = stoch[lastIndex];
    const stochRsiVal = stochRSI[lastIndex];
    const macdVal = macd.macdLine[lastIndex];
    const adxVal = adx[lastIndex];
    const willVal = williams[lastIndex];
    const cciVal = cci[lastIndex];
    const atrVal = atr[lastIndex];
    const uoVal = uo[lastIndex];
    const rocVal = roc[lastIndex];
    const bbVal = bullBear[lastIndex];

    const oscResults = [
        { name: 'RSI(14)', value: rsiVal, action: evaluateOsc(rsiVal, rsiVal > 50, rsiVal < 50) },
        { name: 'STOCH(9,6)', value: stochVal, action: evaluateOsc(stochVal, stochVal > 50, stochVal < 50) },
        { name: 'STOCHRSI(14)', value: stochRsiVal, action: evaluateOsc(stochRsiVal, stochRsiVal > 50, stochRsiVal < 50) },
        { name: 'MACD(12,26)', value: macdVal, action: evaluateOsc(macdVal, macdVal > 0, macdVal < 0) },
        { name: 'ADX(14)', value: adxVal, action: evaluateOsc(adxVal, adxVal > 25, false) }, // ADX is just trend strength, usually BUY if > 25.
        { name: 'Williams %R', value: willVal, action: evaluateOsc(willVal, willVal > -50, willVal < -50) },
        { name: 'CCI(14)', value: cciVal, action: evaluateOsc(cciVal, cciVal > 0, cciVal < 0) },
        { name: 'ATR(14)', value: atrVal, action: atrVal ? 'NÖTR' : 'NÖTR' },
        { name: 'Highs/Lows(14)', value: 0, action: 'NÖTR' },
        { name: 'Ultimate Oscillator', value: uoVal, action: evaluateOsc(uoVal, uoVal > 50, uoVal < 50) },
        { name: 'ROC', value: rocVal, action: evaluateOsc(rocVal, rocVal > 0, rocVal < 0) },
        { name: 'Bull/Bear Power(13)', value: bbVal, action: evaluateOsc(bbVal, bbVal > 0, bbVal < 0) },
    ];

    let oscSummaryText = "NÖTR"; let oscSummaryColor = "#94a3b8";
    if (oscBuyCount > oscSellCount * 2) { oscSummaryText = "GÜÇLÜ AL"; oscSummaryColor = "#22c55e"; }
    else if (oscBuyCount > oscSellCount) { oscSummaryText = "AL"; oscSummaryColor = "#4ade80"; }
    else if (oscSellCount > oscBuyCount * 2) { oscSummaryText = "GÜÇLÜ SAT"; oscSummaryColor = "#ef4444"; }
    else if (oscSellCount > oscBuyCount) { oscSummaryText = "SAT"; oscSummaryColor = "#f87171"; }

    // --- Combined Score ---
    const totalBuy = maBuyCount + oscBuyCount;
    const totalSell = maSellCount + oscSellCount;
    const totalNeutral = maNeutralCount + oscNeutralCount;
    const totalCount = totalBuy + totalSell + totalNeutral;
    
    const gaugeScore = ((totalBuy - totalSell) / totalCount) * 100;
    let gaugeText = "NÖTR"; let gaugeColor = "#94a3b8";
    if (gaugeScore >= 30) { gaugeText = "GÜÇLÜ AL"; gaugeColor = "#22c55e"; }
    else if (gaugeScore > 0) { gaugeText = "AL"; gaugeColor = "#4ade80"; }
    else if (gaugeScore <= -30) { gaugeText = "GÜÇLÜ SAT"; gaugeColor = "#ef4444"; }
    else if (gaugeScore < 0) { gaugeText = "SAT"; gaugeColor = "#f87171"; }

    const pivots = calculatePivotPoints(data);

    return {
        signals: [],
        technicalSummary: {
            gaugeScore, gaugeText, gaugeColor,
            buyCount: totalBuy, sellCount: totalSell, neutralCount: totalNeutral,
            maSummaryText, maSummaryColor, maBuyCount, maSellCount, maNeutralCount,
            oscSummaryText, oscSummaryColor, oscBuyCount, oscSellCount, oscNeutralCount,
            movingAverages: maResults,
            oscillators: oscResults,
            pivots
        }
    };
}

export function generateHistoricalSignals(data, strategy = 'MACD') {
    const signals = [];
    if (!data || data.length < 50) return signals;

    if (strategy === 'MACD') {
        const macd = calculateMACD(data);
        for (let i = 1; i < data.length; i++) {
            const prevMacd = macd.macdLine[i-1];
            const prevSig = macd.signalLine[i-1];
            const currMacd = macd.macdLine[i];
            const currSig = macd.signalLine[i];
            
            if (prevMacd !== null && prevSig !== null && currMacd !== null && currSig !== null) {
                // Cross UP = Buy
                if (prevMacd <= prevSig && currMacd > currSig) {
                    signals.push({ time: data[i].time, signal: 'BUY', price: data[i].close, reason: 'MACD (Mavi) çizgisi Sinyal (Turuncu) çizgisini yukarı kesti.' });
                }
                // Cross DOWN = Sell
                else if (prevMacd >= prevSig && currMacd < currSig) {
                    signals.push({ time: data[i].time, signal: 'SELL', price: data[i].close, reason: 'MACD (Mavi) çizgisi Sinyal (Turuncu) çizgisini aşağı kesti.' });
                }
            }
        }
    } else if (strategy === 'RSI') {
        const rsi = calculateRSI(data);
        for (let i = 1; i < data.length; i++) {
            const prevRsi = rsi[i-1];
            const currRsi = rsi[i];
            if (prevRsi !== null && currRsi !== null) {
                // Cross 30 UP = Buy (was oversold, now recovering)
                if (prevRsi <= 30 && currRsi > 30) {
                    signals.push({ time: data[i].time, signal: 'BUY', price: data[i].close, reason: `RSI Aşırı Satım (30) bölgesinden yukarı çıktı. (RSI: ${currRsi.toFixed(1)})` });
                }
                // Cross 70 DOWN = Sell (was overbought, now dropping)
                else if (prevRsi >= 70 && currRsi < 70) {
                    signals.push({ time: data[i].time, signal: 'SELL', price: data[i].close, reason: `RSI Aşırı Alım (70) bölgesinden aşağı düştü. (RSI: ${currRsi.toFixed(1)})` });
                }
            }
        }
    } else if (strategy === 'SMA') {
        const sma10 = calculateSMA(data, 10);
        const sma50 = calculateSMA(data, 50);
        for (let i = 1; i < data.length; i++) {
            const prev10 = sma10[i-1];
            const prev50 = sma50[i-1];
            const curr10 = sma10[i];
            const curr50 = sma50[i];
            if (prev10 !== null && prev50 !== null && curr10 !== null && curr50 !== null) {
                if (prev10 <= prev50 && curr10 > curr50) {
                    signals.push({ time: data[i].time, signal: 'BUY', price: data[i].close, reason: `Kısa Vade (10G) Ort., Uzun Vade (50G) Ortalamayı yukarı kesti.` });
                } else if (prev10 >= prev50 && curr10 < curr50) {
                    signals.push({ time: data[i].time, signal: 'SELL', price: data[i].close, reason: `Kısa Vade (10G) Ort., Uzun Vade (50G) Ortalamayı aşağı kesti.` });
                }
            }
        }
    }

    return signals;
}
