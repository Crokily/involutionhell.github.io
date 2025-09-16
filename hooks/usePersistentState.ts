"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Initializer<T> = T | (() => T);

export function usePersistentState<T>(
  key: string,
  initialValue: Initializer<T>,
): [T, (value: T | ((prev: T) => T)) => void] {
  const initialisedRef = useRef(false);
  const getInitialValue = useCallback((): T => {
    const resolved =
      typeof initialValue === "function"
        ? (initialValue as () => T)()
        : initialValue;
    if (typeof window === "undefined") {
      return resolved;
    }

    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        return resolved;
      }
      return JSON.parse(raw) as T;
    } catch (error) {
      console.warn("usePersistentState: failed to parse value", error);
      return resolved;
    }
  }, [initialValue, key]);

  const [value, setValue] = useState<T>(getInitialValue);

  useEffect(() => {
    if (initialisedRef.current) {
      return;
    }
    // Sync with storage on first client render in case SSR default is stale.
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(key);
        if (raw) {
          setValue(JSON.parse(raw) as T);
        }
      } catch (error) {
        console.warn("usePersistentState: failed to hydrate", error);
      }
    }
    initialisedRef.current = true;
  }, [key]);

  const setPersistentValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((current) => {
        const resolved =
          typeof next === "function" ? (next as (prev: T) => T)(current) : next;
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(key, JSON.stringify(resolved));
          } catch (error) {
            console.warn("usePersistentState: failed to persist", error);
          }
        }
        return resolved;
      });
    },
    [key],
  );

  return [value, setPersistentValue];
}
