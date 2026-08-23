"use client";

type Option = { id: string; text: string };

export function MultiSelect({
  partId,
  options,
  selectionHint,
  value,
  onChange,
  disabled,
}: {
  partId: string;
  options: Option[];
  selectionHint?: string;
  value: string[];
  onChange: (optionIds: string[]) => void;
  disabled: boolean;
}) {
  const selected = new Set(value);

  function toggle(id: string, on: boolean) {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    onChange(options.filter((o) => next.has(o.id)).map((o) => o.id));
  }

  return (
    <fieldset disabled={disabled} className="mt-3">
      <legend className="mb-1 font-semibold">
        {selectionHint ?? "Select all that apply."}
      </legend>
      <ul className="space-y-0.5">
        {options.map((option) => (
          <li key={option.id}>
            <label
              className={`flex cursor-pointer items-start gap-3 px-1 py-1.5 ${
                disabled ? "cursor-not-allowed opacity-60" : ""
              }`}
            >
              <input
                type="checkbox"
                name={`part-${partId}`}
                value={option.id}
                checked={selected.has(option.id)}
                onChange={(event) => toggle(option.id, event.target.checked)}
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
