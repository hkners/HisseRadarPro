import { useState, useEffect, useCallback } from 'react';

// Shared event emitter to keep favorites synced across tabs and components
const FAVORITES_KEY = 'hisseRadarFavorites';
const FAVORITES_EVENT = 'favorites_updated';

const getSavedFavorites = () => {
    try {
        const saved = localStorage.getItem(FAVORITES_KEY);
        return saved ? JSON.parse(saved) : [];
    } catch {
        return [];
    }
};

let globalFavorites = getSavedFavorites();

export function useFavorites() {
    const [favorites, setFavorites] = useState(globalFavorites);

    useEffect(() => {
        const handleUpdate = () => {
            const current = getSavedFavorites();
            globalFavorites = current;
            setFavorites(current);
        };

        window.addEventListener('storage', handleUpdate);
        window.addEventListener(FAVORITES_EVENT, handleUpdate);

        return () => {
            window.removeEventListener('storage', handleUpdate);
            window.removeEventListener(FAVORITES_EVENT, handleUpdate);
        };
    }, []);

    const toggleFavorite = useCallback((ticker) => {
        if (!ticker) return;
        const current = getSavedFavorites();
        const exists = current.includes(ticker);
        const next = exists ? current.filter(t => t !== ticker) : [...current, ticker];
        
        try {
            localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
        } catch (err) {
            console.error('Error saving favorites:', err);
        }
        
        globalFavorites = next;
        setFavorites(next);
        
        // Notify other component instances cleanly
        window.dispatchEvent(new CustomEvent(FAVORITES_EVENT, { detail: next }));
    }, []);

    return { favorites, toggleFavorite };
}

