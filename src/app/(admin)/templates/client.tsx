"use client";

import { useActionState, useState } from "react";
import { Button, type ButtonVariant, cn, inputClass } from "../../_components/ui";
import type { ActionResult } from "../actions";

type FormAction = (state: ActionResult, form: FormData) => Promise<ActionResult>;

export function ActionButton({
  action,
  fields,
  label,
  pendingLabel,
  variant = "primary",
}: {
  action: FormAction;
  fields: Record<string, string | number>;
  label: string;
  pendingLabel: string;
  variant?: ButtonVariant;
}) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <form action={run} className="flex flex-col items-end gap-1">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Button type="submit" variant={variant} disabled={pending}>
        {pending ? pendingLabel : label}
      </Button>
      {state ? <ResultText state={state} /> : null}
    </form>
  );
}

function ResultText({ state }: { state: NonNullable<ActionResult> }) {
  return (
    <p role="status" className={cn("max-w-xs text-right text-xs", state.ok ? "text-emerald-700" : "text-red-700")}>
      {state.message}
    </p>
  );
}

export function PasteHtmlForm({ action }: { action: FormAction }) {
  const [open, setOpen] = useState(false);
  const [state, run, pending] = useActionState(action, null);
  if (!open) {
    return (
      <Button variant="outline" className="mt-3" onClick={() => setOpen(true)}>
        Paste HTML
      </Button>
    );
  }
  return (
    <form action={run} className="mt-3 flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <input name="name" placeholder="Name" aria-label="Name" className={inputClass} required />
        <input name="slug" placeholder="slug-like-this" aria-label="Slug" className={inputClass} required />
      </div>
      <input name="subject" placeholder="Subject" aria-label="Subject" className={inputClass} required />
      <textarea
        name="html"
        rows={6}
        placeholder="<html>…</html>"
        aria-label="HTML"
        className={cn(inputClass, "font-mono text-xs")}
        required
      />
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save as draft"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        {state && !state.ok ? <p className="text-xs text-red-700">{state.message}</p> : null}
      </div>
    </form>
  );
}

const SKILL_PROMPT = `Use the write-email skill to write a mailflow email template.
mailflow is at <your mailflow URL>. Read the brand and merge fields from its API first.
The email is for: <what happened and what the reader should do>.
Upload it as a draft when I've approved the subject and blocks.`;

export function CopyPromptButton() {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      className="mt-3"
      onClick={async () => {
        await navigator.clipboard.writeText(SKILL_PROMPT);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? "Copied" : "Copy skill prompt"}
    </Button>
  );
}
