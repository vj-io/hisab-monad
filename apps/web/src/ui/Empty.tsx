import type { ReactNode } from 'react';
import type { Icon } from '@phosphor-icons/react';
import { InkLine } from '../monad/doodle/Sketch';

export function Empty({ icon: IconCmp, message, action }: { icon?: Icon; message: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-2 py-6 text-center">
      {IconCmp && <IconCmp size={22} className="text-faint" />}
      <p className="d-hand text-[19px] leading-snug text-muted">{message}</p>
      <div className="w-24"><InkLine stroke={2.5} thickness={8} bend={4} className="opacity-60" /></div>
      {action}
    </div>
  );
}
