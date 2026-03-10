import React from "react";

function formatDate(dateStr) {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function getInitials(name) {
    if (!name) return "?";
    const parts = name.trim().split(" ");
    return parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : name[0].toUpperCase();
}

function StatusBadge({ value, label }) {
    const val = (value || "").toLowerCase();
    let cls = "default";
    if (["paid", "fulfilled"].includes(val)) cls = val;
    else if (["pending", "partial"].includes(val)) cls = val;
    else if (["refunded", "voided"].includes(val)) cls = "refunded";
    else if (["unfulfilled"].includes(val)) cls = "unfulfilled";
    return (
        <span className={`status-badge ${cls}`}>{label || value || "—"}</span>
    );
}

export function OrderCard({ order, onCancel, style }) {
    return (
        <div className="order-card" style={style}>
            {/* Header */}
            <div className="order-card-header">
                <span className="order-number-badge">
                    #{order.orderNumber || order.id.slice(-6)}
                </span>
                <div className="order-status-badges">
                    <StatusBadge value={order.financialStatus} />
                    <StatusBadge value={order.fulfillmentStatus} />
                </div>
            </div>

            {/* Customer */}
            <div className="order-customer">
                <div className="order-avatar">{getInitials(order.customerName)}</div>
                <div>
                    <div className="order-customer-name">
                        {order.customerName || "Guest"}
                    </div>
                    <div className="order-customer-email" title={order.customerEmail}>
                        {order.customerEmail || "No email"}
                    </div>
                </div>
            </div>

            <div className="order-divider" />

            {/* Meta */}
            <div className="order-meta">
                <div className="order-meta-item">
                    <span className="order-meta-label">Total</span>
                    <span className="order-meta-value order-price">
                        ${parseFloat(order.totalPrice || 0).toFixed(2)}{" "}
                        <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.7 }}>
                            {order.currency || "USD"}
                        </span>
                    </span>
                </div>
                <div className="order-meta-item">
                    <span className="order-meta-label">Items</span>
                    <span className="order-meta-value">
                        {order.lineItemsCount ?? "—"} item
                        {order.lineItemsCount !== 1 ? "s" : ""}
                    </span>
                </div>
                <div className="order-meta-item">
                    <span className="order-meta-label">Payment</span>
                    <span className="order-meta-value" style={{ textTransform: "capitalize" }}>
                        {order.financialStatus || "—"}
                    </span>
                </div>
                <div className="order-meta-item">
                    <span className="order-meta-label">Fulfillment</span>
                    <span className="order-meta-value" style={{ textTransform: "capitalize" }}>
                        {order.fulfillmentStatus || "—"}
                    </span>
                </div>
            </div>

            {/* Footer */}
            <div className="order-card-footer">
                <span className="order-time">🕓 {formatDate(order.createdAt)}</span>
                <button
                    className="btn-cancel-order"
                    onClick={(e) => {
                        e.stopPropagation();
                        onCancel(order);
                    }}
                    title="Cancel this order"
                >
                    ✕ Cancel
                </button>
            </div>
        </div>
    );
}
