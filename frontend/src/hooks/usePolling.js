import { useState, useEffect } from 'react';
import { getCachedData, setCachedData } from '../utils/apiCache';

/**
 * Custom hook to fetch data and optionally poll at a given interval.
 * Uses global in-memory cache for instantaneous page loads.
 * @param {string} url - API endpoint
 * @param {number} pollInterval - Polling interval in ms (0 or null to disable polling)
 * @param {function} transform - Optional function to transform data before setting state
 * @returns {object} { data, loading, error }
 */
export function usePolling(url, pollInterval = 0, transform = null) {
    const cached = getCachedData(url);
    const isNewFormatCached = cached && typeof cached === 'object' && !Array.isArray(cached) && 'status' in cached;
    const initialRaw = isNewFormatCached ? cached.data : cached;

    let initialData = null;
    if (initialRaw) {
        try {
            initialData = transform ? transform(initialRaw) : initialRaw;
        } catch (err) {
            console.warn("Transform error on cached data:", err);
            initialData = null;
        }
    }

    const [data, setData] = useState(initialData);
    const [loading, setLoading] = useState(!initialData);
    const [error, setError] = useState(null);

    useEffect(() => {
        let intervalId;
        
        const fetchData = async () => {
            try {
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                
                const json = await res.json();
                
                // Support API responses that have status: 'calculating' (like our technical screener)
                const isNewFormat = json && typeof json === 'object' && !Array.isArray(json) && 'status' in json;
                const actualData = isNewFormat ? json.data : json;

                if (isNewFormat && json.status === 'calculating') {
                    if (!data) setLoading(true);
                } else {
                    setCachedData(url, actualData);
                    let finalData = actualData;
                    if (transform) {
                        try {
                            finalData = transform(actualData);
                        } catch (transformErr) {
                            console.error("Transform error in usePolling:", transformErr);
                            finalData = Array.isArray(actualData) ? actualData : [];
                        }
                    }
                    setData(finalData);
                    setLoading(false);
                    setError(null);
                }
                // If we got the data and it's not calculating anymore, we can stop polling 
                // if we only wanted to poll UNTIL it's ready. 
                // But if pollInterval is explicitly set for background refresh, we keep it.
            } catch (err) {
                console.error("Fetch error:", err);
                setError(err.message);
                setLoading(false);
            }
        };

        fetchData();

        if (pollInterval && pollInterval > 0) {
            intervalId = setInterval(fetchData, pollInterval);
        }

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [url, pollInterval]); // Only re-run if URL or poll interval changes

    return { data, loading, error };
}
