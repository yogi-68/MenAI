"use client";

import { useCallback, useEffect, useState } from "react";
import {
  requestSignupConfirmationEmail,
  RESEND_SUCCESS_MESSAGE,
} from "@/lib/auth/request-confirmation-email";
import {
  canResendNow,
  getResendCooldownSeconds,
  markResendCooldown,
} from "@/lib/auth/resend-cooldown";

type ResendConfirmationProps = {
  email: string;
  loading?: boolean;
  onLoadingChange?: (loading: boolean) => void;
  className?: string;
  style?: React.CSSProperties;
  buttonClassName?: string;
};

export function ResendConfirmationAction({
  email,
  loading: externalLoading,
  onLoadingChange,
  className,
  style,
  buttonClassName = "btn-secondary",
}: ResendConfirmationProps) {
  const [notice, setNotice] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [internalLoading, setInternalLoading] = useState(false);
  const loading = externalLoading || internalLoading;

  useEffect(() => {
    const tick = () => setCooldown(getResendCooldownSeconds(email));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [email]);

  const handleResend = useCallback(async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setNotice("Enter your email above first.");
      return;
    }

    if (!canResendNow(trimmed)) {
      setNotice("Check your inbox and spam folder — a link was sent recently.");
      return;
    }

    setInternalLoading(true);
    onLoadingChange?.(true);
    setNotice("");

    try {
      await requestSignupConfirmationEmail(trimmed);
      markResendCooldown(trimmed);
      setCooldown(getResendCooldownSeconds(trimmed));

      // The endpoint answers identically whatever happened, so that this page
      // cannot be used to test whether an address has an account. There is
      // nothing to branch on here, by design.
      setNotice(RESEND_SUCCESS_MESSAGE);
    } catch {
      setNotice(
        "Check your inbox — a confirmation link may already be on its way."
      );
    } finally {
      setInternalLoading(false);
      onLoadingChange?.(false);
    }
  }, [email, onLoadingChange]);

  return (
    <div className={className} style={style}>
      {notice && (
        <p
          style={{
            color: notice.includes("already confirmed") ? "var(--accent-primary)" : "#22c55e",
            fontSize: "0.9rem",
            lineHeight: 1.6,
            marginBottom: "12px",
          }}
        >
          {notice}
        </p>
      )}
      <button
        type="button"
        onClick={handleResend}
        disabled={loading || cooldown > 0}
        className={buttonClassName}
        style={{ width: "100%" }}
      >
        {loading
          ? "Sending..."
          : cooldown > 0
            ? `Resend available in ${cooldown}s`
            : "Resend confirmation email"}
      </button>
    </div>
  );
}
