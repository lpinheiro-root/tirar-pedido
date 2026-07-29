import type { ReactNode } from 'react';
import { IconBell, IconUser } from '@/components/ui/Icons';

export function Header({ rightSlot }: { rightSlot?: ReactNode }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border-muted bg-surface-container-lowest px-8">
      <div className="flex-1" />
      <div className="flex items-center gap-3">
        {rightSlot}
        <button className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low">
          <IconBell />
        </button>
        <button className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low">
          <IconUser />
        </button>
      </div>
    </header>
  );
}

export function PageHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-h1 text-on-surface">{title}</h1>
      {subtitle && <p className="mt-1 text-body text-on-surface-variant">{subtitle}</p>}
    </div>
  );
}
