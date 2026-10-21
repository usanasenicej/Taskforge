import { useRef } from "react";

export const OTP_LENGTH = 6;

export function emptyOtp() {
  return Array<string>(OTP_LENGTH).fill("");
}

/** Six single-digit boxes with paste/autofill support. Calls onComplete when every box is filled. */
export function OtpInput({
  value,
  onChange,
  onComplete,
  disabled,
  state,
  autoFocus = true,
}: {
  value: string[];
  onChange: (digits: string[]) => void;
  onComplete?: (code: string) => void;
  disabled?: boolean;
  state?: "invalid" | "valid";
  autoFocus?: boolean;
}) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const setAt = (index: number, raw: string) => {
    const clean = raw.replace(/\D/g, "");
    if (clean.length > 1) {
      // Pasted or autofilled the whole code.
      const chars = clean.slice(0, OTP_LENGTH).split("");
      const next = [...chars, ...Array(OTP_LENGTH - chars.length).fill("")];
      onChange(next);
      inputs.current[Math.min(chars.length, OTP_LENGTH - 1)]?.focus();
      if (chars.length === OTP_LENGTH) onComplete?.(chars.join(""));
      return;
    }
    const next = value.slice();
    next[index] = clean;
    onChange(next);
    if (clean && index < OTP_LENGTH - 1) inputs.current[index + 1]?.focus();
    if (next.every(Boolean)) onComplete?.(next.join(""));
  };

  return (
    <div className={`otp ${state ?? ""}`}>
      {value.map((digit, i) => (
        <input
          key={i}
          ref={(el) => (inputs.current[i] = el)}
          value={digit}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          autoFocus={autoFocus && i === 0}
          maxLength={OTP_LENGTH}
          aria-label={`Digit ${i + 1}`}
          disabled={disabled}
          onChange={(e) => setAt(i, e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !digit && i > 0) inputs.current[i - 1]?.focus();
            if (e.key === "ArrowLeft" && i > 0) inputs.current[i - 1]?.focus();
            if (e.key === "ArrowRight" && i < OTP_LENGTH - 1) inputs.current[i + 1]?.focus();
          }}
        />
      ))}
    </div>
  );
}

export function focusFirstOtp(container: HTMLElement | null) {
  container?.querySelector<HTMLInputElement>(".otp input")?.focus();
}
