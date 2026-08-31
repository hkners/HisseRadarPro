import React from 'react';
import { useFavorites } from '../../hooks/useFavorites';

export default function FavoriteStar({ ticker, style, className }) {
    const { favorites, toggleFavorite } = useFavorites();
    const isFavorite = favorites.includes(ticker);

    return (
        <span 
            onClick={(e) => { e.preventDefault(); toggleFavorite(ticker); }}
            className={className}
            style={{ 
                cursor: 'pointer', 
                color: isFavorite ? 'var(--color-warning)' : 'var(--border-color)', 
                fontSize: '16px',
                marginRight: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                ...style 
            }}
            title={isFavorite ? 'Favorilerden Çıkar' : 'Favorilere Ekle'}
        >
            {isFavorite ? '★' : '☆'}
        </span>
    );
}
