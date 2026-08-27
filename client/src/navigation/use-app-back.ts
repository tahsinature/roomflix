import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export type AppReturnState = {
  hasAppReturn?: true;
};

/** Returns through real browser history when this page was opened in-app. */
export function useAppBack(fallback: string): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  const hasAppReturn = (location.state as AppReturnState | null)?.hasAppReturn === true;

  return useCallback(() => {
    if (hasAppReturn) navigate(-1);
    else navigate(fallback, { replace: true });
  }, [fallback, hasAppReturn, navigate]);
}
