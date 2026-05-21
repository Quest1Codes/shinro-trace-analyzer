import { useEffect, useRef } from 'react';

const Q_PATH = "M 14,10 L 54,10 A 4,4 0 0 1 58,14 L 58,30 A 4,4 0 0 1 54,34 L 38,34 A 4,4 0 0 0 34,38 L 34,82 A 4,4 0 0 0 38,86 L 72,86 A 4,4 0 0 1 76,90 L 76,106 A 4,4 0 0 1 72,110 L 14,110 A 4,4 0 0 1 10,106 L 10,14 A 4,4 0 0 1 14,10 Z";
const ONE_PATH = "M 72,10 L 106,10 A 4,4 0 0 1 110,14 L 110,72 A 4,4 0 0 1 106,76 L 90,76 A 4,4 0 0 1 86,72 L 86,38 A 4,4 0 0 0 82,34 L 72,34 A 4,4 0 0 1 68,30 L 68,14 A 4,4 0 0 1 72,10 Z";

interface Quest1LoaderProps {
  isLoading?: boolean;
  size?: number;
}

export function Quest1Loader({ isLoading = false, size = 40 }: Quest1LoaderProps) {
  const qRef  = useRef<SVGPathElement>(null);
  const oRef  = useRef<SVGPathElement>(null);
  const dRef  = useRef<SVGRectElement>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    const PERIOD = 2800;
    const OFFSETS = { q: 420, o: 280, d: 100 };
    const DELAYS  = { q: 0,   o: 0.1, d: 0.18 };

    function easeInOut(t: number) { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t; }

    function setEl(el: SVGElement | null, dashoffset: number, fillOpacity: number, opacity: number) {
      if (!el) return;
      el.style.setProperty('stroke-dashoffset', String(dashoffset));
      el.style.setProperty('fill-opacity', String(fillOpacity));
      el.style.setProperty('opacity', String(opacity));
    }

    function animate(ts: number) {
      if (!startRef.current) startRef.current = ts;
      const t = ((ts - startRef.current) % PERIOD) / PERIOD;

      const drawEnd = 0.45, fillEnd = 0.88, fadeEnd = 1.0;

      function drawP(delay: number) {
        const adj = Math.max(0, t - delay) / (drawEnd - delay);
        return Math.min(1, easeInOut(Math.max(0, adj)));
      }

      const fillP = t > drawEnd
        ? Math.min(1, easeInOut((t - drawEnd) / (fillEnd - drawEnd)))
        : 0;
      const fadeP = t > fillEnd
        ? easeInOut((t - fillEnd) / (fadeEnd - fillEnd))
        : 0;
      const opacity = 1 - fadeP;

      setEl(qRef.current,  OFFSETS.q * (1 - drawP(DELAYS.q)), fillP, opacity);
      setEl(oRef.current,  OFFSETS.o * (1 - drawP(DELAYS.o)), fillP, t < DELAYS.o ? 0 : opacity);
      setEl(dRef.current,  OFFSETS.d * (1 - drawP(DELAYS.d)), fillP, t < DELAYS.d ? 0 : opacity);

      rafRef.current = requestAnimationFrame(animate);
    }

    function setDone() {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      [qRef.current, oRef.current, dRef.current].forEach(el => {
        if (!el) return;
        el.style.transition = 'fill-opacity 0.4s ease, opacity 0.4s ease';
        el.style.setProperty('stroke-dashoffset', '0');
        el.style.setProperty('fill-opacity', '1');
        el.style.setProperty('opacity', '1');
      });
    }

    function resetStyles() {
      const bases = [
        { el: qRef.current,  da: 420, color: 'var(--logo-navy)' },
        { el: oRef.current,  da: 280, color: 'var(--accent-orange)' },
        { el: dRef.current,  da: 100, color: 'var(--logo-navy)' },
      ];
      bases.forEach(({ el, da, color }) => {
        if (!el) return;
        el.style.transition   = 'none';
        el.style.fill         = color;
        el.style.stroke       = color;
        el.style.strokeWidth  = '2.5';
        el.style.setProperty('fill-opacity', '0');
        el.style.strokeLinecap   = 'round';
        el.style.strokeLinejoin  = 'round';
        el.style.setProperty('stroke-dasharray', String(da));
        el.style.setProperty('stroke-dashoffset', String(da));
        el.style.opacity = '1';
      });
    }

    resetStyles();

    if (isLoading) {
      startRef.current = null;
      rafRef.current = requestAnimationFrame(animate);
    } else {
      setDone();
    }

    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [isLoading]);

  return (
    <svg width={size} height={size} viewBox="0 0 110 110" style={{ display: 'block' }}>
      <path ref={qRef}  d={Q_PATH} />
      <path ref={oRef}  d={ONE_PATH} />
      <rect ref={dRef}  x="86" y="86" width="24" height="24" rx="4" />
    </svg>
  );
}
