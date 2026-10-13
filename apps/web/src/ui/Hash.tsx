import { useState } from 'react';
import { Check, Copy } from '@phosphor-icons/react';
import { copyToClipboard, shortHash } from '../format';

export function Hash({ value, len = 6, className = '' }: { value: string | null | undefined; len?: number; className?: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className={`font-mono tabular text-faint ${className}`}>n/a</span>;
  return (
    <button
      type="button"
      onClick={async () => {
        await copyToClipboard(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      title={value}
      className={`inline-flex items-center gap-1 d-chip px-1.5 py-0.5 font-mono tabular text-xs text-text transition-colors hover:bg-lime active:translate-y-px ${className}`}
    >
      {shortHash(value, len)}
      {copied ? <Check size={12} weight="bold" className="text-ink" /> : <Copy size={12} />}
    </button>
  );
}
