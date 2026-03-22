import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import cookieSession from "cookie-session";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cookieSession({
  name: 'session',
  keys: [process.env.SESSION_SECRET || 'default-secret'],
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  secure: true,
  sameSite: 'none'
}));

// Strava OAuth
const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
const APP_URL = process.env.APP_URL;

app.get("/api/auth/strava/url", (req, res) => {
  if (!STRAVA_CLIENT_ID || !APP_URL) {
    return res.status(400).json({ error: "Strava Client ID or App URL not configured. Please check your environment variables." });
  }
  const baseUrl = APP_URL.endsWith('/') ? APP_URL.slice(0, -1) : APP_URL;
  const redirectUri = encodeURIComponent(`${baseUrl}/api/auth/strava/callback`);
  const scope = "read,activity:read_all";
  const authUrl = `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`;
  res.json({ url: authUrl });
});

app.get("/api/auth/strava/callback", async (req, res) => {
  const { code } = req.query;

  try {
    const response = await axios.post("https://www.strava.com/oauth/token", {
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    });

    const { access_token, refresh_token, expires_at, athlete } = response.data;

    // Return HTML that sends message to opener and closes
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ 
                type: 'STRAVA_AUTH_SUCCESS',
                data: ${JSON.stringify({ access_token, refresh_token, expires_at, athleteId: athlete.id })}
              }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. This window should close automatically.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Strava OAuth error:", error);
    res.status(500).send("Authentication failed");
  }
});

// Refresh Strava Token
app.post("/api/auth/strava/refresh", async (req, res) => {
  const { refresh_token } = req.body;
  try {
    const response = await axios.post("https://www.strava.com/oauth/token", {
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      refresh_token,
      grant_type: "refresh_token",
    });
    res.json(response.data);
  } catch (error) {
    console.error("Strava Token Refresh error:", error);
    res.status(500).json({ error: "Failed to refresh token" });
  }
});

app.get("/api/auth/strava/config", (req, res) => {
  res.json({ 
    isConfigured: !!(STRAVA_CLIENT_ID && STRAVA_CLIENT_SECRET && APP_URL),
    missing: [
      !STRAVA_CLIENT_ID && "STRAVA_CLIENT_ID",
      !STRAVA_CLIENT_SECRET && "STRAVA_CLIENT_SECRET",
      !APP_URL && "APP_URL"
    ].filter(Boolean)
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
