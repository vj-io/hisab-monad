import { motion } from 'motion/react';

interface TabItem<T extends string> {
  id: T;
  label: string;
}

/** Hand-written, wavy-underlined labels; the active one gets a highlighter swipe that slides between tabs. */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  groupId,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (v: T) => void;
  groupId: string;
}) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto overflow-y-hidden px-1 [scrollbar-width:none]">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          onClick={() => onChange(it.id)}
          aria-current={value === it.id ? 'page' : undefined}
          className="d-tab active:translate-y-px"
        >
          {value === it.id && (
            <motion.span
              layoutId={`${groupId}-swipe`}
              className="d-tab-hl"
              transition={{ type: 'spring', stiffness: 500, damping: 36 }}
            />
          )}
          <span>{it.label}</span>
        </button>
      ))}
    </div>
  );
}
