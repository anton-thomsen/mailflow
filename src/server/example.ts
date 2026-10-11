import type { Content } from "~/domain/email";
import type { WorkflowDefinition } from "~/domain/workflow";

// The failed-payment sequence a fresh install starts with. Hosts edit or replace it in the admin UI.
export const exampleWorkflow: WorkflowDefinition = {
  slug: "failed-payment",
  name: "Failed payment follow-up",
  trigger: "payment_failed",
  stopOn: ["payment_succeeded"],
  // Every email is preceded by a check, so a payment the host already knows about (an event that
  // arrived out of order, or was lost) never gets a failed-payment email.
  steps: [
    {
      id: "unpaid-at-start",
      kind: "check",
      check: "payment-settled",
      yes: [],
      no: [
        { id: "first-notice", kind: "send", template: "payment-failed" },
        { id: "wait-3d", kind: "wait", duration: { amount: 3, unit: "days" } },
        {
          id: "paid-after-3d",
          kind: "check",
          check: "payment-settled",
          yes: [],
          no: [
            { id: "reminder", kind: "send", template: "payment-reminder" },
            { id: "wait-4d", kind: "wait", duration: { amount: 4, unit: "days" } },
            {
              id: "paid-after-7d",
              kind: "check",
              check: "payment-settled",
              yes: [],
              no: [{ id: "last-notice", kind: "send", template: "payment-last-notice" }],
            },
          ],
        },
      ],
    },
  ],
};

export const exampleTemplates: { slug: string; name: string; subject: string; content: Content }[] = [
  {
    slug: "payment-failed",
    name: "Your payment didn't go through",
    subject: "We couldn't take your payment",
    content: {
      kind: "blocks",
      blocks: [
        { type: "heading", text: "Hi {{ first_name | there }}," },
        {
          type: "text",
          text: "We tried to take your latest payment, but it didn't go through. This usually happens when a card has expired.",
        },
        { type: "text", text: "You can update your card in a minute, and everything continues as normal." },
        { type: "button", label: "Update payment", href: "{{ payment_link }}" },
        { type: "small", text: "Questions? Just reply to this email." },
      ],
    },
  },
  {
    slug: "payment-reminder",
    name: "Reminder: update your card",
    subject: "A quick reminder about your payment",
    content: {
      kind: "blocks",
      blocks: [
        { type: "heading", text: "A quick reminder, {{ first_name | there }}" },
        { type: "text", text: "Your last payment still hasn't gone through. Update your card and nothing changes." },
        { type: "button", label: "Update payment", href: "{{ payment_link }}" },
        { type: "divider" },
        { type: "small", text: "Already updated it? Then you can ignore this email." },
      ],
    },
  },
  {
    slug: "payment-last-notice",
    name: "Last notice",
    subject: "Your payment is still outstanding",
    content: {
      kind: "blocks",
      blocks: [
        { type: "heading", text: "Hi {{ first_name | there }}, your payment is still open" },
        {
          type: "text",
          text: "We still haven't been able to take your payment. Please update your card, or reply to this email if something is wrong.",
        },
        { type: "button", label: "Update payment", href: "{{ payment_link }}" },
      ],
    },
  },
];
