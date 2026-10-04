import React from 'react';
import { EmptyState, Button } from '../components/ui';

// Placeholder for modules that are on the roadmap but not built yet. Says plainly what is coming.
export default function ComingSoon({ item }) {
  return (
    <EmptyState
      icon={item.icon}
      title={`${item.label} yakında`}
      actions={
        <>
          <Button variant="primary" to="/">Dashboard'a dön</Button>
          <Button to="/screener">Tarayıcıyı aç</Button>
        </>
      }
    >
      {item.description}
    </EmptyState>
  );
}
