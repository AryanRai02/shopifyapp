import React, { useState } from "react";
import { DEMO_SHOP } from "../config";

const NAMES = [
    ["Alice Johnson", "alice@example.com"],
    ["Bob Martinez", "bob@example.com"],
    ["Carol White", "carol@example.com"],
    ["David Kim", "david@example.com"],
    ["Emma Brown", "emma@example.com"],
    ["Frank Wilson", "frank@techstore.io"],
    ["Grace Lee", "grace@example.com"],
    ["Hank Torres", "hank@shopnow.com"],
];

export function CreateOrderModal({ onClose, onCreated }) {
    const [person, setPerson] = useState(NAMES[Math.floor(Math.random() * NAMES.length)]);
    const [customerName, setCustomerName] = useState(person[0]);
    const [customerEmail, setCustomerEmail] = useState(person[1]);
    const [totalPrice, setTotalPrice] = useState(
        (Math.random() * 200 + 20).toFixed(2)
    );
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e) {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await fetch("/api/demo/create-order", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    shop: DEMO_SHOP,
                    customerName,
                    customerEmail,
                    totalPrice,
                }),
            });
            const data = await res.json();
            if (data.success) {
                onCreated(data.order);
                onClose();
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-title">
                    <span>📦</span> Create Draft Order
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div className="form-group">
                            <label className="form-label">Customer Name</label>
                            <input
                                className="form-input"
                                value={customerName}
                                onChange={(e) => setCustomerName(e.target.value)}
                                placeholder="Jane Smith"
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Customer Email</label>
                            <input
                                className="form-input"
                                type="email"
                                value={customerEmail}
                                onChange={(e) => setCustomerEmail(e.target.value)}
                                placeholder="jane@example.com"
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Total Price (USD)</label>
                            <input
                                className="form-input"
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={totalPrice}
                                onChange={(e) => setTotalPrice(e.target.value)}
                                placeholder="49.99"
                                required
                            />
                        </div>
                    </div>
                    <div className="modal-actions">
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={onClose}
                        >
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? (
                                <>
                                    <div className="spinner" />
                                    Creating…
                                </>
                            ) : (
                                <>📦 Create Order</>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
