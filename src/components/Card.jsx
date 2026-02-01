import React from "react";
import CustomDropdown from "./CustomDropdown";
import "../global.css";

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "user", label: "User" },
];

export default function Card({
  children,
  title,
  subtitle,
  footer,
  className = "",
  style = {},
  onRoleChange,
  selectedRole,
}) {
  return (
    <div className={`card ${className}`} style={style}>
      {title && (
        <div style={{ marginBottom: 8 }} className="card-header">
          <strong>{title}</strong>
          {subtitle && (
            <div style={{ fontSize: "0.9rem", color: "#c4b5fd" }}>
              {subtitle}
            </div>
          )}
        </div>
      )}
      <div className="card-body">{children}</div>
      {footer && (
        <div className="card-footer" style={{ marginTop: 10 }}>
          {footer}
          <CustomDropdown
            options={ROLE_OPTIONS}
            selected={selectedRole}
            onChange={onRoleChange}
            placeholder="Select Role"
          />
        </div>
      )}
    </div>
  );
}
