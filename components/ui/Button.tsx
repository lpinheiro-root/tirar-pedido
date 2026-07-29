import { forwardRef, type ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary/90 disabled:bg-primary/40',
  secondary:
    'bg-transparent border border-primary text-primary hover:bg-primary/5 disabled:border-outline-variant disabled:text-outline',
  ghost: 'bg-transparent text-on-surface hover:text-primary hover:bg-primary/5',
  danger: 'bg-error text-on-error hover:bg-error/90',
};

const sizeClasses: Record<Size, string> = {
  sm: 'h-9 px-3 text-body-sm',
  md: 'h-10 px-4 text-button',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className = '', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
