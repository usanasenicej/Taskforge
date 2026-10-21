import { Check, Copy, Download, ExternalLink, KeyRound, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api/client";
import type { TwoFactorSetup as SetupInfo } from "../api/types";
import { Modal } from "./Modal";
import { OtpInput, emptyOtp, focusFirstOtp } from "./OtpInput";

type Step = "key" | "confirm" | "codes";

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn ghost sm"
      onClick={() => {
        void navigator.clipboard?.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? "Copied" : label}
    </button>
  );
}

export function EnableTwoFactorModal({ onClose, onEnabled }: { onClose: () => void; onEnabled: () => void }) {
  const [step, setStep] = useState<Step>("key");
  const [setup, setSetup] = useState<SetupInfo | null>(null);
  const [digits, setDigits] = useState<string[]>(emptyOtp);
  const [codes, setCodes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const confirmStep = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .twoFactorSetup()
      .then(setSetup)
      .catch((err) => setError(err instanceof ApiError ? err.detail : "Couldn't start setup"));
  }, []);

  const confirm = async (code: string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.twoFactorEnable(code);
      setCodes(res.recovery_codes);
      setStep("codes");
      onEnabled();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Couldn't verify the code");
      setDigits(emptyOtp());
      window.setTimeout(() => focusFirstOtp(confirmStep.current));
    } finally {
      setBusy(false);
    }
  };

  const grouped = setup?.secret.match(/.{1,4}/g)?.join(" ") ?? "";
  const codesText = `TaskForge recovery codes\nEach code can be used once.\n\n${codes.join("\n")}\n`;

  return (
    <Modal
      title={step === "codes" ? "Save your recovery codes" : "Turn on two-factor authentication"}
      subtitle={
        step === "key"
          ? "Step 1 of 2 · Add TaskForge to your authenticator app"
          : step === "confirm"
            ? "Step 2 of 2 · Confirm it works"
            : "If you lose your phone, these are the only way back into your account."
      }
      width={520}
      // Closing on the codes step would lose them; make the user acknowledge first.
      onClose={step === "codes" && !saved ? () => undefined : onClose}
      footer={
        step === "key" ? (
          <>
            <button className="btn ghost" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" type="button" disabled={!setup} onClick={() => setStep("confirm")}>
              I've added it
            </button>
          </>
        ) : step === "confirm" ? (
          <>
            <button className="btn ghost" type="button" onClick={() => setStep("key")}>
              Back
            </button>
            <button className="btn primary" type="button" disabled={busy || digits.some((d) => !d)} onClick={() => confirm(digits.join(""))}>
              {busy ? "Verifying…" : "Turn on 2FA"}
            </button>
          </>
        ) : (
          <>
            <label className="check">
              <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
              I've saved these codes somewhere safe
            </label>
            <span className="spacer" />
            <button className="btn primary" type="button" disabled={!saved} onClick={onClose}>
              Done
            </button>
          </>
        )
      }
    >
      {error && <div className="alert error" style={{ marginBottom: 14 }}>{error}</div>}

      {step === "key" && (
        <div className="tfa-step">
          <ol className="tfa-list">
            <li>
              Open an authenticator app — Google Authenticator, Microsoft Authenticator, 1Password, Authy…
            </li>
            <li>
              Choose <strong>Add account</strong> → <strong>Enter a setup key</strong>, and use the key below.
              The type is <strong>Time-based</strong>.
            </li>
          </ol>
          {setup ? (
            <>
              <div className="secret-box">
                <span className="secret-label">Setup key</span>
                <code className="secret">{grouped}</code>
                <CopyButton text={setup.secret} />
              </div>
              <a className="otpauth-link" href={setup.otpauth_uri}>
                <ExternalLink size={14} /> On this phone? Open in your authenticator app
              </a>
            </>
          ) : (
            !error && <div className="skeleton" style={{ height: 64 }} />
          )}
        </div>
      )}

      {step === "confirm" && (
        <div className="tfa-step" ref={confirmStep}>
          <p className="muted">Enter the 6-digit code your app shows for TaskForge.</p>
          <OtpInput value={digits} onChange={setDigits} onComplete={confirm} disabled={busy} state={error ? "invalid" : undefined} />
        </div>
      )}

      {step === "codes" && (
        <div className="tfa-step">
          <div className="alert success tfa-on">
            <ShieldCheck size={16} /> Two-factor authentication is on.
          </div>
          <ul className="recovery-grid">
            {codes.map((code) => (
              <li key={code}>
                <code>{code}</code>
              </li>
            ))}
          </ul>
          <div className="row">
            <CopyButton text={codesText} label="Copy all" />
            <a
              className="btn ghost sm"
              download="taskforge-recovery-codes.txt"
              href={`data:text/plain;charset=utf-8,${encodeURIComponent(codesText)}`}
            >
              <Download size={14} /> Download .txt
            </a>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function DisableTwoFactorModal({ onClose, onDisabled }: { onClose: () => void; onDisabled: () => void }) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      title="Turn off two-factor authentication?"
      subtitle="Your account will be protected by your password only."
      width={440}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn danger" type="submit" form="disable-2fa" disabled={busy || !password || code.trim().length < 6}>
            {busy ? "Turning off…" : "Turn off 2FA"}
          </button>
        </>
      }
    >
      <form
        id="disable-2fa"
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api.twoFactorDisable(password, code.trim());
            onDisabled();
            onClose();
          } catch (err) {
            setError(err instanceof ApiError ? err.detail : "Couldn't turn off 2FA");
            setBusy(false);
          }
        }}
      >
        {error && <div className="alert error">{error}</div>}
        <label className="field">
          <span className="field-label">Password</span>
          <input type="password" value={password} autoFocus autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">
            Authenticator or recovery code <KeyRound size={13} className="muted" />
          </span>
          <input className="mono" value={code} autoComplete="one-time-code" placeholder="123456" onChange={(e) => setCode(e.target.value)} />
        </label>
      </form>
    </Modal>
  );
}
