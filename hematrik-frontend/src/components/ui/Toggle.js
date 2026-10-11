import React from "react";

export default function Toggle({ checked, onChange, label, disabled = false }) {
  return (
    <label className={disabled ? "toggle toggle--disabled" : "toggle"}>
      <span className="toggle__label">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange?.(e.target.checked)}
        disabled={disabled}
        className="toggle__input"
      />
      <span className="toggle__track" aria-hidden="true">
        <span className="toggle__thumb" />
      </span>
    </label>
  );
}
