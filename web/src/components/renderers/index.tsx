"use client";

import type { QuestionPartForStudent } from "@/lib/schemas/question";
import {
  codeStimulusConfigSchema,
  multiSelectConfigSchema,
  richTextConfigSchema,
  shortTextConfigSchema,
  singleChoiceConfigSchema,
  type ResponsePayload,
} from "@/lib/schemas/renderers";

import { CodeBlock } from "../exam/stimulus";
import { MultiSelect } from "./multi-select";
import { RichTextResponse } from "./rich-text-response";
import { ShortText } from "./short-text";
import { SingleChoice } from "./single-choice";

/**
 * Dispatches a validated question specification to a component.
 *
 * A renderer whose config fails its schema is reported in place rather than
 * throwing — a single malformed question must not take the whole paper down
 * mid-attempt.
 */

export type RendererProps = {
  part: QuestionPartForStudent;
  value: ResponsePayload | null;
  onChange: (value: ResponsePayload) => void;
  disabled: boolean;
};

export function QuestionRenderer({ part, value, onChange, disabled }: RendererProps) {
  switch (part.rendererType) {
    case "single_choice": {
      const config = singleChoiceConfigSchema.safeParse(part.config);
      if (!config.success) return <ConfigError part={part} />;
      return (
        <SingleChoice
          partId={part.id}
          options={config.data.options}
          value={value?.rendererType === "single_choice" ? value.optionId : null}
          onChange={(optionId) =>
            onChange({ rendererType: "single_choice", optionId })
          }
          disabled={disabled}
        />
      );
    }

    case "multi_select": {
      const config = multiSelectConfigSchema.safeParse(part.config);
      if (!config.success) return <ConfigError part={part} />;
      return (
        <MultiSelect
          partId={part.id}
          options={config.data.options}
          selectionHint={config.data.selectionHint}
          value={value?.rendererType === "multi_select" ? value.optionIds : []}
          onChange={(optionIds) =>
            onChange({ rendererType: "multi_select", optionIds })
          }
          disabled={disabled}
        />
      );
    }

    case "short_text": {
      const config = shortTextConfigSchema.safeParse(part.config);
      if (!config.success) return <ConfigError part={part} />;
      return (
        <ShortText
          partId={part.id}
          config={config.data}
          value={value?.rendererType === "short_text" ? value.text : ""}
          onChange={(text) => onChange({ rendererType: "short_text", text })}
          disabled={disabled}
        />
      );
    }

    case "rich_text_response": {
      const config = richTextConfigSchema.safeParse(part.config);
      if (!config.success) return <ConfigError part={part} />;
      return (
        <RichTextResponse
          partId={part.id}
          config={config.data}
          value={value?.rendererType === "rich_text_response" ? value.html : ""}
          onChange={(html) => onChange({ rendererType: "rich_text_response", html })}
          disabled={disabled}
        />
      );
    }

    case "code_stimulus": {
      const config = codeStimulusConfigSchema.safeParse(part.config);
      if (!config.success) return <ConfigError part={part} />;
      return (
        <CodeBlock
          code={config.data.code}
          caption={config.data.caption}
          showLineNumbers={config.data.showLineNumbers ?? true}
        />
      );
    }

    default:
      return (
        <p className="border border-[var(--exam-line)] p-3 text-[0.9em]">
          This question uses the {part.rendererType} response type, which is not
          available in this build.
        </p>
      );
  }
}

function ConfigError({ part }: { part: QuestionPartForStudent }) {
  return (
    <p className="border border-[var(--exam-line)] p-3 text-[0.9em]">
      This question could not be displayed ({part.rendererType}). Report it and
      generate a new paper.
    </p>
  );
}
