import { useEffect, useState } from "react";

// Reactive media-query hook. Returns true while the query matches.
// Used to swap layout decisions that can't be expressed in CSS alone
// (e.g. the markdown editor uses different React components per mode).
export default function useMediaQuery(query) {
  const get = () =>
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia(query).matches
      : false;
  const [matches, setMatches] = useState(get);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
