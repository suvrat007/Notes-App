import { useEffect, useState } from 'react';

/** Desktop breakpoint — must match the @media rule in App.css. */
export const DESKTOP_QUERY = '(min-width: 1024px)';

/**
 * Subscribe to a media query. Used where desktop should show *more*, not just
 * bigger — layout alone belongs in CSS, but the amount of data to render is a
 * component decision.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

export const useIsDesktop = () => useMediaQuery(DESKTOP_QUERY);
