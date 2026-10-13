import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

// Doodle look lives in index.css (.d-btn*): ink border, hard offset shadow, lime for primary.
const SIZE_CLS: Record<Size, string> = {
  sm: 'min-h-8 px-2.5 text-xs gap-1.5',
  md: 'min-h-10 px-4 text-sm gap-2',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  children,
  className = '',
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`d-btn d-btn-${variant} ${SIZE_CLS[size]} ${className}`}
      {...rest}
    >
      {loading ? (
        <span className="font-mono tabular">···</span>
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </button>
  );
}
