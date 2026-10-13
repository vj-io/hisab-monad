import type { ReactNode } from 'react';

export function RuleRow({
  label,
  value,
  children,
  className = '',
}: {
  label?: ReactNode;
  value?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`${className.includes('grid') ? '' : 'flex justify-between'} items-center gap-3 border-b-2 border-dashed border-ink/25 py-2 text-sm last:border-b-0 ${className}`}
    >
      {children ?? (
        <>
          <span className="d-hand text-[17px] text-muted">{label}</span>
          <span className="min-w-0 break-words text-right text-text">{value}</span>
        </>
      )}
    </div>
  );
}
