import React from "react";

const ICON_MAP = {
    success: "✅",
    error: "❌",
    info: "ℹ️",
};

export function ToastContainer({ toasts, onRemove }) {
    if (!toasts.length) return null;
    return (
        <div className="toast-container" aria-live="polite">
            {toasts.map((t) => (
                <div
                    key={t.id}
                    className={`toast ${t.type}`}
                    role="alert"
                    onClick={() => onRemove(t.id)}
                    style={{ cursor: "pointer" }}
                >
                    <span className="toast-icon">{ICON_MAP[t.type] || "💬"}</span>
                    <span>{t.message}</span>
                </div>
            ))}
        </div>
    );
}
