const path = require("path");
const fs = require("fs");

const DB_DIR = path.join(__dirname, "..", "data");
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = path.join(DB_DIR, "shopify_data.json");
let data = { sessions: [], orders: [] };

function load() {
  if (fs.existsSync(DB_PATH)) {
    try {
      data = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    } catch (err) {
      console.error("Failed to parse db JSON", err);
    }
  }
}

function save() {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Failed to write db JSON", err);
  }
}

load();

const fakeDb = {
  pragma: () => { },
  exec: () => { },
  prepare: (sql) => {
    return {
      get: (...args) => {
        if (sql.includes("FROM sessions WHERE id = ?")) {
          return data.sessions.find(s => s.id === args[0]);
        }
      },
      all: (...args) => {
        if (sql.includes("FROM sessions WHERE shop = ?")) {
          return data.sessions.filter(s => s.shop === args[0]);
        }
        if (sql.includes("FROM orders WHERE shopDomain = ?")) {
          return data.orders
            .filter(o => o.shopDomain === args[0])
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        }
        return [];
      },
      run: (...args) => {
        const params = args[0];

        if (sql.includes("INSERT OR REPLACE INTO sessions")) {
          const idx = data.sessions.findIndex(s => s.id === params.id);
          if (idx >= 0) data.sessions[idx] = params;
          else data.sessions.push(params);
          save();
        }
        else if (sql.includes("DELETE FROM sessions WHERE id = ?")) {
          data.sessions = data.sessions.filter(s => s.id !== args[0]);
          save();
        }
        else if (sql.includes("DELETE FROM sessions WHERE id IN")) {
          data.sessions = data.sessions.filter(s => !args.includes(s.id));
          save();
        }
        else if (sql.includes("INSERT OR REPLACE INTO orders")) {
          const idx = data.orders.findIndex(o => o.id === params.id);
          if (idx >= 0) data.orders[idx] = params;
          else data.orders.push(params);
          save();
        }
        else if (sql.includes("DELETE FROM orders WHERE id = ? AND shopDomain = ?")) {
          data.orders = data.orders.filter(o => !(o.id === args[0] && o.shopDomain === args[1]));
          save();
        }
      }
    };
  }
};

function getDb() {
  return fakeDb;
}

module.exports = { getDb };
