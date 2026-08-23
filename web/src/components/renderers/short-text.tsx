"use client";

import type { z } from "zod";

import type { shortTextConfigSchema } from "@/lib/schemas/renderers";

type Config = z.infer<typeof shortTextConfigSchema>;

export function ShortText({
  partId,
  config,
  value,
  onChange,
  disabled,
}: {
  partId: string;
  config: Config;
  value: string;
  onChange: (text: string) => void;
  disabled: boolean;
}) {
  const shared = {
    id: `response-${partId}`,
    value,
    disabled,
    placeholder: config.placeholder,
    maxLength: config.maxLength,
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => onChange(event.target.value),
    className:
      "mt-3 w-full border border-[var(--exam-line)] bg-[var(--exam-input-bg)] px-3 py-2 font-sans text-[1em] text-[var(--exam-fg)] outline-none disabled:opacity-60",
  };

  return config.multiline ? (
    <textarea {...shared} rows={4} aria-label="Your response" />
  ) : (
    <input {...shared} type="text" aria-label="Your response" />
  );
}
