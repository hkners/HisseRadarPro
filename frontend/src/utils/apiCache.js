// Global in-memory cache for ultra-fast instant page switching without loading flickers

const cache = new Map();
const listeners = new Map();

export function normalizeKey(url) {
  if (!url) return '';
  try {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const parsed = new URL(url);
      return parsed.pathname + parsed.search;
    }
    return url;
  } catch (_) {
    return url;
  }
}

/**
 * Get data from memory cache if available
 */
export function getCachedData(url) {
  const key = normalizeKey(url);
  const entry = cache.get(key);
  if (!entry) return null;
  return entry.data;
}

/**
 * Set data in memory cache with timestamp
 */
export function setCachedData(url, data) {
  const key = normalizeKey(url);
  cache.set(key, { timestamp: Date.now(), data });
}

/**
 * Fetch with memory cache (Stale-While-Revalidate)
 * Returns cached data immediately if available, then updates in background.
 */
export async function fetchWithCache(url, options = {}) {
  const key = normalizeKey(url);
  const ttl = options.ttl || 60000; // 1 minute default TTL
  const cached = cache.get(key);

  if (cached && (Date.now() - cached.timestamp < ttl)) {
    // Return cached immediately
    return cached.data;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    setCachedData(key, data);
    
    // Notify any active page listeners
    const cbs = listeners.get(key) || [];
    cbs.forEach(cb => {
      try { cb(data); } catch (_) {}
    });

    return data;
  } catch (err) {
    // If fetch failed but we have stale cache, return stale cache as fallback
    if (cached) return cached.data;
    throw err;
  }
}

/**
 * Subscribe to cache updates
 */
export function subscribeToCache(url, callback) {
  const key = normalizeKey(url);
  if (!listeners.has(key)) {
    listeners.set(key, new Set());
  }
  listeners.get(key).add(callback);
  return () => {
    const set = listeners.get(key);
    if (set) {
      set.delete(callback);
      if (set.size === 0) listeners.delete(key);
    }
  };
}

/**
 * Prefetch all core datasets on app launch in parallel
 */
export function prefetchAllCoreData() {
  const base = import.meta.env.VITE_API_URL || '/api';
  const apiUrl = base.endsWith('/api') ? base : `${base}/api`;
  
  // Dashboard & Conviction
  fetchWithCache(`${apiUrl}/dashboard`);
  
  // Stocks list & Conviction all
  fetchWithCache(`${apiUrl}/stocks`);
  fetchWithCache(`${apiUrl}/conviction/all`);
  
  // Models
  fetchWithCache(`${apiUrl}/models`);

  // Screeners
  fetchWithCache(`${apiUrl}/screener`);
  fetchWithCache(`${apiUrl}/ta/screener`);
  fetchWithCache(`${apiUrl}/screener/universe`, { ttl: 120000 });
}
