import { useEffect, useState } from 'react';

/** Subscribe to a CSS media query. */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = (event) => setMatches(event.matches);
    setMatches(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** True on viewports below the `md` breakpoint. */
export function useIsMobile() {
  return useMediaQuery('(max-width: 767px)');
}

/**
 * Whether to render expensive decorative effects (WebGL shaders, scroll
 * animations). Disabled when the user asked for reduced motion, on small
 * screens where the GPU/battery cost is not worth it, and on devices reporting
 * very few CPU cores.
 */
export function useDecorativeEffects() {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const smallScreen = useMediaQuery('(max-width: 900px)');
  const [capable] = useState(() => {
    if (typeof navigator === 'undefined') return true;
    const cores = navigator.hardwareConcurrency;
    return typeof cores !== 'number' || cores > 4;
  });

  return !reducedMotion && !smallScreen && capable;
}
