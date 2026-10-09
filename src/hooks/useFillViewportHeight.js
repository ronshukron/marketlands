import { useCallback, useEffect, useState } from 'react';

const DESKTOP_QUERY = '(min-width: 1024px)';

/**
 * Returns [ref, height] where height (px) makes the referenced element reach
 * the bottom of the viewport from its current document offset, so its
 * children can scroll independently instead of sharing the page scroll.
 * Height is null below the Tailwind `lg` breakpoint, where the page scrolls.
 */
export default function useFillViewportHeight({ bottomGap = 16, minHeight = 420 } = {}) {
  const [node, setNode] = useState(null);
  const [height, setHeight] = useState(null);
  const ref = useCallback((el) => setNode(el), []);

  useEffect(() => {
    if (!node || typeof window === 'undefined') return undefined;
    const media = window.matchMedia ? window.matchMedia(DESKTOP_QUERY) : null;

    const measure = () => {
      if (media && !media.matches) {
        setHeight(null);
        return;
      }
      const top = Math.max(0, node.getBoundingClientRect().top);
      const next = Math.max(minHeight, Math.floor(window.innerHeight - top - bottomGap));
      setHeight((prev) => (prev === next ? prev : next));
    };

    measure();
    window.addEventListener('resize', measure);
    media?.addEventListener?.('change', measure);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(document.body);
    return () => {
      window.removeEventListener('resize', measure);
      media?.removeEventListener?.('change', measure);
      observer?.disconnect();
    };
  }, [node, bottomGap, minHeight]);

  return [ref, height];
}
