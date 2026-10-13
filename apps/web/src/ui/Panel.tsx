import type { ReactNode } from 'react';
import { InkBox, InkLine } from '../monad/doodle/Sketch';

/** Inked card: hand-drawn outline that draws itself, springs in, title in Archivo 800 over a drawn rule. */
export function Panel({
  title,
  action,
  raised,
  className = '',
  children,
}: {
  title?: ReactNode;
  action?: ReactNode;
  raised?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <InkBox className={className} shadow={raised}>
      {(title || action) && (
        <div className="px-4 pt-3">
          <div className="flex items-center justify-between gap-3">
            {title && <h3 className="min-w-0 text-[17px] leading-tight text-text">{title}</h3>}
            {action}
          </div>
          <InkLine stroke={2.5} thickness={10} delay={0.25} className="mt-1" />
        </div>
      )}
      <div className="p-4">{children}</div>
    </InkBox>
  );
}
