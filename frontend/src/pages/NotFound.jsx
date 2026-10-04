import React from 'react';
import { useLocation } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { EmptyState, Button } from '../components/ui';

export default function NotFound() {
  const { pathname } = useLocation();
  return (
    <EmptyState
      icon={Compass}
      title="Bu sayfa radarda yok."
      actions={
        <>
          <Button variant="primary" to="/">Dashboard'a dön</Button>
          <Button to="/stocks">Hisselere göz at</Button>
        </>
      }
    >
      <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{pathname}</span> adresinde bir sayfa bulunamadı.
      Bir hisse arıyorsan <span className="kbd">Ctrl K</span> ile doğrudan arayabilirsin.
    </EmptyState>
  );
}
