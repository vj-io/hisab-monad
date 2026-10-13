import { useEffect, useRef } from 'react';

/**
 * Mount ONCE at the app root. Defines #doodle-boil, applied (via the .ink class) to
 * the small SVG ink layers only, never to text. The turbulence seed is stepped at
 * ~8fps, which is what makes the lines "boil". No boil under prefers-reduced-motion
 * (the .ink filter is also removed in CSS) or while the tab is hidden.
 */
export function BoilFilter() {
  const turb = useRef<SVGFETurbulenceElement>(null);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let seed = 1;
    const tick = () => {
      if (document.hidden) return;
      seed = (seed % 4) + 1;
      turb.current?.setAttribute('seed', String(seed));
    };
    const id = window.setInterval(tick, 125);
    return () => window.clearInterval(id);
  }, []);
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute' }}>
      <defs>
        <filter id="doodle-boil" x="-8%" y="-8%" width="116%" height="116%">
          <feTurbulence ref={turb} type="fractalNoise" baseFrequency="0.022" numOctaves={1} seed={1} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  );
}
