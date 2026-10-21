import { AlertTriangle, Eye, EyeOff, Lock } from "lucide-react";
import { useState, type InputHTMLAttributes, type ReactNode } from "react";

export function Field({
  label,
  icon,
  error,
  hint,
  trailing,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  icon?: ReactNode;
  error?: string;
  hint?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <label className={`field ${error ? "has-error" : ""}`}>
      <span className="field-label">
        {label}
        {hint && <span className="field-hint">{hint}</span>}
      </span>
      <span className="input-wrap">
        {icon && <span className="input-icon">{icon}</span>}
        <input {...input} aria-invalid={Boolean(error)} />
        {trailing}
      </span>
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

export function PasswordField({
  label = "Password",
  value,
  onChange,
  autoComplete,
  error,
  hint,
  showStrength = false,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  error?: string;
  hint?: ReactNode;
  showStrength?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [caps, setCaps] = useState(false);
  return (
    <div>
      <Field
        label={label}
        hint={hint}
        icon={<Lock size={16} />}
        type={visible ? "text" : "password"}
        value={value}
        autoComplete={autoComplete}
        error={error}
        required
        onChange={(e) => onChange(e.target.value)}
        onKeyUp={(e) => setCaps(e.getModifierState("CapsLock"))}
        onKeyDown={(e) => setCaps(e.getModifierState("CapsLock"))}
        trailing={
          <button
            type="button"
            className="input-trailing"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide password" : "Show password"}
            tabIndex={-1}
          >
            {visible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        }
      />
      {caps && (
        <p className="caps-warning">
          <AlertTriangle size={13} /> Caps Lock is on
        </p>
      )}
      {showStrength && value && <StrengthMeter password={value} />}
    </div>
  );
}

export function passwordScore(password: string) {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(score, 4);
}

const STRENGTH = ["Too weak", "Weak", "Fair", "Good", "Strong"];

function StrengthMeter({ password }: { password: string }) {
  const score = password.length < 8 ? 0 : Math.max(passwordScore(password), 1);
  return (
    <div className={`strength s${score}`}>
      <div className="strength-bars">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={i <= score ? "on" : ""} />
        ))}
      </div>
      <span>{password.length < 8 ? `${8 - password.length} more characters` : STRENGTH[score]}</span>
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden />;
}
