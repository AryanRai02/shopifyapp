const crypto = require("crypto");

/**
 * Verify Shopify HMAC signature on incoming webhooks.
 * Returns true if valid, false otherwise.
 */
function verifyShopifyWebhook(rawBody, hmacHeader, secret) {
    if (!hmacHeader || !secret) return false;
    const digest = crypto
        .createHmac("sha256", secret)
        .update(rawBody, "utf8")
        .digest("base64");
    try {
        return crypto.timingSafeEqual(
            Buffer.from(digest),
            Buffer.from(hmacHeader)
        );
    } catch {
        return false;
    }
}

module.exports = { verifyShopifyWebhook };
