// Small form controls: a labelled slider and a row of selectable tiles.

import type { ReactNode } from 'react';

export function SectionLabel({ children }: { children: ReactNode }) {
  return <h3 className="section-label">{children}</h3>;
}

export interface SliderProps {
  label: string;
  value: number;
  /** The allowed values, in order (they needn't be evenly spaced). */
  values: readonly number[];
  format?: (v: number) => string;
  formatTick?: (v: number) => string;
  onChange: (v: number) => void;
}

/** A slider over a list of values, with a tick and label for each. The range input moves
 *  over the list's positions, so uneven (log-ish) values are evenly spaced on screen. */
export function Slider({ label, value, values, format = String, formatTick = String, onChange }: SliderProps) {
  const index = Math.max(0, values.indexOf(value));
  return (
    <label className="slider">
      <span className="row spread small">
        <span className="dim">{label}</span>
        <span>{format(value)}</span>
      </span>
      <input
        type="range"
        min={0}
        max={values.length - 1}
        step={1}
        value={index}
        onChange={(e) => onChange(values[Number(e.target.value)]!)}
      />
      <span className="ticks" aria-hidden="true">
        {values.map((t) => (
          <span key={t} className={t === value ? 'tick active' : 'tick'}>
            {formatTick(t)}
          </span>
        ))}
      </span>
    </label>
  );
}

export interface TileOption<T> {
  value: T;
  label: string;
  disabled?: boolean;
}

export function Tiles<T extends string | boolean>({
  options,
  value,
  onChange,
  label,
}: {
  options: TileOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="tiles" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'tile selected' : 'tile'}
          disabled={o.disabled}
          title={o.disabled ? 'Coming later' : undefined}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A square on/off switch (pixel-style take on an iOS toggle), with a label and optional note. */
export function Toggle({
  label,
  checked,
  onChange,
  disabled = false,
  note,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  note?: string;
}) {
  return (
    <label className={disabled ? 'toggle-row disabled' : 'toggle-row'}>
      <span>
        {label}
        {note && <span className="soon"> {note}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={checked ? 'toggle on' : 'toggle'}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span className="knob" />
      </button>
    </label>
  );
}
