import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, clearTokens, getAccessToken, setTokens } from "../api/client";
import type { RegisterResponse, User } from "../api/types";

interface AuthState {
  user: User | null;
  loading: boolean;
  /** Resolves to an MFA token when the account has 2FA on and needs a code next. */
  login: (email: string, password: string) => Promise<{ mfaToken: string } | null>;
  completeSecondFactor: (mfaToken: string, code: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  register: (payload: {
    email: string;
    password: string;
    full_name: string;
    organization_name: string;
  }) => Promise<RegisterResponse>;
  verifyEmail: (email: string, code: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getAccessToken()) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then(setUser)
      .catch(() => {
        clearTokens();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    if ("mfa_required" in res) return { mfaToken: res.mfa_token };
    setTokens(res);
    setUser(await api.me());
    return null;
  }, []);

  const completeSecondFactor = useCallback(async (mfaToken: string, code: string) => {
    setTokens(await api.loginSecondFactor(mfaToken, code));
    setUser(await api.me());
  }, []);

  const refreshUser = useCallback(async () => {
    setUser(await api.me());
  }, []);

  const register = useCallback<AuthState["register"]>((payload) => api.register(payload), []);

  /** Returns true when the account is now signed in, false when it was already verified. */
  const verifyEmail = useCallback(async (email: string, code: string) => {
    const res = await api.verifyEmail(email, code);
    if (!res.tokens) return false;
    setTokens(res.tokens);
    setUser(await api.me());
    return true;
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, completeSecondFactor, refreshUser, register, verifyEmail, logout }),
    [user, loading, login, completeSecondFactor, refreshUser, register, verifyEmail, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
