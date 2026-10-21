import { ArrowLeft, MailCheck, Terminal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { OtpInput, emptyOtp, focusFirstOtp } from "../../components/OtpInput";
import { useAuth } from "../../context/AuthContext";
import { AuthLayout } from "./AuthLayout";
import { Spinner } from "./fields";

const RESEND_SECONDS = 30;

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const { verifyEmail } = useAuth();
  const email = params.get("email") ?? "";
  const state = location.state as { devCode?: string; notice?: string } | null;
  const [devCode, setDevCode] = useState(state?.devCode);
  const [digits, setDigits] = useState<string[]>(emptyOtp);
  const [error, setError] = useState("");
  const [info, setInfo] = useState(state?.notice ?? "");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const submit = async (code: string) => {
    if (code.length !== 6 || busy) return;
    setBusy(true);
    setError("");
    try {
      const signedIn = await verifyEmail(email, code);
      setDone(true);
      window.setTimeout(
        () =>
          signedIn
            ? navigate("/", { replace: true })
            : navigate("/login", { replace: true, state: { notice: "Email already verified — sign in to continue." } }),
        700,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Verification failed");
      setDigits(emptyOtp());
      window.setTimeout(() => focusFirstOtp(card.current));
    } finally {
      setBusy(false);
    }
  };

  if (!email) {
    return (
      <AuthLayout>
        <div className="auth-card">
          <div className="auth-heading">
            <h1>Missing email</h1>
            <p>Start from sign up or sign in so we know which account to verify.</p>
          </div>
          <Link className="btn primary block lg" to="/register">
            Create a workspace
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="auth-card" ref={card}>
        <div className="verify-icon">
          <MailCheck size={26} />
        </div>
        <div className="auth-heading">
          <h1>Check your inbox</h1>
          <p>
            We sent a 6-digit code to <strong>{email}</strong>. Enter it below to activate your workspace.
          </p>
        </div>

        {devCode && (
          <div className="dev-code">
            <Terminal size={15} />
            <span>
              Dev mode — your code is <code>{devCode}</code>
            </span>
            <button
              type="button"
              onClick={() => {
                setDigits(devCode.split(""));
                void submit(devCode);
              }}
            >
              Fill
            </button>
          </div>
        )}
        {info && !error && <div className="alert info">{info}</div>}
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {done && <div className="alert success">Email verified! Taking you in…</div>}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(digits.join(""));
          }}
        >
          <OtpInput
            value={digits}
            onChange={setDigits}
            onComplete={submit}
            disabled={busy || done}
            state={error ? "invalid" : done ? "valid" : undefined}
          />
          <button className="btn primary block lg" type="submit" disabled={busy || done || digits.some((d) => !d)}>
            {busy ? <Spinner /> : null}
            {busy ? "Verifying…" : "Verify email"}
          </button>
        </form>

        <p className="auth-switch">
          Didn't get it?{" "}
          <button
            type="button"
            className="link-btn"
            disabled={cooldown > 0}
            onClick={async () => {
              setError("");
              try {
                const res = await api.resendVerification(email);
                if (res.verified) {
                  navigate("/login", { state: { notice: "Email already verified — sign in to continue." } });
                  return;
                }
                setDevCode(res.dev_verification_code);
                setInfo("A new code is on its way.");
                setCooldown(RESEND_SECONDS);
              } catch (err) {
                setError(err instanceof ApiError ? err.detail : "Could not resend the code");
              }
            }}
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
          </button>
        </p>
        <p className="auth-switch">
          <Link to="/login" className="back-link">
            <ArrowLeft size={14} /> Back to sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
