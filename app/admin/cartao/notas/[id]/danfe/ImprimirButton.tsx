'use client';

import { Button } from '@/components/ui/Button';

export function ImprimirButton() {
  return (
    <Button size="sm" onClick={() => window.print()}>
      Imprimir / salvar PDF
    </Button>
  );
}
