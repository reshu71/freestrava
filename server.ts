// server.ts — replace entire file
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
  maxAge: 5 * 60 * 1000, // 5 minutes — enough for the OAuth dance
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
}));

const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
const APP_URL = process.env.APP_URL;

function getBaseUrl() {
  let base = (APP_URL || '').trim();
  if (!base.startsWith('http')) base = `https://${base}`;
  return base.replace(/\/$/, '');
}

app.get("/api/auth/strava/url", (req, res) => {
  if (!STRAVA_CLIENT_ID || !APP_URL) {
    return res.status(400).json({
      error: "Missing env vars: STRAVA_CLIENT_ID and/or APP_URL not set."
    });
  }
  const redirectUri = `${getBaseUrl()}/api/auth/strava/callback`;
  const scope = "read,activity:read_all";
  const url = `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&approval_prompt=auto`;
  console.log("[Strava] Auth URL redirect_uri:", redirectUri);
  res.json({ url });
});

app.get("/api/auth/strava/callback", async (req, res) => {
  const { code, error: oauthError, error_description } = req.query;

  if (oauthError) {
    console.error("[Strava] OAuth error:", oauthError, error_description);
    return res.send(errorPage(
      `Strava returned an error: <b>${oauthError}</b><br>${error_description || ''}`
    ));
  }
  if (!code) {
    return res.send(errorPage("No authorization code received from Strava."));
  }

  try {
    const redirectUri = `${getBaseUrl()}/api/auth/strava/callback`;
    console.log("[Strava] Exchanging code. redirect_uri:", redirectUri);

    const response = await axios.post("https://www.strava.com/oauth/token", {
      client_id: Number(STRAVA_CLIENT_ID),
      client_secret: STRAVA_CLIENT_SECRET,
      code: code as string,
      grant_type: "authorization_code",
      redirect_uri: redirectUri
    });

    const { access_token, refresh_token, expires_at, athlete } = response.data;
    console.log("[Strava] Token exchanged for athlete:", athlete.id);

    // Store in session — main app will fetch via /api/auth/strava/session
    req.session!.stravaAuth = {
      access_token,
      refresh_token,
      expires_at,
      athleteId: athlete.id,
      ts: Date.now()
    };

    // Redirect popup to a same-origin page — window.opener is preserved here
    res.redirect('/auth/success');
  } catch (err: any) {
    const detail = err.response?.data;
    console.error("[Strava] Token exchange failed:", JSON.stringify(detail));
    res.send(errorPage(`
      <b>Token exchange failed</b><br><br>
      HTTP status: ${err.response?.status}<br>
      Strava error: <pre style="background:#f4f4f4;padding:8px;border-radius:4px">${JSON.stringify(detail, null, 2)}</pre>
      redirect_uri sent: <code>${getBaseUrl()}/api/auth/strava/callback</code><br><br>
      Most common fix: check that <b>Authorization Callback Domain</b> in your
      Strava API settings matches the domain above exactly (no https://, no path).
    `));
  }
});

// Popup lands here after successful token exchange — same-origin so postMessage works
app.get("/auth/success", (req, res) => {
  res.send(`<!doctype html>
<html><head><title>Connecting…</title></head>
<body style="font-family:sans-serif;padding:20px;color:#374151">
<p>Connecting your Strava account…</p>
<script>
  if (window.opener && !window.opener.closed) {
    window.opener.postMessage({ type: 'STRAVA_AUTH_COMPLETE' }, window.location.origin);
    setTimeout(() => window.close(), 500);
  } else {
    // Opener was lost — redirect the main window instead
    window.location.href = '/';
  }
</script>
</body></html>`);
});

// Main app polls this once after receiving STRAVA_AUTH_COMPLETE
app.get("/api/auth/strava/session", (req, res) => {
  const auth = req.session?.stravaAuth;
  if (!auth || !auth.access_token) {
    return res.status(404).json({ error: "No pending Strava auth found in session." });
  }
  req.session!.stravaAuth = null; // One-time read — clear after use
  res.json(auth);
});

// Refresh token
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
  } catch (error: any) {
    console.error("[Strava] Refresh error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to refresh token" });
  }
});

app.get("/api/auth/strava/config", (req, res) => {
  const missing = [
    !STRAVA_CLIENT_ID && "STRAVA_CLIENT_ID",
    !STRAVA_CLIENT_SECRET && "STRAVA_CLIENT_SECRET",
    !APP_URL && "APP_URL"
  ].filter(Boolean);
  res.json({ isConfigured: missing.length === 0, missing });
});

function errorPage(message: string) {
  return `<!doctype html><html><head><title>Auth Error</title></head>
<body style="font-family:sans-serif;padding:20px;max-width:600px">
<h2 style="color:#e11d48">Authentication Error</h2>
<p>${message}</p>
<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">
<p style="color:#6b7280;font-size:14px">
  Check STRAVA_CLIENT_SECRET and APP_URL in AI Studio secrets, then restart the server.
</p>
<button onclick="window.close()" style="background:#111;color:#fff;border:none;padding:8px 16px;border-radius:8px;cursor:pointer">
  Close Window
</button>
</body></html>`;
}

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
    // Express routes must come AFTER static middleware
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server on http://localhost:${PORT}`);
  });
}

startServer();
