import React from "react";

export default function Card({ children, title, subtitle, footer, className = "", style = {} }) {
  return (
    <div className={`card ${className}`} style={style}>
      {title && (
        <div style={{ marginBottom: 8 }} className="card-header">
          <strong>{title}</strong>
          {subtitle && <div style={{ fontSize: "0.9rem", color: "#c4b5fd" }}>{subtitle}</div>}
        </div>
      )}
      <div className="card-body">{children}</div>
      {footer && <div className="card-footer" style={{ marginTop: 10 }}>{footer}</div>}
    </div>
  );
}
