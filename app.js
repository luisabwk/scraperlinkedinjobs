const express = require("express");
const cors = require("cors");
const puppeteer = require("puppeteer");
const { authenticateLinkedIn } = require("./auth/linkedinAuth");
const getJobListings = require("./jobs/scrape-jobs");
const getJobDetails = require("./jobs/job-details");

require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

let browser;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;

async function initializeBrowser() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error("[ERROR] Max reconnection attempts reached");
    process.exit(1);
  }

  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
        '--no-zygote',
        '--disable-extensions',
        '--disable-software-rasterizer',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
      ],
      ignoreHTTPSErrors: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH
    });

    console.log("[INFO] Browser initialized successfully");
    
    browser.on('disconnected', async () => {
      reconnectAttempts++;
      console.log(`[WARN] Browser disconnected. Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
      await initializeBrowser();
    });

    reconnectAttempts = 0;

  } catch (error) {
    console.error("[ERROR] Browser initialization failed:", error);
    process.exit(1);
  }
}

app.post("/scrape-jobs", async (req, res) => {
  const { searchTerm, location, username, password, maxJobs = 50 } = req.body;

  if (!searchTerm || !location || !username || !password) {
    return res.status(400).json({
      error: "Missing parameters",
      required: ['searchTerm', 'location', 'username', 'password']
    });
  }

  try {
    const li_at = await authenticateLinkedIn({ email: username }, username, password);
    console.log("[INFO] Authentication successful");

    const jobs = await getJobListings(browser, searchTerm, location, li_at, maxJobs);
    res.status(200).json(jobs);
  } catch (error) {
    console.error("[ERROR] Job scraping failed:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/job-details", async (req, res) => {
  const { jobUrl, username, password } = req.body;

  if (!jobUrl || !username || !password) {
    return res.status(400).json({
      error: "Missing parameters",
      required: ['jobUrl', 'username', 'password']
    });
  }

  try {
    const li_at = await authenticateLinkedIn({ email: username }, username, password);
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
    browserStatus: browser && !browser.disconnected ? "connected" : "disconnected",
    reconnectAttempts
  });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[ERROR] Unhandled Rejection:', reason);
  if (reason.message?.includes('browser')) {
    initializeBrowser().catch(console.error);
  }
});

process.on('uncaughtException', (error) => {
  console.error('[ERROR] Uncaught Exception:', error);
  if (error.message?.includes('browser')) {
    initializeBrowser().catch(console.error);
  }
});

process.on('SIGTERM', async () => {
  console.log('[INFO] SIGTERM received. Cleaning up...');
  if (browser) await browser.close();
  process.exit(0);
});

const PORT = process.env.PORT || 8080;

async function startServer() {
  try {
    await initializeBrowser();
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
