import { useState, useEffect } from 'react';

// Shared event emitter to keep favorites synced across tabs and components
const FAVORITES_KEY = 'hisseRadarFavorites';
const FAVORITES_EVENT = 'favorites_updated';

// We keep a simple singleton to trigger updates across components that use this hook
export function useFavorites() {
    const [favorites, setFavorites] = useState(() => {
        try {
            const saved = localStorage.getItem(FAVORITES_KEY);
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });

    useEffect(() => {
        const handleStorageChange = (e) => {
            if (e.key === FAVORITES_KEY || e.type === FAVORITES_EVENT) {
                try {
                    const saved = localStorage.getItem(FAVORITES_KEY);
                    setFavorites(saved ? JSON.parse(saved) : []);
                } catch {}
            }
        };

        // Listen for storage events (cross-tab)
        window.addEventListener('storage', handleStorageChange);
        // Listen for custom event (same-tab cross-component)
        window.addEventListener(FAVORITES_EVENT, handleStorageChange);

        return () => {
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener(FAVORITES_EVENT, handleStorageChange);
        };
    }, []);

    const toggleFavorite = (ticker) => {
        setFavorites((prev) => {
            const newFavs = prev.includes(ticker) ? prev.filter(t => t !== ticker) : [...prev, ticker];
            localStorage.setItem(FAVORITES_KEY, JSON.stringify(newFavs));
            window.dispatchEvent(new Event(FAVORITES_EVENT));
            return newFavs;
        });
    };

    return { favorites, toggleFavorite };
}
