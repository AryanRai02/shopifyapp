import React, { useEffect, useState, useMemo } from "react";
import { Provider, useAppBridge } from "@shopify/app-bridge-react";
import { getSessionToken } from "@shopify/app-bridge-utils";
import { ToastContainer } from "./components/ToastContainer";
import { CreateOrderModal } from "./components/CreateOrderModal";
import { OrderCard } from "./components/OrderCard";
import { useToast } from "./hooks/useToast";
import { DEMO_SHOP } from "./config";

function MainApp({ isDemo }) {
    let app = null;
    try {
        app = useAppBridge();
    } catch (e) { }

    const [sessionInfo, setSessionInfo] = useState({ state: "loading" });
    const [orders, setOrders] = useState([]);
    const [webhooks, setWebhooks] = useState([]);
    const [loadingOrders, setLoadingOrders] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const { toasts, addToast, removeToast } = useToast();

    async function authFetch(url, options = {}) {
        const headers = { ...options.headers };
        if (app && !isDemo) {
            try {
                const token = await getSessionToken(app);
                if (token) headers["Authorization"] = `Bearer ${token}`;
            } catch (e) {
                console.warn("Failed to get session token", e);
            }
        }
        return fetch(url, { ...options, headers });
    }

    useEffect(() => {
        async function init() {
            try {
                const res = await authFetch("/api/shop");
                if (res.status === 401) {
                    setSessionInfo({ state: "auth_required" });
                    return;
                }
                if (!res.ok) throw new Error("Failed to load shop info");
                const data = await res.json();
                setSessionInfo({ state: "authenticated", ...data });
                addToast(`Connected to ${data.shop}`, "success");
            } catch (err) {
                setSessionInfo({ state: "error", error: err.message });
                setSessionInfo({ state: "authenticated", shop: DEMO_SHOP });
                if (isDemo) {
                    addToast("Running in demo mode without Shopify session", "info", 5000);
                }
            }
        }
        init();

        const interval = setInterval(() => {
            if (sessionInfo.state === "authenticated") fetchOrders();
        }, 5000);

        return () => clearInterval(interval);
    }, [isDemo]); // eslint-disable-line

    useEffect(() => {
        if (sessionInfo.state === "authenticated") {
            fetchOrders();
        }
    }, [sessionInfo.state]);

    async function fetchOrders() {
        try {
            const url = (sessionInfo.shop !== DEMO_SHOP && !isDemo)
                ? "/api/orders"
                : `/api/orders?shop=${DEMO_SHOP}`;

            const res = await authFetch(url);
            if (!res.ok) return;
            const data = await res.json();

            if (orders.length > 0 && data.orders) {
                const newOrders = data.orders.filter(
                    (no) => !orders.find((o) => o.id === no.id)
                );
                const deletedOrders = orders.filter(
                    (o) => !data.orders.find((no) => no.id === o.id)
                );

                newOrders.forEach((no) => {
                    addWebhookEvent("orders/create", `Order #${no.orderNumber || no.id.slice(-6)} received`);
                    addToast(`New order received!`, "success");
                });
                deletedOrders.forEach((do_obj) => {
                    addWebhookEvent("orders/cancelled", `Order #${do_obj.orderNumber || do_obj.id.slice(-6)} cancelled`);
                    addToast(`Order cancelled.`, "error");
                });
            }

            setOrders(data.orders || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingOrders(false);
        }
    }

    function addWebhookEvent(topic, message) {
        setWebhooks((prev) => [
            { id: Date.now(), topic, message, time: new Date() },
            ...prev.slice(0, 9),
        ].sort((a, b) => b.time - a.time));
    }

    async function handleCancelOrder(order) {
        if (!confirm("Are you sure you want to cancel this order?")) return;
        try {
            const res = await authFetch(`/api/demo/cancel-order/${order.id}?shop=${sessionInfo.shop || DEMO_SHOP}`, {
                method: "DELETE",
            });
            if (res.ok) {
                addToast("Order deleted successfully", "success");
                setOrders((prev) => prev.filter((o) => o.id !== order.id));
                addWebhookEvent("orders/cancelled", `Order #${order.orderNumber || order.id.slice(-6)} deleted via UI`);
            }
        } catch (err) {
            addToast("Failed to delete order", "error");
        }
    }

    function handleStartAuth() {
        const shop = prompt("Enter your myshopify.com domain (e.g. my-store.myshopify.com):");
        if (!shop) return;
        window.location.href = `/api/auth?shop=${shop}`;
    }

    const totalRevenue = useMemo(
        () => orders.reduce((sum, o) => sum + parseFloat(o.totalPrice || 0), 0),
        [orders]
    );
    const unfulfilledCount = useMemo(
        () => orders.filter((o) => (o.fulfillmentStatus || "").toLowerCase() === "unfulfilled").length,
        [orders]
    );

    const filteredOrders = useMemo(() => {
        if (!searchQuery) return orders;
        const q = searchQuery.toLowerCase();
        return orders.filter(
            (o) =>
                (o.customerName || "").toLowerCase().includes(q) ||
                (o.customerEmail || "").toLowerCase().includes(q) ||
                (o.orderNumber || "").includes(q)
        );
    }, [orders, searchQuery]);

    if (sessionInfo.state === "auth_required") {
        return (
            <div className="auth-page">
                <div className="auth-card">
                    <div className="auth-logo">🛍️</div>
                    <h1 className="auth-title">Connect your Store</h1>
                    <p className="auth-subtitle">
                        This app requires a valid Shopify session to manage orders and process webhooks securely.
                    </p>
                    <button className="btn btn-primary" style={{ width: "100%", height: 48 }} onClick={handleStartAuth}>
                        Begin OAuth Flow
                    </button>
                </div>
            </div>
        );
    }

    if (sessionInfo.state === "loading") {
        return (
            <div className="auth-page">
                <div className="spinner" style={{ width: 40, height: 40, borderWidth: 3 }} />
                <p style={{ color: "var(--color-text-2)", marginTop: 16 }}>Initializing session…</p>
            </div>
        );
    }

    return (
        <div className="app-layout">
            <nav className="nav-bar">
                <a href="/" className="nav-logo">
                    <div className="nav-logo-icon">✨</div>
                    <div className="nav-logo-text">
                        Shopify<span>App</span>
                    </div>
                </a>
                <div className="nav-spacer" />
                <div className="nav-shop-badge">
                    <div className="nav-shop-dot" />
                    {sessionInfo.shop}
                </div>
            </nav>

            <main className="main-content">
                <header className="page-header">
                    <div className="page-header-top">
                        <div>
                            <h1 className="page-title">Orders Dashboard</h1>
                            <p className="page-subtitle">Real-time synced orders via App Bridge and Webhooks.</p>
                        </div>
                        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                            <span>+</span> Simulate Webhook
                        </button>
                    </div>
                </header>

                <div className="stats-row">
                    <div className="stat-card">
                        <div className="stat-icon" style={{ background: "var(--color-primary-glow)", color: "var(--color-primary-light)" }}>📦</div>
                        <div className="stat-label">Total Orders</div>
                        <div className="stat-value">{orders.length}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon" style={{ background: "var(--color-green-dim)", color: "var(--color-green)" }}>💵</div>
                        <div className="stat-label">Total Revenue</div>
                        <div className="stat-value">${totalRevenue.toFixed(2)}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon" style={{ background: "var(--color-orange-dim)", color: "var(--color-orange)" }}>⚠️</div>
                        <div className="stat-label">Unfulfilled</div>
                        <div className="stat-value">{unfulfilledCount}</div>
                    </div>
                </div>

                <div className="webhook-feed">
                    <div className="webhook-feed-header">
                        <div className="webhook-feed-title">Webhook Activity</div>
                        <div className="live-dot" />
                        <div style={{ fontSize: 11, color: "var(--color-text-3)", fontWeight: 600 }}>LIVE</div>
                    </div>
                    <div className="webhook-feed-content">
                        {webhooks.length === 0 ? (
                            <div className="webhook-empty">Listening for orders/create and orders/cancelled events...</div>
                        ) : (
                            webhooks.map((w) => (
                                <div key={w.id} className="webhook-event">
                                    <span className="webhook-event-icon" title={w.topic}>
                                        {w.topic.includes("create") ? "🟢" : "🔴"}
                                    </span>
                                    <div className="webhook-event-text">
                                        <strong>{w.topic}</strong> &mdash; {w.message}
                                    </div>
                                    <div className="webhook-event-time">
                                        {w.time.toLocaleTimeString()}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="action-bar">
                    <div className="search-input-wrapper">
                        <span className="search-input-icon">🔍</span>
                        <input
                            type="text"
                            className="search-input"
                            placeholder="Search by customer name, email, or #..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <button className="btn btn-icon btn-secondary" onClick={fetchOrders} title="Refresh manually">
                        ↻
                    </button>
                </div>

                {loadingOrders ? (
                    <div className="orders-grid">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="skeleton skeleton-card" />
                        ))}
                    </div>
                ) : filteredOrders.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">📭</div>
                        <div className="empty-state-title">No orders found</div>
                        <div className="empty-state-desc">
                            When an order is created in your Shopify admin, the <code>orders/create</code> webhook will sync it here instantly.
                        </div>
                        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                            Create Sample Order
                        </button>
                    </div>
                ) : (
                    <div className="orders-grid">
                        {filteredOrders.map((order) => (
                            <OrderCard
                                key={order.id}
                                order={order}
                                onCancel={handleCancelOrder}
                                style={{ animationDelay: `${Math.random() * 0.15}s` }}
                            />
                        ))}
                    </div>
                )}
            </main>

            {showModal && (
                <CreateOrderModal
                    onClose={() => setShowModal(false)}
                    onCreated={(newOrder) => {
                        setOrders((prev) => [newOrder, ...prev]);
                        addWebhookEvent("orders/create", `Draft order #${newOrder.orderNumber} created`);
                        addToast(`Mock Order #${newOrder.orderNumber} created`, "success");
                    }}
                />
            )}

            <ToastContainer toasts={toasts} onRemove={removeToast} />
        </div>
    );
}

export default function AppWrapper() {
    const [config, setConfig] = useState(null);
    const host = new URLSearchParams(window.location.search).get("host");

    useEffect(() => {
        fetch("/api/config")
            .then(r => r.json())
            .then(data => {
                setConfig({ apiKey: data.apiKey, host: host || "" });
            })
            .catch(() => setConfig({ apiKey: "", host: "" }));
    }, [host]);

    if (!config) {
        return (
            <div className="auth-page">
                <div className="spinner" style={{ width: 40, height: 40, borderWidth: 3 }} />
            </div>
        );
    }

    if (config.host && config.apiKey) {
        return (
            <Provider config={config}>
                <MainApp isDemo={false} />
            </Provider>
        );
    }

    return <MainApp isDemo={true} />;
}
