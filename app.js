const express = require("express");
const cors = require("cors");
const puppeteer = require("puppeteer");
const { authenticateLinkedIn } = require("./auth/linkedinAuth");
const getJobListings = require("./jobs/scrape-jobs");
const getJobDetails = require("./jobs/job-details");

const app = express();
app.use(express.json());
app.use(cors());

let browser;

async function initializeBrowser() {
  try {
    browser = await puppeteer.launch({
      headless: "new",
      protocolTimeout: 60000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ],
      ignoreHTTPSErrors: true,
      executablePath: "/usr/bin/chromium"
    });
    console.log("[INFO] Browser initialized");
    return browser;
  } catch (error) {
    console.error("[ERROR] Browser initialization failed:", error);
    throw error;
  }
}

app.post("/scrape-jobs", async (req, res) => {
  const { searchTerm, location, credentials, maxJobs = 50 } = req.body;

  if (!searchTerm || !location || !credentials?.linkedinUser || !credentials?.linkedinPass || !credentials?.email) {
    return res.status(400).json({
      error: "Missing parameters",
      required: ['searchTerm', 'location', 'credentials.linkedinUser', 'credentials.linkedinPass', 'credentials.email']
    });
  }

  try {
    if (!browser || !browser.isConnected()) {
      browser = await initializeBrowser();
    }
    const li_at = await authenticateLinkedIn(credentials);
    const jobs = await getJobListings(browser, searchTerm, location, li_at, maxJobs);
    res.status(200).json(jobs);
  } catch (error) {
    console.error("[ERROR] Job scraping failed:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/job-details", async (req, res) => {
  const { jobUrl, credentials } = req.body;

  if (!jobUrl || !credentials?.linkedinUser || !credentials?.linkedinPass || !credentials?.email) {
    return res.status(400).json({
      error: "Missing parameters",
      required: ['jobUrl', 'credentials.linkedinUser', 'credentials.linkedinPass', 'credentials.email']
    });
  }

  try {
    if (!browser || !browser.isConnected()) {
      browser = await initializeBrowser();
    }
    const li_at = await authenticateLinkedIn(credentials);
    const jobDetails = await getJobDetails(browser, jobUrl, li_at);
    res.status(200).json({ success: true, jobDetails });
  } catch (error) {
    console.error("[ERROR] Job details fetch failed:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    browserStatus: browser?.isConnected() ? "connected" : "disconnected"
  });
});

process.on('SIGTERM', async () => {
  if (browser) await browser.close();
  process.exit(0);
});

const PORT = process.env.PORT || 8080;

async function startServer() {
  try {
    browser = await initializeBrowser();
    app.listen(PORT, () => {
      console.log(`[INFO] Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('[ERROR] Server startup failed:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
