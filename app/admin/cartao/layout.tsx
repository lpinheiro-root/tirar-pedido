import { CartaoTabs } from './CartaoTabs';

export default function CartaoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <CartaoTabs />
      {children}
    </div>
  );
}
