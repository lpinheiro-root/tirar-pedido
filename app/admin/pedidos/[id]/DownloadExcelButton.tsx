'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

export function DownloadExcelButton({
  pedidoId,
  children,
}: {
  pedidoId: string;
  children: React.ReactNode;
}) {
  const [carregando, setCarregando] = useState(false);

  async function baixar() {
    setCarregando(true);
    try {
      const res = await fetch(`/api/pedidos/${pedidoId}/excel-url`);
      const data = await res.json();
      if (res.ok && data.url) {
        window.open(data.url, '_blank');
      }
    } finally {
      setCarregando(false);
    }
  }

  return (
    <Button variant="secondary" size="sm" onClick={baixar} disabled={carregando} className="mt-3">
      {carregando ? 'Gerando link...' : children}
    </Button>
  );
}
