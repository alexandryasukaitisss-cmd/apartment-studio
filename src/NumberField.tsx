import { useEffect, useState } from 'react';

export default function NumberField({ label, value, onChange, min, max, step = 1, unit = 'см' }: { label: string; value: number; onChange: (n: number) => boolean | void; min: number; max: number; step?: number; unit?: string }) {
  const displayed = String(Math.round(value * 100) / 100);
  const [draft, setDraft] = useState(displayed);
  useEffect(() => setDraft(displayed), [displayed]);
  return <label className="field">
    <span>
      {label}
    </span>
    <span className="number-wrap">
      <input aria-label={label} type="number" min={min} max={max} step={step} value={draft} onChange={e => {
        setDraft(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== '' && Number.isFinite(n) && n >= min && n <= max && onChange(n) === false)
          setDraft(displayed)
      }} onBlur={() => {
        const n = Number(draft);
        if (draft === '' || !Number.isFinite(n) || n < min || n > max)
          setDraft(displayed)
      }} />
      <small>
        {unit}
      </small>
    </span>
  </label>
}
