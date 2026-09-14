"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type State<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

/**
 * Minimal fetch-with-state hook. Re-runs whenever `deps` change; `reload`
 * refetches without changing deps.
 */
export function useApi<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<State<T>>({ data: null, loading: true, error: null });
  const serialized = deps.map((dep) => JSON.stringify(dep)).join("|");
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await loaderRef.current();
      setState({ data, loading: false, error: null });
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : "Something went wrong",
      }));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState((current) => ({ ...current, loading: true, error: null }));
      try {
        const data = await loaderRef.current();
        if (!cancelled) setState({ data, loading: false, error: null });
      } catch (error) {
        if (!cancelled) {
          setState((current) => ({
            ...current,
            loading: false,
            error: error instanceof Error ? error.message : "Something went wrong",
          }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [serialized]);

  return { ...state, reload: run };
}