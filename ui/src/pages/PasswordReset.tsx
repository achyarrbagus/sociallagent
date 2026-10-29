import { useState, type FormEvent, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useSearchParams } from "@/lib/router";
import { authApi } from "../api/auth";
import { Button } from "@/components/ui/button";
import { PaperclipLockup } from "../components/PaperclipLockup";

const INPUT_CLASS = "w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50";

function AuthCard({ title, lede, children }: { title: string; lede: string; children: ReactNode }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-y-auto bg-background px-8 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8"><PaperclipLockup className="h-5 w-auto" /></div>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{lede}</p>
        <div className="mt-6">{children}</div>
        <p className="mt-5 text-sm text-muted-foreground">
          <Link to="/auth" className="font-medium text-foreground underline underline-offset-2">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}

/** Asks for an email and sends a reset link. Always answers the same way, so it cannot reveal which emails have accounts. */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const request = useMutation({
    mutationFn: () => authApi.requestPasswordReset({ email: email.trim(), redirectTo: `${window.location.origin}/auth/reset-password` }),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (email.trim() && !request.isPending) request.mutate();
  };
  return (
    <AuthCard title="Reset your password" lede="Enter your account email and we will send you a link to choose a new password.">
      {request.isSuccess ? (
        <p role="status" className="text-sm">If an account exists for {email.trim()}, a reset link is on its way. Check your inbox.</p>
      ) : (
        <form className="space-y-4" onSubmit={submit}>
          <div>
            <label htmlFor="reset-email" className="mb-1 block text-xs text-muted-foreground">Email</label>
            <input id="reset-email" type="email" required autoFocus autoComplete="username" className={INPUT_CLASS} value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          {request.error && <p role="alert" className="text-xs text-destructive">{request.error instanceof Error ? request.error.message : "Could not send the link."}</p>}
          <Button type="submit" className="w-full" disabled={!email.trim() || request.isPending}>{request.isPending ? "Sending…" : "Send reset link"}</Button>
        </form>
      )}
    </AuthCard>
  );
}

/** Opened from the emailed link: sets a new password with the token in the URL. */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const linkError = params.get("error");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const reset = useMutation({ mutationFn: () => authApi.resetPassword({ token: token!, newPassword: password }) });
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = Boolean(token) && password.length >= 8 && password === confirm && !reset.isPending;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (canSubmit) reset.mutate();
  };

  if (!token || linkError) {
    return (
      <AuthCard title="This link no longer works" lede="Reset links expire after an hour and can be used once.">
        <Link to="/auth/forgot-password" className="text-sm font-medium underline underline-offset-2">Send a new link</Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Choose a new password" lede="Use at least 8 characters.">
      {reset.isSuccess ? (
        <p role="status" className="text-sm">Your password was changed. Sign in with your new password.</p>
      ) : (
        <form className="space-y-4" onSubmit={submit}>
          <div>
            <label htmlFor="new-password" className="mb-1 block text-xs text-muted-foreground">New password</label>
            <input id="new-password" type="password" required autoFocus minLength={8} autoComplete="new-password" className={INPUT_CLASS} value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>
          <div>
            <label htmlFor="confirm-password" className="mb-1 block text-xs text-muted-foreground">Confirm new password</label>
            <input id="confirm-password" type="password" required autoComplete="new-password" className={INPUT_CLASS} value={confirm} onChange={(event) => setConfirm(event.target.value)} aria-invalid={mismatch || undefined} />
          </div>
          {mismatch && <p role="alert" className="text-xs text-destructive">The passwords do not match.</p>}
          {reset.error && <p role="alert" className="text-xs text-destructive">{reset.error instanceof Error ? reset.error.message : "Could not change the password."}</p>}
          <Button type="submit" className="w-full" disabled={!canSubmit}>{reset.isPending ? "Saving…" : "Change password"}</Button>
        </form>
      )}
    </AuthCard>
  );
}
