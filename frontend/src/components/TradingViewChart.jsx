import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { createChart, ColorType, CrosshairMode, CandlestickSeries, HistogramSeries, LineSeries, AreaSeries, createSeriesMarkers } from 'lightweight-charts';
import { generateHistoricalSignals, calculateSMA, calculateMACD, calculateRSI } from '../utils/technicalAnalysis';

const BROKER_DOMAINS = {
    "Garanti": "garantibbva.com.tr",
    "Ak Yatırım": "akyatirim.com.tr",
    "İş Yatırım": "isyatirim.com.tr",
    "Yapı Kredi": "ykyatirim.com.tr",
    "Ziraat": "ziraatyatirim.com.tr",
    "Halk": "halkyatirim.com.tr",
    "Vakıf": "vakifyatirim.com.tr",
    "Gedik": "gedik.com",
    "İnfo": "infoyatirim.com",
    "Tacirler": "tacirler.com.tr",
    "Oyak": "oyakyatirim.com.tr",
    "Deniz": "denizyatirim.com",
    "TEB": "tebyatirim.com.tr",
    "HSBC": "hsbc.com.tr",
    "ICBC": "icbcyatirim.com.tr",
    "Global": "global.com.tr",
    "Şeker": "sekeryatirim.com.tr",
    "Ata": "atayatirim.com.tr",
    "Alnus": "alnusyatirim.com",
    "QNB": "qnbfi.com",
    "A1": "a1capital.com.tr",
    "İntegral": "integralmenkul.com.tr",
    "Ahlatcı": "ahlatciyatirim.com.tr",
    "Meksa": "meksayatirim.com.tr",
    "Tera": "terayatirim.com",
    "Ünlü": "unluco.com",
    "Citi": "citibank.com.tr",
    "J.P. Morgan": "jpmorgan.com",
};

function getFaviconUrl(kurumName) {
    if (!kurumName) return "https://www.google.com/s2/favicons?domain=borsaistanbul.com&sz=32";
    let domain = "borsaistanbul.com";
    for (const [key, value] of Object.entries(BROKER_DOMAINS)) {
        if (kurumName.toLowerCase().includes(key.toLowerCase())) {
            domain = value;
            break;
        }
    }
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

// ────────────────────────────── TIMEFRAME CONFIG ──────────────────────────────
const TIMEFRAMES = [
    { key: '1D', label: '1 Gün', days: 1 },
    { key: '1W', label: '1 Hafta', days: 7 },
    { key: '1M', label: '1 Ay', days: 30 },
    { key: '3M', label: '3 Ay', days: 90 },
    { key: '6M', label: '6 Ay', days: 180 },
    { key: '1Y', label: '1 Yıl', days: 365 },
    { key: '5Y', label: '5 Yıl', days: 1825 },
];

const INTERVALS = [
    { key: 'D', label: '1D' },
    { key: 'W', label: '1W' },
    { key: 'M', label: '1M' },
];

// ────────────────────────────── AGGREGATION HELPERS ──────────────────────────────
function aggregateToWeekly(dailyData) {
    if (!dailyData || dailyData.length === 0) return [];
    const weeks = [];
    let current = null;
    for (const d of dailyData) {
        const dt = new Date(d.time);
        const day = dt.getDay();
        // Start new week on Monday (or if no current)
        if (!current || day === 1) {
            if (current) weeks.push(current);
            current = { time: d.time, open: d.open, high: d.high, low: d.low, close: d.close, value: d.close, volume: d.volume };
        } else {
            current.high = Math.max(current.high, d.high);
            current.low = Math.min(current.low, d.low);
            current.close = d.close;
            current.value = d.close;
            current.volume += d.volume;
            current.time = d.time; // Use latest date as the week's date
        }
    }
    if (current) weeks.push(current);
    return weeks;
}

function aggregateToMonthly(dailyData) {
    if (!dailyData || dailyData.length === 0) return [];
    const months = [];
    let current = null;
    let currentMonth = null;
    for (const d of dailyData) {
        const ym = d.time.substring(0, 7); // "YYYY-MM"
        if (ym !== currentMonth) {
            if (current) months.push(current);
            currentMonth = ym;
            current = { time: d.time, open: d.open, high: d.high, low: d.low, close: d.close, value: d.close, volume: d.volume };
        } else {
            current.high = Math.max(current.high, d.high);
            current.low = Math.min(current.low, d.low);
            current.close = d.close;
            current.value = d.close;
            current.volume += d.volume;
            current.time = d.time;
        }
    }
    if (current) months.push(current);
    return months;
}

// ────────────────────────────── CHART COMPONENT ──────────────────────────────
export default function TradingViewChart({ data, reports, ticker, currentPrice, fillContainer = false }) {
    const containerRef = useRef();
    const chartContainerRef = useRef();
    const chartRef = useRef(null);
    const mainSeriesRef = useRef(null);
    const volumeSeriesRef = useRef(null);

    const sma20Ref = useRef(null);
    const sma50Ref = useRef(null);
    const sma200Ref = useRef(null);
    const macdLineRef = useRef(null);
    const macdSignalRef = useRef(null);
    const macdHistRef = useRef(null);
    const rsiLineRef = useRef(null);
    const markersPluginRef = useRef(null);

    const [showSMA20, setShowSMA20] = useState(false);
    const [showSMA50, setShowSMA50] = useState(false);
    const [showSMA200, setShowSMA200] = useState(false);

    const [chartType, setChartType] = useState('candle');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [activeTimeframe, setActiveTimeframe] = useState('1Y');
    const [activeInterval, setActiveInterval] = useState('D');
    const [activeSignal, setActiveSignal] = useState('');
    const [reportMarkerMode, setReportMarkerMode] = useState('pin'); // 'pin' | 'full' | 'none'
    const [chartHeightMode, setChartHeightMode] = useState(() => {
        try { return localStorage.getItem('chart_height_mode') || 'standard'; } catch { return 'standard'; }
    });
    const heightValue = chartHeightMode === 'compact' ? 340 : chartHeightMode === 'large' ? 580 : 440;

    // Measure Tool State
    const [isMeasureMode, setIsMeasureMode] = useState(false);
    const isMeasureModeRef = useRef(isMeasureMode);
    useEffect(() => { isMeasureModeRef.current = isMeasureMode; }, [isMeasureMode]);

    const [measureStart, setMeasureStart] = useState(null);
    const measureStartRef = useRef(null);
    const [measureEnd, setMeasureEnd] = useState(null);
    const measureEndRef = useRef(null);

    // Tooltip State
    const [activeTooltip, setActiveTooltip] = useState(null);
    const [hoveredBadge, setHoveredBadge] = useState(null);

    // Group reports by date
    const groupedReports = useMemo(() => {
        const groups = {};
        if (reports && reports.length > 0) {
            reports.forEach(r => {
                if (!r.tarih) return;
                if (!groups[r.tarih]) groups[r.tarih] = [];
                groups[r.tarih].push(r);
            });
        }
        return groups;
    }, [reports]);


    // Format raw daily data
    const dailyData = useMemo(() => {
        if (!data || data.length === 0) return [];
        return data.map(d => ({
            time: d.date,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
            value: d.close,
            volume: d.volume || 0,
        })).sort((a, b) => new Date(a.time) - new Date(b.time));
    }, [data]);

    // Aggregate data based on interval
    const formattedData = useMemo(() => {
        if (activeInterval === 'W') return aggregateToWeekly(dailyData);
        if (activeInterval === 'M') return aggregateToMonthly(dailyData);
        return dailyData;
    }, [dailyData, activeInterval]);

    const historicalSignals = useMemo(() => {
        if (!activeSignal || formattedData.length === 0) return [];
        return generateHistoricalSignals(formattedData, activeSignal);
    }, [formattedData, activeSignal]);

    // Group signals by date
    const groupedSignals = useMemo(() => {
        const groups = {};
        if (historicalSignals && historicalSignals.length > 0) {
            historicalSignals.forEach(s => {
                if (!groups[s.time]) groups[s.time] = [];
                groups[s.time].push(s);
            });
        }
        return groups;
    }, [historicalSignals]);

    // O(1) lookup map for crosshair/click performance
    const dataMap = useMemo(() => {
        const map = new Map();
        formattedData.forEach((d, i) => map.set(d.time, { data: d, index: i }));
        return map;
    }, [formattedData]);

    // Calculate SMAs and TA on the current interval data
    const { sma20Data, sma50Data, sma200Data, macdLineData, macdSignalData, macdHistData, rsiData } = useMemo(() => {
        if (formattedData.length === 0) return { sma20Data: [], sma50Data: [], sma200Data: [], macdLineData: [], macdSignalData: [], macdHistData: [], rsiData: [] };

        const sma20 = calculateSMA(formattedData, 20).map((val, i) => ({ time: formattedData[i].time, value: val })).filter(d => d.value !== null);
        const sma50 = calculateSMA(formattedData, 50).map((val, i) => ({ time: formattedData[i].time, value: val })).filter(d => d.value !== null);
        const sma200 = calculateSMA(formattedData, 200).map((val, i) => ({ time: formattedData[i].time, value: val })).filter(d => d.value !== null);

        // MACD
        const macdResult = calculateMACD(formattedData);
        const macdLine = [];
        const macdSig = [];
        const macdHist = [];
        if (macdResult && macdResult.macdLine) {
            macdResult.macdLine.forEach((val, i) => {
                if (val !== null) macdLine.push({ time: formattedData[i].time, value: val });
            });
            macdResult.signalLine.forEach((val, i) => {
                if (val !== null) macdSig.push({ time: formattedData[i].time, value: val });
            });
            macdResult.histogram.forEach((val, i) => {
                if (val !== null) macdHist.push({ time: formattedData[i].time, value: val, color: val >= 0 ? 'rgba(38, 166, 154, 0.8)' : 'rgba(239, 83, 80, 0.8)' });
            });
        }

        // RSI
        const rsiResult = calculateRSI(formattedData);
        const rsiArr = [];
        if (rsiResult) {
            rsiResult.forEach((val, i) => {
                if (val !== null) rsiArr.push({ time: formattedData[i].time, value: val });
            });
        }

        return { sma20Data: sma20, sma50Data: sma50, sma200Data: sma200, macdLineData: macdLine, macdSignalData: macdSig, macdHistData: macdHist, rsiData: rsiArr };
    }, [formattedData]);

    const tooltipDataRef = useRef({ groupedReports, groupedSignals, dataMap });
    useEffect(() => {
        tooltipDataRef.current = { groupedReports, groupedSignals, dataMap };
    }, [groupedReports, groupedSignals, dataMap]);



    // ────────────────────────────── TIMEFRAME LOGIC ──────────────────────────────
    const applyTimeframe = useCallback((tf, chartInstance, dataArray) => {
        if (!chartInstance || !dataArray || dataArray.length === 0) return;
        if (tf === 'MAX') { chartInstance.timeScale().fitContent(); return; }

        const lastDate = new Date(dataArray[dataArray.length - 1].time);
        const tfConfig = TIMEFRAMES.find(t => t.key === tf);
        if (!tfConfig) { chartInstance.timeScale().fitContent(); return; }

        const fromDate = new Date(lastDate);
        fromDate.setDate(fromDate.getDate() - tfConfig.days);

        const fromStr = fromDate.toISOString().split('T')[0];
        const toStr = lastDate.toISOString().split('T')[0];

        // Find actual data boundaries
        const firstDataDate = dataArray[0].time;
        const actualFrom = fromStr < firstDataDate ? firstDataDate : fromStr;

        chartInstance.timeScale().setVisibleRange({ from: actualFrom, to: toStr });
    }, []);

    const handleTimeframeChange = useCallback((tf) => {
        setActiveTimeframe(tf);
        if (chartRef.current) applyTimeframe(tf, chartRef.current, formattedData);
    }, [formattedData, applyTimeframe]);

    // ────────────────────────────── PERFORMANCE BADGES ──────────────────────────────
    const performanceBadges = useMemo(() => {
        if (dailyData.length < 2) return [];
        // Use live price if available and valid, otherwise fallback to last chart data close
        const lastPrice = currentPrice || dailyData[dailyData.length - 1].close;
        const now = new Date(); // Use actual current calendar date, just like Investing.com

        return TIMEFRAMES.map(tf => {
            // For 1D (1 Gün), compare current price to the previous trading day's close.
            // If the last entry in dailyData is today's live price, then yesterday's price is at length - 2.
            // If not, it's at length - 1. We check if the last entry's date is today's date.
            if (tf.key === '1D') {
                const todayStr = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
                let yesterdayPrice = dailyData[dailyData.length - 1].close;
                let yesterdayDate = dailyData[dailyData.length - 1].time;
                if (dailyData[dailyData.length - 1].time === todayStr || (currentPrice && dailyData[dailyData.length - 1].close === currentPrice)) {
                    yesterdayPrice = dailyData.length > 1 ? dailyData[dailyData.length - 2].close : dailyData[0].close;
                    yesterdayDate = dailyData.length > 1 ? dailyData[dailyData.length - 2].time : dailyData[0].time;
                }
                return { ...tf, change: yesterdayPrice ? ((lastPrice - yesterdayPrice) / yesterdayPrice) * 100 : null, startPrice: yesterdayPrice, priceDate: yesterdayDate };
            }

            // For other timeframes, go back exactly calendar months/years.
            // We must prevent JS month overflow (e.g. Aug 31 - 6 months = March 3, we want Feb 28)
            const targetDate = new Date(now);
            if (['1M', '3M', '6M', '1Y', '5Y'].includes(tf.key)) {
                const monthsToSub = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12, '5Y': 60 }[tf.key];
                const expectedDate = targetDate.getDate();
                targetDate.setMonth(targetDate.getMonth() - monthsToSub);
                // If the month overflowed into the next month because the target month doesn't have enough days
                if (targetDate.getDate() !== expectedDate) {
                    targetDate.setDate(0); // Go to last day of the previous month
                }
            } else {
                targetDate.setDate(targetDate.getDate() - tf.days); // for 1W (7 days)
            }

            // Convert to local YYYY-MM-DD
            const targetStr = new Date(targetDate.getTime() - (targetDate.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

            // Find the closest past trading day BEFORE or ON targetStr
            let startPrice = null;
            let priceDate = null;
            for (let i = dailyData.length - 1; i >= 0; i--) {
                if (dailyData[i].time <= targetStr) {
                    startPrice = dailyData[i].close;
                    priceDate = dailyData[i].time;
                    break;
                }
            }

            // If we couldn't find a price before the target date (e.g. IPO was later), use the first available price
            if (!startPrice && dailyData.length > 0) {
                startPrice = dailyData[0].close;
                priceDate = dailyData[0].time;
            }

            if (!startPrice) return { ...tf, change: null };
            const change = ((lastPrice - startPrice) / startPrice) * 100;
            return { ...tf, change, startPrice, priceDate };
        });
    }, [dailyData, currentPrice]);

    // ────────────────────────────── MAIN CHART EFFECT ──────────────────────────────
    useEffect(() => {
        if (formattedData.length === 0 || !chartContainerRef.current) return;

        const handleResize = () => {
            if (chartRef.current && chartContainerRef.current) {
                chartRef.current.applyOptions({
                    width: chartContainerRef.current.clientWidth,
                    height: chartContainerRef.current.clientHeight
                });
            }
        };

        const chart = createChart(chartContainerRef.current, {
            layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#d1d4dc' },
            grid: { vertLines: { color: 'rgba(42, 46, 57, 0.2)' }, horzLines: { color: 'rgba(42, 46, 57, 0.2)' } },
            crosshair: { mode: CrosshairMode.Normal },
            rightPriceScale: { borderColor: 'rgba(197, 203, 206, 0.8)' },
            timeScale: { borderColor: 'rgba(197, 203, 206, 0.8)', timeVisible: false },
            watermark: { color: 'rgba(38, 166, 154, 0.08)', visible: !!ticker, text: ticker || '', fontSize: 120, horzAlign: 'center', vertAlign: 'center' },
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight || (isFullscreen ? window.innerHeight - 80 : 400),
        });
        chartRef.current = chart;

        // Create Main Series
        let mainSeries;
        if (chartType === 'candle') {
            mainSeries = chart.addSeries(CandlestickSeries, {
                upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350',
            });
        } else {
            mainSeries = chart.addSeries(AreaSeries, {
                lineColor: '#2962ff',
                topColor: 'rgba(41, 98, 255, 0.28)',
                bottomColor: 'rgba(41, 98, 255, 0.0)',
                lineWidth: 2
            });
        }
        mainSeries.setData(formattedData);
        mainSeriesRef.current = mainSeries;

        // SMAs
        const sma20 = chart.addSeries(LineSeries, { color: '#ffc107', lineWidth: 1.5, title: 'SMA 20', visible: showSMA20, crosshairMarkerVisible: false });
        sma20.setData(sma20Data);
        sma20Ref.current = sma20;

        const sma50 = chart.addSeries(LineSeries, { color: '#00e5ff', lineWidth: 1.5, title: 'SMA 50', visible: showSMA50, crosshairMarkerVisible: false });
        sma50.setData(sma50Data);
        sma50Ref.current = sma50;

        const sma200 = chart.addSeries(LineSeries, { color: '#ef5350', lineWidth: 2, title: 'SMA 200', visible: showSMA200, crosshairMarkerVisible: false });
        sma200.setData(sma200Data);
        sma200Ref.current = sma200;

        // Volume
        const volumeSeries = chart.addSeries(HistogramSeries, { color: '#26a69a', priceFormat: { type: 'volume' }, priceScaleId: '' });
        volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
        volumeSeries.setData(formattedData.map(d => ({ time: d.time, value: d.volume, color: d.close >= d.open ? 'rgba(38, 166, 154, 0.3)' : 'rgba(239, 83, 80, 0.3)' })));
        volumeSeriesRef.current = volumeSeries;

        // Technical Analysis Sub-panes (MACD, RSI)
        const macdLineSeries = chart.addSeries(LineSeries, { color: '#2962FF', lineWidth: 2, priceScaleId: 'ta', visible: false, crosshairMarkerVisible: false });
        const macdSignalSeries = chart.addSeries(LineSeries, { color: '#FF6D00', lineWidth: 2, priceScaleId: 'ta', visible: false, crosshairMarkerVisible: false });
        const macdHistSeries = chart.addSeries(HistogramSeries, { priceScaleId: 'ta', visible: false });

        const rsiLineSeries = chart.addSeries(LineSeries, { color: '#9C27B0', lineWidth: 2, priceScaleId: 'ta', visible: false, crosshairMarkerVisible: false });

        chart.priceScale('ta').applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
        });
        chart.priceScale('right').applyOptions({
            scaleMargins: { top: 0.05, bottom: 0.25 },
        });

        macdLineSeries.setData(macdLineData);
        macdSignalSeries.setData(macdSignalData);
        macdHistSeries.setData(macdHistData);
        rsiLineSeries.setData(rsiData);

        macdLineRef.current = macdLineSeries;
        macdSignalRef.current = macdSignalSeries;
        macdHistRef.current = macdHistSeries;
        rsiLineRef.current = rsiLineSeries;

        // Measure Tool Handlers
        const updateMeasureCoords = () => {
            if (measureStartRef.current && mainSeriesRef.current) {
                const x = chart.timeScale().timeToCoordinate(measureStartRef.current.time);
                const y = mainSeriesRef.current.priceToCoordinate(measureStartRef.current.price);
                if (x !== null && y !== null) {
                    setMeasureStart(prev => ({ ...prev, x, y }));
                }
            }
            if (measureEndRef.current && mainSeriesRef.current) {
                const x = chart.timeScale().timeToCoordinate(measureEndRef.current.time);
                const y = mainSeriesRef.current.priceToCoordinate(measureEndRef.current.price);
                if (x !== null && y !== null) {
                    setMeasureEnd(prev => ({ ...prev, x, y }));
                }
            }
        };

        chart.subscribeClick((param) => {
            if (!isMeasureModeRef.current) return;
            if (!param.point || !param.time || !mainSeriesRef.current) return;

            const { dataMap } = tooltipDataRef.current;
            const entry = dataMap.get(param.time);
            const dataPoint = entry ? entry.data : null;
            const dataIndex = entry ? entry.index : -1;

            const price = dataPoint ? dataPoint.close : mainSeriesRef.current.coordinateToPrice(param.point.y);
            const exactX = chart.timeScale().timeToCoordinate(param.time) || param.point.x;
            const exactY = mainSeriesRef.current.priceToCoordinate(price) || param.point.y;

            if (!measureStartRef.current) {
                measureStartRef.current = { time: param.time, price, x: exactX, y: exactY, index: dataIndex };
                setMeasureStart(measureStartRef.current);
                setMeasureEnd(null);
            } else if (!measureEndRef.current) {
                measureEndRef.current = { time: param.time, price, x: exactX, y: exactY, index: dataIndex };
                setMeasureEnd(measureEndRef.current);
                setIsMeasureMode(false);
            } else {
                measureStartRef.current = { time: param.time, price, x: exactX, y: exactY, index: dataIndex };
                setMeasureStart(measureStartRef.current);
                measureEndRef.current = null;
                setMeasureEnd(null);
            }
        });

        chart.subscribeCrosshairMove((param) => {
            if (!param.time) {
                setActiveTooltip(null);
                return;
            }

            const { groupedReports, groupedSignals, dataMap } = tooltipDataRef.current;
            const exactX = chart.timeScale().timeToCoordinate(param.time) || (param.point ? param.point.x : 0);
            const exactY = param.point ? param.point.y : 50;

            const entry = dataMap.get(param.time);
            const dataPoint = entry ? entry.data : null;
            const dataIndex = entry ? entry.index : -1;

            // Always show the tooltip with price info, even if there are no reports
            setActiveTooltip({
                x: exactX,
                y: exactY,
                date: param.time,
                dataPoint: dataPoint,
                reports: groupedReports[param.time] || [],
                signals: groupedSignals[param.time] || []
            });

            if (!isMeasureModeRef.current || !measureStartRef.current || measureEndRef.current || !mainSeriesRef.current) return;
            if (!param.point) return;

            const price = dataPoint ? dataPoint.close : mainSeriesRef.current.coordinateToPrice(param.point.y);
            const measureY = mainSeriesRef.current.priceToCoordinate(price) || param.point.y;

            setMeasureEnd({ time: param.time, price, x: exactX, y: measureY, index: dataIndex });
        });

        chart.timeScale().subscribeVisibleTimeRangeChange(updateMeasureCoords);

        // Apply Timeframe
        applyTimeframe(activeTimeframe, chart, formattedData);
        window.addEventListener('resize', handleResize);

        const resizeObserver = new ResizeObserver((entries) => {
            if (!entries || entries.length === 0) return;
            const entry = entries[0];
            const width = Math.floor(entry.contentRect.width);
            const height = Math.floor(entry.contentRect.height);
            if (width > 0 && chartRef.current) {
                chartRef.current.applyOptions({
                    width,
                    height: height > 0 ? height : undefined
                });
            }
        });
        if (chartContainerRef.current) {
            resizeObserver.observe(chartContainerRef.current);
        }

        return () => {
            window.removeEventListener('resize', handleResize);
            resizeObserver.disconnect();
            chart.remove();
            chartRef.current = null;
            mainSeriesRef.current = null;
            markersPluginRef.current = null;
        };
    }, [formattedData, reports, ticker, chartType, isFullscreen, activeInterval]);

    useEffect(() => { if (sma20Ref.current) sma20Ref.current.applyOptions({ visible: showSMA20 }); }, [showSMA20]);
    useEffect(() => { if (sma50Ref.current) sma50Ref.current.applyOptions({ visible: showSMA50 }); }, [showSMA50]);
    useEffect(() => { if (sma200Ref.current) sma200Ref.current.applyOptions({ visible: showSMA200 }); }, [showSMA200]);

    // Dynamically adjust height when chartHeightMode or isFullscreen changes
    useEffect(() => {
        if (chartRef.current && chartContainerRef.current) {
            chartRef.current.applyOptions({
                height: isFullscreen ? (window.innerHeight - 80) : heightValue
            });
        }
    }, [chartHeightMode, isFullscreen, heightValue]);

    // Toggle TA visibility based on activeSignal
    useEffect(() => {
        if (!macdLineRef.current || !chartRef.current) return;
        const isMacd = activeSignal === 'MACD';
        const isRsi = activeSignal === 'RSI';

        macdLineRef.current.applyOptions({ visible: isMacd });
        macdSignalRef.current.applyOptions({ visible: isMacd });
        macdHistRef.current.applyOptions({ visible: isMacd });
        rsiLineRef.current.applyOptions({ visible: isRsi });

        chartRef.current.priceScale('right').applyOptions({
            scaleMargins: { top: 0.05, bottom: (isMacd || isRsi) ? 0.25 : 0.05 },
        });

        // Hide volume when TA is visible to prevent overlap
        if (volumeSeriesRef.current) {
            volumeSeriesRef.current.applyOptions({ visible: !(isMacd || isRsi) });
        }
    }, [activeSignal]);

    // Handle TA and Markers
    useEffect(() => {
        if (!mainSeriesRef.current || formattedData.length === 0) return;

        const markersMap = new Map();

        // Report Markers
        if (reports && reports.length > 0 && reportMarkerMode !== 'none') {
            Object.keys(groupedReports).forEach(date => {
                const dayReports = groupedReports[date];
                if (!dataMap.has(date)) return;
                let text = '';
                if (reportMarkerMode === 'full') {
                    text = dayReports.length === 1 ? dayReports[0].kurum : `${dayReports.length} Rapor`;
                } else {
                    // In compact 'pin' mode, use clean pin without long company names blocking candlesticks
                    text = dayReports.length > 1 ? `${dayReports.length}` : '';
                }
                markersMap.set(date, { time: date, position: 'aboveBar', color: '#38bdf8', shape: 'arrowDown', text, size: 1 });
            });
        }

        // Technical Analysis Historical Signals
        if (historicalSignals && historicalSignals.length > 0) {
            historicalSignals.forEach(sig => {
                const existing = markersMap.get(sig.time);
                const text = sig.signal === 'BUY' ? 'AL' : 'SAT';
                const position = sig.signal === 'BUY' ? 'belowBar' : 'aboveBar';
                const color = sig.signal === 'BUY' ? '#00e676' : '#ff5252';
                const shape = sig.signal === 'BUY' ? 'arrowUp' : 'arrowDown';

                if (existing) {
                    existing.text = `${text} | ${existing.text}`;
                    existing.color = color;
                    existing.shape = shape;
                    existing.position = position;
                } else {
                    markersMap.set(sig.time, { time: sig.time, position, color, shape, text, size: 1 });
                }
            });
        }

        const currentMarkers = Array.from(markersMap.values());
        currentMarkers.sort((a, b) => {
            if (a.time < b.time) return -1;
            if (a.time > b.time) return 1;
            return 0;
        });

        try {
            if (!markersPluginRef.current) {
                markersPluginRef.current = createSeriesMarkers(mainSeriesRef.current, currentMarkers);
            } else {
                markersPluginRef.current.setMarkers(currentMarkers);
            }
        } catch (e) {
            console.error("Error setting markers:", e);
        }

    }, [formattedData, reports, groupedReports, dataMap, chartType, historicalSignals, reportMarkerMode]);

    // ────────────────────────────── TOOLTIP OVERLAY ──────────────────────────────
    const renderTooltipOverlay = () => {
        if (!activeTooltip) return null;

        const { date, dataPoint, reports, signals } = activeTooltip;
        const chartWidth = chartContainerRef.current ? chartContainerRef.current.clientWidth : 800;
        const tooltipWidth = 160; // Approx max width

        let leftPos = activeTooltip.x + 15;
        if (leftPos + tooltipWidth > chartWidth) {
            leftPos = activeTooltip.x - tooltipWidth - 15;
        }

        return (
            <div style={{
                position: 'absolute',
                left: leftPos,
                top: Math.max(10, activeTooltip.y - 100),
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                padding: '10px',
                zIndex: 200,
                color: '#fff',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                backdropFilter: 'blur(4px)',
                pointerEvents: 'none',
                minWidth: '150px'
            }}>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px', borderBottom: '1px solid #333', paddingBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{date}</span>
                    {dataPoint && (
                        <span style={{ color: dataPoint.close >= dataPoint.open ? '#22c55e' : '#ef4444', fontWeight: 'bold' }}>
                            {dataPoint.close.toFixed(2)} TRY
                        </span>
                    )}
                </div>

                {dataPoint && (
                    <div style={{ fontSize: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginBottom: reports.length > 0 ? '8px' : '0' }}>
                        <div><span style={{ color: '#888' }}>Açılış:</span> {dataPoint.open.toFixed(2)}</div>
                        <div><span style={{ color: '#888' }}>Kapanış:</span> {dataPoint.close.toFixed(2)}</div>
                        <div><span style={{ color: '#888' }}>Yüksek:</span> {dataPoint.high.toFixed(2)}</div>
                        <div><span style={{ color: '#888' }}>Düşük:</span> {dataPoint.low.toFixed(2)}</div>
                    </div>
                )}

                {reports && reports.length > 0 && (
                    <>
                        <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px', borderTop: '1px solid #333', paddingTop: '6px' }}>Kurum Raporları</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {reports.map((r, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', gap: '20px' }}>
                                    <span style={{ fontWeight: 'bold', color: 'var(--text-highlight)' }}>{r.kurum}</span>
                                    <span style={{ color: '#fff', fontWeight: 'bold' }}>{r.hedefFiyat}</span>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {signals && signals.length > 0 && (
                    <>
                        <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px', borderTop: '1px solid #333', paddingTop: '6px' }}>Teknik Sinyaller</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {signals.map((s, i) => (
                                <div key={i} style={{ display: 'flex', flexDirection: 'column', fontSize: '11px', gap: '2px' }}>
                                    <span style={{ fontWeight: 'bold', color: s.signal === 'BUY' ? '#00e676' : '#ff5252' }}>
                                        {s.signal === 'BUY' ? 'AL' : 'SAT'} SİNYALİ
                                    </span>
                                    <span style={{ color: '#ccc', fontSize: '10px', whiteSpace: 'normal', lineHeight: '1.2' }}>{s.reason}</span>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        );
    };

    // ────────────────────────────── MEASURE OVERLAY ──────────────────────────────
    const renderMeasureOverlay = () => {
        if (!measureStart || !measureEnd || typeof measureStart.x !== 'number' || typeof measureEnd.x !== 'number') return null;

        const left = Math.min(measureStart.x, measureEnd.x);
        const top = Math.min(measureStart.y, measureEnd.y);
        const width = Math.abs(measureEnd.x - measureStart.x);
        const height = Math.abs(measureEnd.y - measureStart.y);

        const priceDiff = measureEnd.price - measureStart.price;
        const pctDiff = (priceDiff / measureStart.price) * 100;
        const barDiff = Math.abs((measureEnd.index || 0) - (measureStart.index || 0));
        const isUp = priceDiff >= 0;

        return (
            <div style={{
                position: 'absolute', left, top, width, height,
                backgroundColor: isUp ? 'rgba(38, 166, 154, 0.2)' : 'rgba(239, 83, 80, 0.2)',
                border: `1px solid ${isUp ? '#26a69a' : '#ef5350'}`,
                pointerEvents: 'none', zIndex: 100,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
                <div style={{
                    backgroundColor: isUp ? '#26a69a' : '#ef5350',
                    color: '#fff', padding: '4px 8px', borderRadius: '4px',
                    fontSize: '12px', fontWeight: 'bold',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.5)', whiteSpace: 'nowrap'
                }}>
                    {isUp ? '+' : ''}{pctDiff.toFixed(2)}% ({priceDiff.toFixed(2)} TRY)
                    <span style={{ fontSize: '10px', marginLeft: '6px', opacity: 0.8 }}>{barDiff} bars</span>
                </div>
            </div>
        );
    };

    const clearMeasure = () => {
        setMeasureStart(null); setMeasureEnd(null);
        measureStartRef.current = null; measureEndRef.current = null;
        setIsMeasureMode(false);
    };

    // ────────────────────────────── RENDER ──────────────────────────────
    return (
        <div ref={containerRef} style={{
            position: 'relative', background: isFullscreen ? '#0a0e17' : 'transparent', padding: isFullscreen ? '20px' : '0',
            width: '100%', height: isFullscreen ? '100vh' : (fillContainer ? '100%' : 'auto'), flex: fillContainer ? 1 : 'none', display: 'flex', flexDirection: 'column', minHeight: 0
        }}>
            {/* ─── TOP BAR: Interval | Chart Type | Measure | SMAs | Fullscreen ─── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {/* Interval Selector (D / W / M) */}
                    <div style={{ display: 'flex', background: 'rgba(0,0,0,0.4)', borderRadius: '6px', overflow: 'hidden', border: '1px solid #333' }}>
                        {INTERVALS.map(iv => (
                            <button key={iv.key} onClick={() => setActiveInterval(iv.key)} style={{
                                background: activeInterval === iv.key ? 'var(--color-cyan)' : 'transparent',
                                color: activeInterval === iv.key ? '#000' : '#aaa',
                                border: 'none', padding: '4px 10px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s'
                            }}>{iv.label}</button>
                        ))}
                    </div>

                    {/* Chart Type Toggle */}
                    <div style={{ display: 'flex', background: 'rgba(0,0,0,0.4)', borderRadius: '6px', overflow: 'hidden', border: '1px solid #333' }}>
                        <button onClick={() => setChartType('candle')} style={{
                            background: chartType === 'candle' ? '#555' : 'transparent',
                            color: chartType === 'candle' ? '#fff' : '#aaa',
                            border: 'none', padding: '4px 10px', fontSize: '11px', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '4px', fontWeight: chartType === 'candle' ? 'bold' : 'normal'
                        }}>
                            Mum
                        </button>
                        <button onClick={() => setChartType('line')} style={{
                            background: chartType === 'line' ? '#555' : 'transparent',
                            color: chartType === 'line' ? '#fff' : '#aaa',
                            border: 'none', padding: '4px 10px', fontSize: '11px', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '4px', fontWeight: chartType === 'line' ? 'bold' : 'normal'
                        }}>
                            Çizgi
                        </button>
                    </div>

                    {/* Technical Signals Dropdown */}
                    <div style={{ position: 'relative' }}>
                        <select
                            value={activeSignal}
                            onChange={(e) => setActiveSignal(e.target.value)}
                            style={{
                                background: 'rgba(0,0,0,0.4)',
                                color: activeSignal ? '#00e5ff' : '#aaa',
                                border: `1px solid ${activeSignal ? '#00e5ff' : '#333'}`,
                                borderRadius: '6px', padding: '4px 8px', fontSize: '11px',
                                outline: 'none', cursor: 'pointer', fontWeight: 'bold'
                            }}
                        >
                            <option value="">Sinyal Yok</option>
                            <option value="MACD">MACD Kesişimi</option>
                            <option value="RSI">RSI Alım/Satım</option>
                            <option value="SMA">SMA 10/50 Kesişimi</option>
                        </select>
                    </div>

                    {/* Measure */}
                    <button
                        onClick={() => {
                            if (isMeasureMode) { clearMeasure(); }
                            else { setIsMeasureMode(true); setMeasureStart(null); setMeasureEnd(null); measureStartRef.current = null; measureEndRef.current = null; }
                        }}
                        style={{
                            background: isMeasureMode ? 'var(--color-neutral)' : 'rgba(0,0,0,0.4)',
                            color: isMeasureMode ? '#fff' : '#aaa',
                            border: `1px solid ${isMeasureMode ? 'var(--color-neutral)' : '#333'}`,
                            padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '4px'
                        }}
                    >
                        Ölçüm
                    </button>
                    {measureStart && !isMeasureMode && (
                        <button onClick={clearMeasure} style={{ background: 'transparent', border: '1px solid #444', color: '#ff4444', cursor: 'pointer', fontSize: '11px', padding: '4px 8px', borderRadius: '4px' }}>✕</button>
                    )}

                    {/* Report Marker Mode Toggle */}
                    <button
                        onClick={() => {
                            setReportMarkerMode(prev => prev === 'pin' ? 'full' : prev === 'full' ? 'none' : 'pin');
                        }}
                        title="Grafik üzerindeki kurum rapor imlerini değiştir (Nokta / Etiket / Gizle)"
                        style={{
                            background: reportMarkerMode !== 'none' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(0,0,0,0.4)',
                            color: reportMarkerMode !== 'none' ? '#38bdf8' : '#777',
                            border: `1px solid ${reportMarkerMode !== 'none' ? 'rgba(56, 189, 248, 0.4)' : '#333'}`,
                            padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        Raporlar: {reportMarkerMode === 'pin' ? 'Nokta' : reportMarkerMode === 'full' ? 'Etiket' : 'Gizli'}
                    </button>
                </div>

                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {/* Chart Height Mode Toggle (only when not filling container) */}
                    {!fillContainer && (
                        <button
                            onClick={() => {
                                const next = chartHeightMode === 'standard' ? 'compact' : chartHeightMode === 'compact' ? 'large' : 'standard';
                                setChartHeightMode(next);
                                try { localStorage.setItem('chart_height_mode', next); } catch { }
                            }}
                            title="Grafik dikey yüksekliğini ayarla (Kompakt: 340px, Standart: 440px, Geniş: 580px)"
                            style={{
                                background: 'rgba(0,0,0,0.4)',
                                color: '#fff',
                                border: '1px solid #444',
                                borderRadius: '6px',
                                padding: '4px 8px',
                                fontSize: '11px',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                                whiteSpace: 'nowrap'
                            }}
                        >
                            Boyut: {chartHeightMode === 'compact' ? '340px' : chartHeightMode === 'large' ? '580px' : '440px'}
                        </button>
                    )}

                    <button onClick={() => setShowSMA20(!showSMA20)} style={getToggleStyle(showSMA20, '#ffc107')}>SMA 20</button>
                    <button onClick={() => setShowSMA50(!showSMA50)} style={getToggleStyle(showSMA50, '#00e5ff')}>SMA 50</button>
                    <button onClick={() => setShowSMA200(!showSMA200)} style={getToggleStyle(showSMA200, '#ef5350')}>SMA 200</button>
                    <button onClick={() => {
                        if (!document.fullscreenElement) {
                            containerRef.current.requestFullscreen && containerRef.current.requestFullscreen();
                            setIsFullscreen(true);
                        } else {
                            document.exitFullscreen && document.exitFullscreen();
                            setIsFullscreen(false);
                        }
                    }} style={{ background: 'transparent', border: '1px solid #444', color: '#fff', borderRadius: '4px', cursor: 'pointer', padding: '4px 8px', fontSize: '11px' }}>{isFullscreen ? '⊖' : '⊕'}</button>
                </div>
            </div>

            {/* ─── CHART AREA ─── */}
            <div style={{
                position: 'relative',
                width: '100%',
                height: isFullscreen ? 'calc(100vh - 120px)' : (fillContainer ? '100%' : `${heightValue}px`),
                flex: fillContainer ? 1 : 'none',
                minHeight: 0
            }}>
                <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />
                {renderMeasureOverlay()}
                {renderTooltipOverlay()}
            </div>

            {/* ─── BOTTOM BAR: Timeframe Performance Badges (Investing.com style) ─── */}
            <div style={{
                display: 'flex', gap: '0', marginTop: '6px',
                borderRadius: '6px',
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(0,0,0,0.3)',
                width: '100%',
                minWidth: 0,
                overflow: 'hidden'
            }}>
                {performanceBadges.map((tf, idx) => {
                    const isActive = activeTimeframe === tf.key;
                    const isPositive = tf.change !== null && tf.change >= 0;
                    const changeColor = tf.change === null ? '#555' : isPositive ? '#22c55e' : '#ef4444';
                    const changeStr = tf.change !== null ? `${isPositive ? '+' : ''}${tf.change.toFixed(1)}%` : '-';

                    return (
                        <div key={tf.key} style={{ flex: 1, minWidth: 0, position: 'relative' }}
                            onMouseEnter={() => setHoveredBadge(tf.key)}
                            onMouseLeave={() => setHoveredBadge(null)}>
                            {hoveredBadge === tf.key && tf.priceDate && (
                                <div style={{
                                    position: 'absolute',
                                    bottom: '100%',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    marginBottom: '8px',
                                    padding: '6px 10px',
                                    background: '#1e222d',
                                    border: '1px solid #434651',
                                    borderRadius: '4px',
                                    color: '#d1d4dc',
                                    fontSize: '11px',
                                    whiteSpace: 'nowrap',
                                    zIndex: 50,
                                    boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                                    pointerEvents: 'none'
                                }}>
                                    <div style={{ color: '#888', marginBottom: '2px' }}>Başlangıç Değeri</div>
                                    <div><span style={{ color: '#888' }}>Tarih:</span> {tf.priceDate}</div>
                                    <div><span style={{ color: '#888' }}>Fiyat:</span> <span style={{ color: '#fff' }}>{tf.startPrice?.toFixed(2)} TRY</span></div>
                                    {/* Little triangle arrow */}
                                    <div style={{
                                        position: 'absolute',
                                        bottom: '-5px',
                                        left: '50%',
                                        transform: 'translateX(-50%)',
                                        borderWidth: '5px 5px 0',
                                        borderStyle: 'solid',
                                        borderColor: '#434651 transparent transparent transparent',
                                    }}></div>
                                </div>
                            )}
                            <button
                                onClick={() => handleTimeframeChange(tf.key)}
                                style={{
                                    width: '100%',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                    padding: '5px 2px',
                                    background: isActive ? 'rgba(41, 98, 255, 0.15)' : 'transparent',
                                    border: 'none',
                                    borderRight: idx < performanceBadges.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                                    borderTopLeftRadius: idx === 0 ? '6px' : '0',
                                    borderBottomLeftRadius: idx === 0 ? '6px' : '0',
                                    borderTopRightRadius: idx === performanceBadges.length - 1 ? '6px' : '0',
                                    borderBottomRightRadius: idx === performanceBadges.length - 1 ? '6px' : '0',
                                    cursor: 'pointer',
                                    transition: 'background 0.2s',
                                    borderBottom: isActive ? '2px solid #2962ff' : '2px solid transparent',
                                }}
                                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                            >
                                <span style={{ fontSize: '10px', fontWeight: 'bold', color: isActive ? '#fff' : '#888', marginBottom: '1px', whiteSpace: 'nowrap' }}>{tf.label}</span>
                                <span style={{ fontSize: '10.5px', fontWeight: 'bold', color: changeColor, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{changeStr}</span>
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function getToggleStyle(isActive, color) {
    return {
        background: isActive ? `${color}33` : 'rgba(0,0,0,0.5)',
        border: `1px solid ${isActive ? color : '#444'}`,
        color: isActive ? color : '#888', padding: '4px 8px', borderRadius: '4px',
        fontSize: '11px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s'
    };
}
