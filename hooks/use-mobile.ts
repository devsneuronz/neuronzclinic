import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile(breakpoint: number = MOBILE_BREAKPOINT) {
  const getSnapshot = React.useCallback(() => window.innerWidth < breakpoint, []);
  const getServerSnapshot = React.useCallback(() => false, []);

  return React.useSyncExternalStore(
    React.useCallback(
      (onStoreChange) => {
        const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
        mql.addEventListener("change", onStoreChange);
        return () => mql.removeEventListener("change", onStoreChange);
      },
      [breakpoint],
    ),
    getSnapshot,
    getServerSnapshot,
  );
}
