import type { ComponentProps, ReactNode } from "react";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

const BUTTON = {
  primary: "bg-(--accent) text-white hover:opacity-90 border border-transparent",
  outline: "border border-stone-300 bg-white text-stone-800 hover:bg-stone-50",
  ghost: "border border-transparent text-stone-600 hover:bg-stone-100 hover:text-stone-900",
} as const;

export type ButtonVariant = keyof typeof BUTTON;

const buttonClass = (variant: ButtonVariant, className?: string) =>
  cn(
    "inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition disabled:pointer-events-none disabled:opacity-40",
    BUTTON[variant],
    className,
  );

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button type="button" className={buttonClass(variant, className)} {...props} />;
}

const TONE = {
  neutral: "bg-stone-100 text-stone-700 ring-stone-200",
  green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  blue: "bg-sky-50 text-sky-800 ring-sky-200",
} as const;

export type Tone = keyof typeof TONE;

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        TONE[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-xl border border-stone-200 bg-white", className)} {...props} />;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-sm font-semibold text-stone-900">{children}</h2>;
}

export function Muted({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-xs text-stone-500", className)} {...props} />;
}

export const inputClass =
  "w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none";

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "short", timeStyle: "short" });

export function formatDate(d: Date) {
  return dateFormat.format(d);
}
