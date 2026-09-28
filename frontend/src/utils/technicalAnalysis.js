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
