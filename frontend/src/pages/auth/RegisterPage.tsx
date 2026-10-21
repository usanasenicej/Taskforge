import { ArrowRight, Building2, Mail, User } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { AuthLayout } from "./AuthLayout";
import { Field, PasswordField, Spinner } from "./fields";

function slugPreview(name: string) {
  return (
    name
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, "-") || "your-team"
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [org, setOrg] = useState("");
  const [agree, setAgree] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const passwordError = touched && password.length > 0 && password.length < 8 ? "Use at least 8 characters" : undefined;

  return (
    <AuthLayout>
      <div className="auth-card">
        <div className="auth-heading">
          <h1>Create your workspace</h1>
          <p>Free for your whole team. You'll be the workspace owner.</p>
        </div>

        <form
          className="auth-fields"
          onSubmit={async (e) => {
            e.preventDefault();
            setTouched(true);
            if (password.length < 8) return;
            setBusy(true);
            setError("");
            try {
              const res = await register({
                email: email.trim(),
                password,
                full_name: fullName.trim(),
                organization_name: org.trim(),
              });
              navigate(`/verify-email?email=${encodeURIComponent(res.user.email)}`, {
                state: { devCode: res.dev_verification_code },
              });
            } catch (err) {
              setError(err instanceof ApiError ? err.detail : "Registration failed. Please try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {error && (
            <div className="alert error" role="alert">
              {error}
              {error.includes("already registered") && (
                <>
                  {" "}
                  <Link to="/login">Sign in instead</Link>
                </>
              )}
            </div>
          )}
          <Field
            label="Full name"
            icon={<User size={16} />}
            placeholder="Avery Johnson"
            value={fullName}
            autoComplete="name"
            autoFocus
            required
            maxLength={120}
            onChange={(e) => setFullName(e.target.value)}
          />
          <Field
            label="Work email"
            icon={<Mail size={16} />}
            type="email"
            placeholder="you@company.com"
            value={email}
            autoComplete="email"
            required
            onChange={(e) => setEmail(e.target.value)}
          />
          <PasswordField
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            error={passwordError}
            showStrength
          />
          <Field
            label="Workspace name"
            icon={<Building2 size={16} />}
            placeholder="Acme Inc."
            value={org}
            required
            maxLength={120}
            onChange={(e) => setOrg(e.target.value)}
            hint={<span className="slug">taskforge.app/{slugPreview(org)}</span>}
          />
          <label className="check">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>I agree to the Terms and Privacy Policy</span>
          </label>
          <button className="btn primary block lg" type="submit" disabled={busy || !agree}>
            {busy ? <Spinner /> : null}
            {busy ? "Creating workspace…" : "Create workspace"}
            {!busy && <ArrowRight size={17} />}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </AuthLayout>
  );
}
