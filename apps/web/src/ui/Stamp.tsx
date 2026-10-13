type StampTone = 'plain' | 'outline' | 'dashed' | 'solid' | 'danger';
type StampSize = 'sm' | 'md' | 'lg';

const STATE_TONE: Record<string, StampTone> = {
  OPEN: 'plain',
  FINANCED: 'outline',
  PARTIAL: 'dashed',
  REALISED: 'solid',
  DEFAULTED: 'danger',
  DISPUTED: 'danger',
  FAILED: 'danger',
  VALID: 'solid',
  INVALID: 'danger',
  CONFIRMED: 'solid',
  PENDING: 'plain',
};

const ROT: Record<StampTone, number> = { plain: -2, outline: 3, dashed: -3, solid: -5, danger: 4 };

/** Ink stamp: thuds in, slightly rotated. REALISED = lime, DEFAULTED = inverted ink. Styles: .d-stamp* in index.css. */
export function Stamp({ state, tone, label, size = 'md' }: { state?: string; tone?: StampTone; label?: string; size?: StampSize }) {
  const t = tone ?? STATE_TONE[state ?? ''] ?? 'plain';
  const text = label ?? state ?? '';
  return (
    <span key={text} className={`d-stamp d-stamp-${size} d-stamp-${t}`} style={{ ['--rot' as string]: `${ROT[t]}deg` }}>
      {text}
    </span>
  );
}
