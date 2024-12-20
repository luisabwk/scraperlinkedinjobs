const express = require("express");
const cors = require("cors");
const puppeteerExtra = require("puppeteer-extra");
const LinkedInAuthManager = require("./auth/linkedinAuth");
const fetch = require("node-fetch");
const HttpsProxyAgent = require("https-proxy-agent");

const app = express();
app.use(express.json());
app.use(cors());

// Proxy Configuration
const proxyUrl = "http://d4Xzafgb5TJfSLpI:YQhSnyw789HDtj4u_country-br_city-curitiba_streaming-1@geo.iproyal.com:12321";
const proxyAgent = new HttpsProxyAgent(proxyUrl);

// Middleware to Initialize Browser
let browser;
async function ensureBrowser(req, res, next) {
  try {
    if (!browser || !browser.isConnected()) {
      console.log("[INFO] Initializing browser with proxy...");
      browser = await puppeteerExtra.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          `--proxy-server=${proxyUrl}`,
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-notifications",
        ],
      });

      // Test Proxy IP
      const response = await fetch("https://icanhazip.com", { agent: proxyAgent });
      const ip = await response.text();
      console.log(`[INFO] Proxy IP in use: ${ip.trim()}`);
    }
    next();
  } catch (error) {
    console.error("[ERROR] Failed to initialize browser:", error);
    res.status(500).json({ error: "Failed to initialize browser", details: error.message });
  }
}

// LinkedIn Authentication Endpoint
app.post("/auth", async (req, res) => {
  const { linkedinUsername, linkedinPassword, emailUsername, emailPassword, emailHost, emailPort, captchaApiKey } = req.body;

  try {
    const authManager = new LinkedInAuthManager();
    const li_at = await authManager.loginWithVerificationAndCaptcha(
      linkedinUsername,
      linkedinPassword,
      emailUsername,
      emailPassword,
      emailHost,
      emailPort,
      captchaApiKey
    );
    res.status(200).json({ message: "Authentication successful", li_at });
  } catch (error) {
    console.error("[ERROR] Authentication failed:", error);
    res.status(500).json({ error: error.message });
  }
});

// Server Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[INFO] Server is running on port ${PORT}`);
});
