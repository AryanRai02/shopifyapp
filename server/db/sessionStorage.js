const { getDb } = require("../db/database");

class SQLiteSessionStorage {
    async storeSession(session) {
        const db = getDb();
        const stmt = db.prepare(`
      INSERT OR REPLACE INTO sessions (
        id, shop, state, isOnline, scope, expires, accessToken,
        userId, firstName, lastName, email, accountOwner, locale,
        collaborator, emailVerified
      ) VALUES (
        @id, @shop, @state, @isOnline, @scope, @expires, @accessToken,
        @userId, @firstName, @lastName, @email, @accountOwner, @locale,
        @collaborator, @emailVerified
      )
    `);

        stmt.run({
            id: session.id,
            shop: session.shop,
            state: session.state || null,
            isOnline: session.isOnline ? 1 : 0,
            scope: session.scope || null,
            expires: session.expires ? session.expires.toISOString() : null,
            accessToken: session.accessToken || null,
            userId: session.onlineAccessInfo?.associated_user?.id || null,
            firstName: session.onlineAccessInfo?.associated_user?.first_name || null,
            lastName: session.onlineAccessInfo?.associated_user?.last_name || null,
            email: session.onlineAccessInfo?.associated_user?.email || null,
            accountOwner: session.onlineAccessInfo?.associated_user?.account_owner ? 1 : 0,
            locale: session.onlineAccessInfo?.associated_user?.locale || null,
            collaborator: session.onlineAccessInfo?.associated_user?.collaborator ? 1 : 0,
            emailVerified: session.onlineAccessInfo?.associated_user?.email_verified ? 1 : 0,
        });
        return true;
    }

    async loadSession(id) {
        const db = getDb();
        const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id);
        if (!row) return undefined;
        return this._rowToSession(row);
    }

    async deleteSession(id) {
        const db = getDb();
        db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
        return true;
    }

    async deleteSessions(ids) {
        const db = getDb();
        const placeholders = ids.map(() => "?").join(",");
        db.prepare(`DELETE FROM sessions WHERE id IN (${placeholders})`).run(...ids);
        return true;
    }

    async findSessionsByShop(shop) {
        const db = getDb();
        const rows = db.prepare("SELECT * FROM sessions WHERE shop = ?").all(shop);
        return rows.map(this._rowToSession);
    }

    _rowToSession(row) {
        const { Session } = require("@shopify/shopify-api");
        const session = new Session({
            id: row.id,
            shop: row.shop,
            state: row.state || "",
            isOnline: Boolean(row.isOnline),
        });
        if (row.scope) session.scope = row.scope;
        if (row.expires) session.expires = new Date(row.expires);
        if (row.accessToken) session.accessToken = row.accessToken;
        return session;
    }
}

module.exports = { SQLiteSessionStorage };
