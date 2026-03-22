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
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
}));

// Strava OAuth
const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
const APP_URL = process.env.APP_URL;

app.get("/api/auth/strava/url", (req, res) => {
  if (!STRAVA_CLIENT_ID || !APP_URL) {
    console.error("Missing Strava config:", { STRAVA_CLIENT_ID, APP_URL });
    return res.status(400).json({ error: "Strava Client ID or App URL not configured. Please check your environment variables." });
  }
  
  // Ensure APP_URL has a protocol and no trailing slash
  let baseUrl = APP_URL.trim();
  if (!baseUrl.startsWith('http')) {
    baseUrl = `https://${baseUrl}`;
  }
  if (baseUrl.endsWith('/')) {
    baseUrl = baseUrl.slice(0, -1);
  }
  
  const redirectUri = `${baseUrl}/api/auth/strava/callback`;
  console.log("Generating Strava Auth URL with redirectUri:", redirectUri);
  
  const scope = "read,activity:read_all";
  const authUrl = `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}`;
  res.json({ url: authUrl });
});

app.get("/api/auth/strava/callback", async (req, res) => {
  const { code, error: queryError } = req.query;

  if (queryError) {
    console.error("Strava OAuth query error:", queryError);
    return res.status(400).send(`Strava returned an error: ${queryError}`);
  }

  if (!code) {
    return res.status(400).send("No code provided by Strava");
  }

  try {
    if (!APP_URL) throw new Error("APP_URL not configured");
    if (!STRAVA_CLIENT_ID) throw new Error("STRAVA_CLIENT_ID not configured");
    if (!STRAVA_CLIENT_SECRET) throw new Error("STRAVA_CLIENT_SECRET not configured");
    
    // Ensure APP_URL has a protocol and no trailing slash
    let baseUrl = APP_URL.trim();
    if (!baseUrl.startsWith('http')) {
      baseUrl = `https://${baseUrl}`;
    }
    if (baseUrl.endsWith('/')) {
      baseUrl = baseUrl.slice(0, -1);
    }
    
    const redirectUri = `${baseUrl}/api/auth/strava/callback`;
    console.log("Exchanging code for token. Redirect URI:", redirectUri);
    console.log("Client ID (as number):", Number(STRAVA_CLIENT_ID));
    console.log("Secret length:", STRAVA_CLIENT_SECRET.length);
    console.log("Secret starts with:", STRAVA_CLIENT_SECRET.substring(0, 4) + "...");

    console.log("Sending token request to Strava...");
    const response = await axios.post("https://www.strava.com/oauth/token", {
      client_id: Number(STRAVA_CLIENT_ID),
      client_secret: STRAVA_CLIENT_SECRET,
      code: code as string,
      grant_type: "authorization_code",
      redirect_uri: redirectUri
    });

    const { access_token, refresh_token, expires_at, athlete } = response.data;
    console.log("Successfully exchanged token for athlete:", athlete.id);

    // Return HTML that sends message to opener and closes
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ 
                type: 'STRAVA_AUTH_SUCCESS', 
                data: {
                  access_token: '${access_token}',
                  refresh_token: '${refresh_token}',
                  expires_at: ${expires_at},
                  athleteId: ${athlete.id}
                }
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
  } catch (error: any) {
    const errorData = error.response?.data;
    console.error("Strava OAuth token exchange failed. Full error data:", JSON.stringify(errorData, null, 2));
    console.error("Error message:", error.message);

    let errorMessage = "Authentication failed during token exchange.";
    if (errorData && errorData.errors) {
      errorMessage += " Strava says: " + JSON.stringify(errorData.errors, null, 2);
    } else if (error.message) {
      errorMessage += " Error: " + error.message;
    }

    res.status(500).send(`
      <html>
        <body style="font-family: sans-serif; padding: 20px;">
          <h2 style="color: #e11d48;">Authentication Error</h2>
          <p>${errorMessage}</p>
          <p>Please check your <b>STRAVA_CLIENT_SECRET</b> and <b>APP_URL</b> secrets in AI Studio.</p>
          <button onclick="window.close()">Close Window</button>
        </body>
      </html>
    `);
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
