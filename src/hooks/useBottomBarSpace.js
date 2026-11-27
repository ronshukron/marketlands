import { useEffect } from 'react';

// A page with a bar pinned to the bottom of a phone screen (for example the
// recurring-basket save bar) calls this while the bar is shown. The body gets
// "has-bottom-bar", and index.css lifts the floating accessibility button
// (.a11y-fab) above the bar on phones, so it covers neither the bar's text nor
// its button. Counted, so two bars at once do not clear each other.

let activeBars = 0;

export default function useBottomBarSpace(active = true) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return undefined;
    activeBars += 1;
    document.body.classList.add('has-bottom-bar');
    return () => {
      activeBars = Math.max(0, activeBars - 1);
      if (activeBars === 0) document.body.classList.remove('has-bottom-bar');
    };
  }, [active]);
}
