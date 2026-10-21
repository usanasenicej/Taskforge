import { ArrowLeft, ArrowRight, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { OtpInput, emptyOtp, focusFirstOtp } from "../../components/OtpInput";
import { useAuth } from "../../context/AuthContext";
import { AuthLayout } from "./AuthLayout";
import { Field, PasswordField, Spinner } from "./fields";

const DEMO = [
  { label: "Owner", email: "owner@taskforge.local", hint: "Full control" },
  { label: "Admin", email: "admin@taskforge.local", hint: "Manage team" },
  { label: "Member", email: "member@taskforge.local", hint: "Do the work" },
];

export function LoginPage() {
  const { login, completeSecondFactor } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const [mfaToken, setMfaToken] = useState<string | null>(null);

  const submit = async (emailValue = email, passwordValue = password) => {
    setBusy(true);
    setError("");
    try {
      const challenge = await login(emailValue, passwordValue);
      if (challenge) {
        setMfaToken(challenge.mfaToken);
        return;
      }
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 403 && err.detail === "Email not verified") {
        const resent = await api.resendVerification(emailValue).catch(() => null);
        navigate(`/verify-email?email=${encodeURIComponent(emailValue)}`, {
          state: { devCode: resent?.dev_verification_code, notice: "Verify your email to finish signing in." },
        });
        return;
      }
      setError(err instanceof ApiError ? err.detail : "Sign in failed. Please try again.");
      setShake((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  if (mfaToken) {
    return (
      <AuthLayout>
        <SecondFactorStep
          email={email}
          onSubmit={async (code) => {
            await completeSecondFactor(mfaToken, code);
            navigate("/", { replace: true });
          }}
          onExpired={() => {
            setMfaToken(null);
            setPassword("");
            setError("Your sign-in expired. Enter your password again.");
          }}
          onBack={() => {
            setMfaToken(null);
            setPassword("");
          }}
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="auth-card">
        <div className="auth-heading">
          <h1>Welcome back</h1>
          <p>Sign in to pick up where your team left off.</p>
        </div>

        {notice && <div className="alert success">{notice}</div>}

        <form
          key={shake}
          className={`auth-fields ${shake ? "shake" : ""}`}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          <Field
            label="Work email"
            icon={<Mail size={16} />}
            type="email"
            placeholder="you@company.com"
            value={email}
            autoComplete="email"
            autoFocus
            required
            onChange={(e) => setEmail(e.target.value)}
          />
          <PasswordField value={password} onChange={setPassword} autoComplete="current-password" />
          <button className="btn primary block lg" type="submit" disabled={busy}>
            {busy ? <Spinner /> : null}
            {busy ? "Signing in…" : "Sign in"}
            {!busy && <ArrowRight size={17} />}
          </button>
        </form>

        <div className="divider">
          <span>or explore the demo workspace</span>
        </div>
        <div className="demo-grid">
          {DEMO.map((account) => (
            <button
              key={account.email}
              type="button"
              className="demo-chip"
              disabled={busy}
              onClick={() => {
                setEmail(account.email);
                setPassword("password123");
                void submit(account.email, "password123");
              }}
            >
              <strong>{account.label}</strong>
              <span>{account.hint}</span>
            </button>
          ))}
        </div>

        <p className="auth-switch">
          New to TaskForge? <Link to="/register">Create a workspace</Link>
        </p>
      </div>
    </AuthLayout>
  );
}

function SecondFactorStep({
  email,
  onSubmit,
  onExpired,
  onBack,
}: {
  email: string;
  onSubmit: (code: string) => Promise<void>;
  onExpired: () => void;
  onBack: () => void;
}) {
  const [useRecovery, setUseRecovery] = useState(false);
  const [digits, setDigits] = useState<string[]>(emptyOtp);
  const [recovery, setRecovery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const card = useRef<HTMLDivElement>(null);

  const submit = async (code: string) => {
    if (busy || !code.trim()) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit(code.trim());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onExpired();
        return;
      }
      setError(err instanceof ApiError ? err.detail : "Verification failed");
      setDigits(emptyOtp());
      setBusy(false);
      window.setTimeout(() => focusFirstOtp(card.current));
    }
  };

  return (
    <div className="auth-card" ref={card}>
      <div className="verify-icon">{useRecovery ? <KeyRound size={26} /> : <ShieldCheck size={26} />}</div>
      <div className="auth-heading">
        <h1>Two-factor authentication</h1>
        <p>
          {useRecovery ? (
            "Enter one of the recovery codes you saved when you turned on 2FA. Each code works once."
          ) : (
            <>
              Open your authenticator app and enter the 6-digit code for <strong>{email}</strong>.
            </>
          )}
        </p>
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(useRecovery ? recovery : digits.join(""));
        }}
      >
        {useRecovery ? (
          <div className="auth-fields recovery-field">
            <Field
              label="Recovery code"
              icon={<KeyRound size={16} />}
              placeholder="xxxxx-xxxxx"
              value={recovery}
              autoFocus
              autoComplete="off"
              className="mono"
              onChange={(e) => setRecovery(e.target.value)}
            />
          </div>
        ) : (
          <OtpInput value={digits} onChange={setDigits} onComplete={submit} disabled={busy} state={error ? "invalid" : undefined} />
        )}
        <button
          className="btn primary block lg"
          type="submit"
          disabled={busy || (useRecovery ? !recovery.trim() : digits.some((d) => !d))}
        >
          {busy ? <Spinner /> : null}
          {busy ? "Verifying…" : "Verify and sign in"}
        </button>
      </form>
      <p className="auth-switch">
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            setUseRecovery((v) => !v);
            setError("");
          }}
        >
          {useRecovery ? "Use authenticator app instead" : "Lost your phone? Use a recovery code"}
        </button>
      </p>
      <p className="auth-switch">
        <button type="button" className="link-btn back-link" onClick={onBack}>
          <ArrowLeft size={14} /> Back to sign in
        </button>
      </p>
    </div>
  );
}
