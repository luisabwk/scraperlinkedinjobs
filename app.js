const express = require("express");
const cors = require("cors");
const puppeteerExtra = require("puppeteer-extra");
const getJobListings = require("./jobs/scrape-jobs");
const getJobDetails = require("./jobs/job-details");
const LinkedInAuthManager = require("./auth/linkedinAuth");
const { ProxyAgent } = require("undici");

const app = express();
app.use(express.json());
app.use(cors());

// Shared browser state
let browser;

// Proxy configuration
const proxyUrl = "http://usuario:senha@_country-br_city-curitiba_streaming-1@geo.iproyal.com:12321";
const proxyAgent = new ProxyAgent(proxyUrl, {
  headers: {
    'Proxy-Authorization': `Basic ${Buffer.from('usuario:senha').toString('base64')}`,
  },
});

// Middleware to ensure browser is initialized
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

      // Test proxy IP
      const response = await fetch("https://icanhazip.com", {
        dispatcher: proxyAgent,
      });
      const ip = await response.text();
      console.log(`[INFO] Proxy IP in use: ${ip.trim()}`);
    }
    next();
  } catch (error) {
    console.error("[ERROR] Browser initialization failed:", error);
    res.status(500).json({ error: "Failed to initialize browser" });
  }
}

// Endpoint for LinkedIn authentication
app.post("/auth", async (req, res) => {
  const {
    linkedinUsername,
    linkedinPassword,
    emailUsername,
    emailPassword,
    emailHost,
    emailPort,
    captchaApiKey,
  } = req.body;

  if (!linkedinUsername || !linkedinPassword) {
    return res.status(400).json({ error: "LinkedIn username and password are required" });
  }

  if (!emailUsername || !emailPassword || !emailHost || !emailPort) {
    return res.status(400).json({
      error: "Email credentials (username, password, host, port) are required",
    });
  }

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

// Endpoint to scrape job listings
app.post("/scrape-jobs", ensureBrowser, async (req, res) => {
  const { searchTerm, location, li_at, maxJobs = 50 } = req.body;

  if (!searchTerm || !location) {
    return res.status(400).send({ error: "Search term and location are required" });
  }

  try {
    const results = await getJobListings(browser, searchTerm, location, li_at, maxJobs);
    res.status(200).send(results);
  } catch (error) {
    console.error("[ERROR] Failed to scrape jobs:", error);
    res.status(500).send({ error: error.message });
  }
});

// Endpoint to fetch job details
app.post("/job-details", ensureBrowser, async (req, res) => {
  const { jobUrl, li_at } = req.body;

  if (!jobUrl) {
    return res.status(400).send({ error: "Job URL is required" });
  }

  try {
    const jobDetails = await getJobDetails(browser, jobUrl, li_at);
    res.status(200).send(jobDetails);
  } catch (error) {
    console.error("[ERROR] Failed to fetch job details:", error);
    res.status(500).send({ error: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("[ERROR] Middleware error handler:", err);
  res.status(500).json({ error: "Internal server error", message: err.message });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`[INFO] Server is running on port ${PORT}`);
});

module.exports = app;
