require('dotenv').config({ path: __dirname + '/.env' });

const express = require("express");
const cors = require("cors");
const puppeteerExtra = require("puppeteer-extra");
const LinkedInAuthManager = require("./auth/linkedinAuth");
const getJobListings = require("./jobs/scrape-jobs");
const getJobDetails = require("./jobs/job-details");
const fetch = require("node-fetch");
const HttpsProxyAgent = require("https-proxy-agent");

const app = express();
app.use(express.json());
app.use(cors());

// Proxy Configuration
const proxyHost = process.env.PROXY_HOST;
const proxyPort = process.env.PROXY_PORT;
const proxyUsername = process.env.PROXY_USERNAME;
const proxyPassword = process.env.PROXY_PASSWORD;
const proxyUrl = `http://${proxyUsername}:${proxyPassword}@${proxyHost}:${proxyPort}`;
const proxyServer = `${proxyHost}:${proxyPort}`;
const proxyAgent = new HttpsProxyAgent(proxyUrl);

// Browsers
let browserWithProxy;
let browserWithoutProxy;

// Middleware to Initialize Browser with Proxy
async function ensureBrowserWithProxy(req, res, next) {
  try {
    if (!browserWithProxy || !browserWithProxy.isConnected()) {
      console.log("[INFO] Initializing browser with proxy...");
      browserWithProxy = await puppeteerExtra.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          `--proxy-server=${proxyServer}`,
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
    console.error("[ERROR] Failed to initialize browser with proxy:", error);
    res.status(500).json({ error: "Failed to initialize browser with proxy", details: error.message });
  }
}

// Middleware to Initialize Browser without Proxy
async function ensureBrowserWithoutProxy(req, res, next) {
  try {
    if (!browserWithoutProxy || !browserWithoutProxy.isConnected()) {
      console.log("[INFO] Initializing browser without proxy...");
      browserWithoutProxy = await puppeteerExtra.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-notifications",
        ],
      });
    }
    next();
  } catch (error) {
    console.error("[ERROR] Failed to initialize browser without proxy:", error);
    res.status(500).json({ error: "Failed to initialize browser without proxy", details: error.message });
  }
}

// LinkedIn Authentication Endpoint
app.post("/auth", ensureBrowserWithProxy, async (req, res) => {
  const { linkedinUsername, linkedinPassword, emailUsername, emailPassword, emailHost, emailPort, captchaApiKey } = req.body;
  if (!linkedinUsername || !linkedinPassword) {
    return res.status(400).json({ error: "LinkedIn username and password are required" });
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
  } catch (err) {
    console.error("[ERROR] Authentication failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint for Scraping Job Listings
app.post("/scrape-jobs", ensureBrowserWithProxy, async (req, res) => {
  const { searchTerm, location, li_at, maxJobs = 50 } = req.body;
  if (!searchTerm || !location || !li_at) {
    return res.status(400).json({ error: "searchTerm, location, and li_at are required" });
  }
  try {
    const results = await getJobListings(browserWithProxy, searchTerm, location, li_at, maxJobs);
    res.status(200).json(results);
  } catch (error) {
    console.error("[ERROR] Failed to scrape jobs:", error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint for Fetching Job Details
app.post("/job-details", ensureBrowserWithProxy, async (req, res) => {
  const { jobUrl, li_at } = req.body;
  if (!jobUrl || !li_at) {
    return res.status(400).json({ error: "jobUrl and li_at are required" });
  }
  try {
    const jobDetails = await getJobDetails(browserWithProxy, jobUrl, li_at);
    res.status(200).json(jobDetails);
  } catch (error) {
    console.error("[ERROR] Failed to fetch job details:", error);
    res.status(500).json({ error: error.message });
  }
});

// Server Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[INFO] Server is running on port ${PORT}`);
});

module.exports = app;
