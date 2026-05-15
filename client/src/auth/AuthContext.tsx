import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AuthUser, GuestIdentity, SpaceSummary } from "@shared/protocol";
import { api, UnauthorizedError } from "@/lib/api";

// Tri-state because the initial /session probe runs async and we don't
// want to flash the welcome screen for a known-authed user on reload.
//   "loading"  — first probe in flight
//   null       — confirmed signed-out
//   AuthUser   — signed-in real user
//
// Guests have their own field (`guest`) — kept separate from `user` so
// downstream UI doesn't accidentally treat a guest as a real account.
type UserState = AuthUser | null | "loading";

type AuthContextValue = {
  user: AuthUser | null;
  guest: GuestIdentity | null;
  loading: boolean;
  registrationAllowed: boolean;
  spaces: SpaceSummary[];
  currentSpace: SpaceSummary | null;
  // True iff this principal is a guest session. Shorthand callers use
  // when they need to hide owner-only or space-management affordances.
  isGuest: boolean;
  // What to render as the visible name everywhere ("@tahsin" or "Sam").
  // Empty string when logged out.
  identityLabel: string;
  login: (input: { username: string; password: string }) => Promise<void>;
  register: (input: { username: string; password: string }) => Promise<void>;
  redeemGuest: (input: { code: string; displayName: string }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  // Switch active space (users only; guests can't switch).
  switchSpace: (spaceId: string) => Promise<void>;
  // Patch the current principal's display name. Works for users and
  // guests — server-side picks the right backing store.
  updateProfile: (patch: { displayName: string | null }) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UserState>("loading");
  const [guest, setGuest] = useState<GuestIdentity | null>(null);
  const [registrationAllowed, setRegistrationAllowed] = useState(true);
  const [spaces, setSpaces] = useState<SpaceSummary[]>([]);
  const [currentSpaceId, setCurrentSpaceId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const session = await api.authSession();
      setState(session.user);
      setGuest(session.guest);
      setRegistrationAllowed(session.registrationAllowed);
      setSpaces(session.spaces);
      setCurrentSpaceId(session.currentSpaceId);
    } catch {
      setState(null);
      setGuest(null);
      setSpaces([]);
      setCurrentSpaceId(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Global UnauthorizedError listener — drops the session if any api.*
  // call returns 401 (typically: session expired mid-page).
  useEffect(() => {
    const handler = (e: PromiseRejectionEvent) => {
      if (e.reason instanceof UnauthorizedError) {
        setState((prev) => (prev === null ? prev : null));
        setGuest(null);
        setSpaces([]);
        setCurrentSpaceId(null);
      }
    };
    window.addEventListener("unhandledrejection", handler);
    return () => window.removeEventListener("unhandledrejection", handler);
  }, []);

  const login: AuthContextValue["login"] = useCallback(
    async (input) => {
      const user = await api.authLogin(input);
      setState(user);
      setGuest(null);
      await refresh();
    },
    [refresh],
  );

  const register: AuthContextValue["register"] = useCallback(
    async (input) => {
      const user = await api.authRegister(input);
      setState(user);
      setGuest(null);
      await refresh();
    },
    [refresh],
  );

  const redeemGuest: AuthContextValue["redeemGuest"] = useCallback(
    async (input) => {
      await api.redeemInviteAsGuest(input);
      // Server set the cookie — refresh pulls down the resulting guest
      // identity and the single-space listing.
      await refresh();
    },
    [refresh],
  );

  const logout: AuthContextValue["logout"] = useCallback(async () => {
    await api.authLogout().catch(() => undefined);
    setState(null);
    setGuest(null);
    setSpaces([]);
    setCurrentSpaceId(null);
  }, []);

  const switchSpace: AuthContextValue["switchSpace"] = useCallback(async (spaceId) => {
    await api.switchSpace(spaceId);
    setCurrentSpaceId(spaceId);
  }, []);

  const updateProfile: AuthContextValue["updateProfile"] = useCallback(
    async (patch) => {
      // Server returns AuthUser for user-update and GuestIdentity for
      // guest-update. We can't know which without inspecting the shape;
      // refresh() is simpler than disambiguating in-place.
      await api.updateProfile(patch);
      await refresh();
    },
    [refresh],
  );

  const currentSpace = useMemo(() => spaces.find((s) => s.id === currentSpaceId) ?? null, [spaces, currentSpaceId]);
  const isGuest = guest !== null;
  const identityLabel = useMemo(() => {
    if (state && state !== "loading") {
      return state.displayName?.trim() || `@${state.username}`;
    }
    if (guest) return `${guest.displayName} (guest)`;
    return "";
  }, [state, guest]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: state === "loading" ? null : state,
      guest,
      loading: state === "loading",
      registrationAllowed,
      spaces,
      currentSpace,
      isGuest,
      identityLabel,
      login,
      register,
      redeemGuest,
      logout,
      refresh,
      switchSpace,
      updateProfile,
    }),
    [state, guest, registrationAllowed, spaces, currentSpace, isGuest, identityLabel, login, register, redeemGuest, logout, refresh, switchSpace, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
