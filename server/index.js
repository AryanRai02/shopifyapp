require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieSession = require("cookie-session");
const { shopifyApi, LATEST_API_VERSION, LogSeverity } = require("@shopify/shopify-api");
const { nodeHttpFetch } = require("@shopify/shopify-api/adapters/node");
const { SQLiteSessionStorage } = require("./db/sessionStorage");
const { getDb } = require("./db/database");
const { verifyShopifyWebhook } = require("./middleware/webhookVerify");

// ──────────────────────────────────────────────
// Shopify API initialisation
// ──────────────────────────────────────────────
const sessionStorage = new SQLiteSessionStorage();

const shopify = shopifyApi({
    apiKey: process.env.SHOPIFY_API_KEY || "demo_api_key",
    apiSecretKey: process.env.SHOPIFY_API_SECRET || "demo_api_secret",
    scopes: (process.env.SHOPIFY_SCOPES || "read_orders,write_orders").split(","),
    hostName: (process.env.HOST || "http://localhost:3001").replace(/^https?:\/\//, ""),
    hostScheme: process.env.HOST?.startsWith("https") ? "https" : "http",
    apiVersion: LATEST_API_VERSION,
    isEmbeddedApp: true,
    sessionStorage,
    customFetchApi: nodeHttpFetch,
    logger: { level: LogSeverity.Warning },
});

const app = express();
const PORT = process.env.PORT || 3001;

// ──────────────────────────────────────────────
// CORS 
// ──────────────────────────────────────────────
app.use(
    cors({
        origin: [
            "http://localhost:3000",
            "http://localhost:5173",
            process.env.HOST,
        ].filter(Boolean),
        credentials: true,
    })
);

// ──────────────────────────────────────────────
// Cookie session
// ──────────────────────────────────────────────
app.use(
    cookieSession({
        name: "shopify_app_session",
        keys: [process.env.SESSION_SECRET || "fallback_secret"],
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: "none",
        secure: process.env.NODE_ENV === "production",
    })
);

// ──────────────────────────────────────────────
// Webhooks need raw body for HMAC verification
// ──────────────────────────────────────────────
app.use("/api/webhooks", express.raw({ type: "application/json" }));

// Regular JSON parsing 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ──────────────────────────────────────────────
// OAuth Routes
// ──────────────────────────────────────────────
app.get("/api/auth", async (req, res) => {
    const shop = req.query.shop;
    if (!shop) return res.status(400).json({ error: "Missing shop parameter" });

    try {
        await shopify.auth.begin({
            shop: shopify.utils.sanitizeShop(shop, true),
            callbackPath: "/api/auth/callback",
            isOnline: false,
            rawRequest: req,
            rawResponse: res,
        });
    } catch (err) {
        console.error("Auth begin error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.get("/api/auth/callback", async (req, res) => {
    try {
        const callbackResponse = await shopify.auth.callback({
            rawRequest: req,
            rawResponse: res,
        });

        const session = callbackResponse.session;
        await sessionStorage.storeSession(session);

        // Register webhooks after OAuth
        await registerWebhooks(session);

        // Redirect into the embedded app
        const host = req.query.host;
        res.redirect(
            `/?shop=${session.shop}&host=${host}`
        );
    } catch (err) {
        console.error("Auth callback error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ──────────────────────────────────────────────
// Session token verification middleware
// ──────────────────────────────────────────────
async function requireSession(req, res, next) {
    let shop = req.query.shop || req.headers["x-shopify-shop-domain"];

    // Shopify App Bridge uses session tokens in Authorization: Bearer <token>
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        try {
            const token = authHeader.split(" ")[1];
            const payload = await shopify.session.decodeSessionToken(token);
            // Payload dest is like "https://your-shop.myshopify.com"
            shop = payload.dest.replace(/^https?:\/\//, "");
        } catch (e) {
            console.error("Token decode error:", e);
            return res.status(401).json({ error: "Invalid session token" });
        }
    }

    if (!shop) return res.status(400).json({ error: "Missing shop parameter/token" });

    try {
        const sessions = await sessionStorage.findSessionsByShop(shop);
        const validSession = sessions.find((s) => s.accessToken);
        if (!validSession) {
            return res.status(401).json({ error: "No valid session", authRequired: true });
        }
        req.shopifySession = validSession;
        next();
    } catch (err) {
        console.error("Session lookup error:", err);
        res.status(500).json({ error: "Session error" });
    }
}

// ──────────────────────────────────────────────
// Orders API
// ──────────────────────────────────────────────
app.get("/api/orders", requireSession, (req, res) => {
    try {
        const db = getDb();
        const shop = req.shopifySession.shop;
        const orders = db
            .prepare("SELECT * FROM orders WHERE shopDomain = ? ORDER BY createdAt DESC")
            .all(shop);

        res.json({
            success: true,
            orders: orders.map((o) => ({
                ...o,
                rawData: o.rawData ? JSON.parse(o.rawData) : null,
            })),
        });
    } catch (err) {
        console.error("Orders fetch error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ──────────────────────────────────────────────
// Webhook Handlers
// ──────────────────────────────────────────────
app.post("/api/webhooks/orders/create", (req, res) => {
    const hmac = req.headers["x-shopify-hmac-sha256"];
    const rawBody = req.body;
    const secret = process.env.SHOPIFY_API_SECRET || "demo_api_secret";

    if (!verifyShopifyWebhook(rawBody, hmac, secret)) {
        console.warn("⚠️  Invalid HMAC on orders/create webhook");
        return res.status(401).json({ error: "Unauthorized" });
    }

    let order;
    try {
        order = JSON.parse(rawBody.toString());
    } catch {
        return res.status(400).json({ error: "Invalid JSON body" });
    }

    const shop = req.headers["x-shopify-shop-domain"];
    console.log(`📦  orders/create webhook for shop: ${shop}, order: ${order.id}`);

    try {
        const db = getDb();
        db.prepare(`
      INSERT OR REPLACE INTO orders (
        id, shopDomain, orderNumber, customerName, customerEmail,
        totalPrice, currency, financialStatus, fulfillmentStatus,
        lineItemsCount, createdAt, updatedAt, rawData
      ) VALUES (
        @id, @shopDomain, @orderNumber, @customerName, @customerEmail,
        @totalPrice, @currency, @financialStatus, @fulfillmentStatus,
        @lineItemsCount, @createdAt, @updatedAt, @rawData
      )
    `).run({
            id: String(order.id),
            shopDomain: shop,
            orderNumber: order.order_number ? String(order.order_number) : null,
            customerName: order.customer
                ? `${order.customer.first_name || ""} ${order.customer.last_name || ""}`.trim()
                : "Guest",
            customerEmail: order.customer?.email || order.email || null,
            totalPrice: order.total_price || "0.00",
            currency: order.currency || "USD",
            financialStatus: order.financial_status || "pending",
            fulfillmentStatus: order.fulfillment_status || "unfulfilled",
            lineItemsCount: order.line_items ? order.line_items.length : 0,
            createdAt: order.created_at || new Date().toISOString(),
            updatedAt: order.updated_at || new Date().toISOString(),
            rawData: JSON.stringify(order),
        });
        res.status(200).json({ received: true });
    } catch (err) {
        console.error("DB insert error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/webhooks/orders/cancelled", (req, res) => {
    const hmac = req.headers["x-shopify-hmac-sha256"];
    const rawBody = req.body;
    const secret = process.env.SHOPIFY_API_SECRET || "demo_api_secret";

    if (!verifyShopifyWebhook(rawBody, hmac, secret)) {
        console.warn("⚠️  Invalid HMAC on orders/cancelled webhook");
        return res.status(401).json({ error: "Unauthorized" });
    }

    let order;
    try {
        order = JSON.parse(rawBody.toString());
    } catch {
        return res.status(400).json({ error: "Invalid JSON body" });
    }

    const shop = req.headers["x-shopify-shop-domain"];
    console.log(`❌  orders/cancelled webhook for shop: ${shop}, order: ${order.id}`);

    try {
        const db = getDb();
        db.prepare("DELETE FROM orders WHERE id = ? AND shopDomain = ?").run(
            String(order.id),
            shop
        );
        res.status(200).json({ received: true });
    } catch (err) {
        console.error("DB delete error:", err);
        res.status(500).json({ error: err.message });
    }
});

//  endpoint to simulate an order
app.post("/api/demo/create-order", (req, res) => {
    const db = getDb();
    const shop = req.body.shop || "demo-shop.myshopify.com";
    const demoOrder = {
        id: String(Date.now()),
        shopDomain: shop,
        orderNumber: String(Math.floor(1000 + Math.random() * 9000)),
        customerName: req.body.customerName || "Jane Smith",
        customerEmail: req.body.customerEmail || "jane@example.com",
        totalPrice: req.body.totalPrice || (Math.random() * 200 + 20).toFixed(2),
        currency: "USD",
        financialStatus: "paid",
        fulfillmentStatus: "unfulfilled",
        lineItemsCount: Math.floor(1 + Math.random() * 3),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rawData: JSON.stringify({ demo: true }),
    };

    db.prepare(`
    INSERT OR REPLACE INTO orders (
      id, shopDomain, orderNumber, customerName, customerEmail,
      totalPrice, currency, financialStatus, fulfillmentStatus,
      lineItemsCount, createdAt, updatedAt, rawData
    ) VALUES (
      @id, @shopDomain, @orderNumber, @customerName, @customerEmail,
      @totalPrice, @currency, @financialStatus, @fulfillmentStatus,
      @lineItemsCount, @createdAt, @updatedAt, @rawData
    )
  `).run(demoOrder);

    res.json({ success: true, order: demoOrder });
});

app.delete("/api/demo/cancel-order/:id", (req, res) => {
    const db = getDb();
    const shop = req.query.shop || "demo-shop.myshopify.com";
    db.prepare("DELETE FROM orders WHERE id = ? AND shopDomain = ?").run(
        req.params.id,
        shop
    );
    res.json({ success: true });
});

// ──────────────────────────────────────────────
// Health check and Config
// ──────────────────────────────────────────────
app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/config", (req, res) => {
    res.json({ apiKey: process.env.SHOPIFY_API_KEY || "demo_api_key" });
});

// Shop info from session
app.get("/api/shop", requireSession, (req, res) => {
    const s = req.shopifySession;
    res.json({
        shop: s.shop,
        scope: s.scope,
        accessToken: s.accessToken ? "***configured***" : null,
    });
});

// ──────────────────────────────────────────────
// Register Webhooks helper
// ──────────────────────────────────────────────
async function registerWebhooks(session) {
    const host = process.env.HOST || "http://localhost:3001";
    const topics = [
        { topic: "ORDERS_CREATE", callbackUrl: `${host}/api/webhooks/orders/create` },
        { topic: "ORDERS_CANCELLED", callbackUrl: `${host}/api/webhooks/orders/cancelled` },
    ];

    for (const { topic, callbackUrl } of topics) {
        try {
            const client = new shopify.clients.Graphql({ session });
            await client.request(`
        mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
          webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
            webhookSubscription { id }
            userErrors { field message }
          }
        }
      `, {
                variables: {
                    topic,
                    webhookSubscription: {
                        callbackUrl,
                        format: "JSON",
                    },
                },
            });
            console.log(`✅  Webhook registered: ${topic}`);
        } catch (err) {
            console.warn(`⚠️  Webhook registration skipped for ${topic}:`, err.message);
        }
    }
}

// ──────────────────────────────────────────────
// Start server
// ──────────────────────────────────────────────
app.listen(PORT, "127.0.0.1", () => {
    const apiKey = process.env.SHOPIFY_API_KEY;
    const isDefault = !apiKey || apiKey === "demo_api_key";

    console.log(`
╔════════════════════════════════════════╗
║   Shopify Embedded App – Express       ║
║   Server running on port ${PORT}          ║
╚════════════════════════════════════════╝
    `);

    if (isDefault) {
        console.log(`⚠️  WARNING: SHOPIFY_API_KEY is not set or using default value!`);
        console.log(`   Your app will not be able to authenticate with real Shopify stores.`);
        console.log(`   Please edit the .env inside the 'server' folder.\n`);
    } else {
        const maskedKey = apiKey.substring(0, 4) + "****" + apiKey.substring(apiKey.length - 4);
        console.log(`✅  SHOPIFY_API_KEY loaded successfully! (${maskedKey})\n`);
    }
});

module.exports = app;
