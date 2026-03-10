# Shopify Embedded App (Node.js & React)

This project builds a basic Shopify embedded app using App Bridge. It integrates completely inside the Shopify Admin UI.

## Key Features

1. **Embedded App**: Renders inside Shopify Admin following proper OAuth flow. Sessions are stored in a local SQLite DB using an optimized schema.
2. **Webhook Syncing**:
    - Listens to `orders/create` to add incoming orders to the SQLite DB and automatically surfaces them on the UI.
    - Listens to `orders/cancelled` to delete the order card from the view and DB.
3. **HMAC Verification**: Ensures all webhooks are legitimately signed by Shopify (`middleware/webhookVerify.js`).
4. **Beautiful UI**: Glassmorphic, dark-mode, animated React frontend. Very premium and responsive look and feel.

## Prerequisites

- Node.js (v18+)
- A Partner Account on [Shopify Partners](https://partners.shopify.com/)
- A Dev Store created in your Partner Account
- A public tunnel like `localtunnel` or `ngrok` (essential for Shopify OAuth & Webhooks. Localtunnel is easiest: `npx localtunnel --port 3000`)

## Setup Instructions

### 1. Clone the Repository

```bash
git clone <repository-url>
cd shopifyApp
```

### 2. Install Dependencies

Install dependencies for both server and client:

```bash
# Install Server Dependencies
cd server
npm install

# Install Client Dependencies
cd ../client
npm install
```

### 3. Environment Variables

In the `server` directory, copy `.env.example` to `.env`:

```bash
cd server
cp .env.example .env
```

Edit `.env` with your Shopify app credentials:

```env
SHOPIFY_API_KEY=your_client_id_here
SHOPIFY_API_SECRET=your_client_secret_here
SHOPIFY_SCOPES=read_orders,write_orders
HOST=https://your-public-tunnel.loca.lt
PORT=3001
NODE_ENV=development
SESSION_SECRET=a_super_secret_string
```

### 4. Shopify Partner Setup

1. Create a new App in your Shopify Partner Dashboard.
2. Under **App setup**:
   - Save your **Client ID (API Key)** and **Client secret**.
   - Set **App URL** to your tunnel URL (e.g., `https://localtunnel.me` or `ngrok`).
   - Set **Allowed redirection URL(s)** to `https://<YOUR_TUNNEL_URL>/api/auth/callback`.
3. Ensure it is set as an "Embedded app" (this is the default).

### 5. Running the Application

This app runs locally on two ports (3001 for backend Express server, 3000 for Vite frontend). The Vite frontend proxies `/api` calls to the Express backend.

**Start the Server:**

```bash
cd server
npm run dev
```

**Start the Client:**

```bash
cd client
npm run dev
```

### 6. Expose Local Server

Expose your frontend port (`3000`) to the public internet using Localtunnel or Ngrok:

```bash
npx localtunnel --port 3000
```

Note the generated URL (e.g., `https://loose-maps-know.loca.lt`).

Update your `.env` file with this HOST URL.

### 7. Install to your Dev Store

1. Open a browser and visit your dev store or enter the OAuth flow manually using the public URL:
   `https://<YOUR_TUNNEL_URL>.loca.lt/api/auth?shop=YOUR_DEV_STORE.myshopify.com`
2. Approve the permissions.
3. You will be redirected back into Shopify admin with an embedded session.

## Testing Webhook Delivery

The app registers `orders/create` and `orders/cancelled` webhooks during OAuth.

To test:

1. In Shopify Admin, create a **Draft Order**.
2. Mark it as "Paid" to convert it to a real order.
3. Shopify fires the `orders/create` webhook.
4. The order appears in the embedded app UI.

If you cancel an order in the app or in Shopify Admin, the `orders/cancelled` webhook removes it from the UI.

## Screenshots

### Embedded App UI
![Embedded App UI](screenshots/embedded-ui.png)

### Orders Display
![Orders in UI](screenshots/orders-display.png)

### Webhook Activity
![Webhook Activity](screenshots/webhook-activity.png)

## Project Structure

```
shopifyApp/
├── client/          # React frontend
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── ...
│   └── package.json
├── server/          # Express backend
│   ├── db/
│   ├── middleware/
│   ├── data/
│   └── package.json
└── README.md
```

## Technologies Used

- **Frontend**: React, Vite, Shopify Polaris, Tailwind CSS
- **Backend**: Node.js, Express, SQLite
- **Shopify**: App Bridge, Webhooks, OAuth

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes
4. Submit a pull request

## License

MIT License

**Notes for Development Mode Without A Store:**
Inside the App UI, you can click `+ Simulate Webhook / Create Sample Order` to forcefully mimic a webhook delivery and see how the UI reacts to new incoming database data.


