import { forwardRef, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  compact?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', compact = false, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`w-full rounded-md border border-[#D1D5DB] bg-surface-container-lowest px-3 text-body text-on-surface placeholder:text-outline focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-2 ${
          compact ? 'h-9' : 'h-10'
        } ${className}`}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';
