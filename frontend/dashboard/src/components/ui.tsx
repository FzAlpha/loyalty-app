// Small, plain building blocks (Tailwind). Black/gold brand colours come from globals.css tokens.
"use client";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { strings } from "@/lib/strings";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-gold-light">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-panel p-5">
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="text-base font-semibold text-gold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "plain" | "danger"; loading?: boolean };
export function Button({ tone = "primary", loading, children, className = "", disabled, ...rest }: BtnProps) {
  const toneCls = {
    primary: "bg-gold text-black hover:bg-gold-light",
    plain: "border border-line text-fg hover:border-gold",
    danger: "border border-danger text-danger hover:bg-danger hover:text-black",
  }[tone];
  return (
    <button {...rest} disabled={disabled || loading}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${toneCls} ${className}`}>
      {loading ? strings.common.loading : children}
    </button>
  );
}

const fieldCls = "mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-gold";

export function Field({ label, hint, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block text-sm text-muted">
      {label}
      <input {...rest} className={fieldCls} />
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function TextArea({ label, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className="block text-sm text-muted">
      {label}
      <textarea rows={3} {...rest} className={fieldCls} />
    </label>
  );
}

export function Select({ label, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="block text-sm text-muted">
      {label}
      <select {...rest} className={fieldCls}>{children}</select>
    </label>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="my-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/60 bg-danger/10 px-4 py-3 text-sm text-danger">
      <span>{message}</span>
      {onRetry && <Button tone="plain" onClick={onRetry}>{strings.common.retry}</Button>}
    </div>
  );
}

export function Notice({ message }: { message: string }) {
  return <div role="status" className="my-3 rounded-lg border border-gold/50 bg-gold/10 px-4 py-3 text-sm text-gold-light">{message}</div>;
}

export function Loading() {
  return <p className="py-6 text-sm text-muted">{strings.common.loading}</p>;
}

export function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-gold-light">{value}</div>
    </div>
  );
}

export function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: "ok" | "muted" | "warn" }) {
  const cls = { ok: "border-ok text-ok", muted: "border-line text-muted", warn: "border-gold text-gold" }[tone];
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${cls}`}>{children}</span>;
}

// Modal dialog for create/edit forms.
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="mt-10 w-full max-w-xl rounded-xl border border-line bg-panel p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gold-light">{title}</h2>
          <button onClick={onClose} className="text-sm text-muted hover:text-fg">{strings.common.close}</button>
        </div>
        {children}
      </div>
    </div>
  );
}
