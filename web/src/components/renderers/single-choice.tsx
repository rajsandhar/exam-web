"use client";

type Option = { id: string; text: string };

export function SingleChoice({
  partId,
  options,
  value,
  onChange,
  disabled,
}: {
  partId: string;
  options: Option[];
  value: string | null;
  onChange: (optionId: string) => void;
  disabled: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="mt-3">
      <legend className="sr-only">Select one response</legend>
      <ul className="space-y-0.5">
        {options.map((option) => (
          <li key={option.id}>
            <label
              className={`flex cursor-pointer items-start gap-3 px-1 py-1.5 ${
                disabled ? "cursor-not-allowed opacity-60" : ""
              }`}
            >
              <input
                type="radio"
                name={`part-${partId}`}
                value={option.id}
                checked={value === option.id}
                onChange={() => onChange(option.id)}
                disabled={disabled}
                className="mt-1 h-4 w-4 shrink-0 accent-[var(--exam-accent)]"
              />
              <span className="leading-relaxed">{option.text}</span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
