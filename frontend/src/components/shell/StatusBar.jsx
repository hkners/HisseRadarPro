import React from 'react';

// Bottom status strip: live-data note and the standing disclaimer, shown on every page.
export default function StatusBar() {
  return (
    <footer className="statusbar">
      <span className="live-dot">BIST CANLI</span>
      <span className="statusbar-sep" />
      <span>Fiyatlar ~15 dk gecikmeli</span>
      <span className="statusbar-sep" />
      <span className="statusbar-disclaimer">
        Yatırım tavsiyesi değildir. Skorlar ve getiriler geçmiş veriye ve aracı kurum raporlarına dayanır; gelecekteki sonuçları garanti etmez.
      </span>
    </footer>
  );
}
