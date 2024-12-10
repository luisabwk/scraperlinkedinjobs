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

async function initializeBrowser() {
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-extensions'
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH
    });
    
    browser.on('disconnected', async () => {
      console.log("[WARN] Browser disconnected. Reinitializing...");
      await initializeBrowser();
    });
  } catch (error) {
    console.error("[ERROR] Browser initialization failed:", error);
    throw error;
  }
}

app.post("/auth", async (req, res) => {
  const { username, password, emailConfig } = req.body;

  if (!username || !password || !emailConfig) {
    return res.status(400).json({
      error: "Missing parameters",
      required: ['username', 'password', 'emailConfig']
    });
  }

  try {
    const liAtCookie = await authenticateLinkedIn(emailConfig, username, password);
    res.status(200).json({ success: true, li_at: liAtCookie });
  } catch (error) {
    console.error("[ERROR] Authentication failed:", error);
    res.status(401).json({ error: error.message });
  }
});

app.post("/scrape-jobs", async (req, res) => {
  const { searchTerm, location, li_at, maxJobs = 50 } = req.body;

  if (!searchTerm || !location || !li_at) {
    return res.status(400).json({
      error: "Missing parameters",
      required: ['searchTerm', 'location', 'li_at']
    });
  }

  try {
    const jobs = await getJobListings(browser, searchTerm, location, li_at, maxJobs);
    res.status(200).json(jobs);
  } catch (error) {
    console.error("[ERROR] Job scraping failed:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/job-details", async (req, res) => {
  const { jobUrl, li_at } = req.body;

  if (!jobUrl || !li_at) {
    return res.status(400).json({
      error: "Missing parameters",
      required: ['jobUrl', 'li_at']
    });
  }

  try {
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
    browserStatus: browser && !browser.disconnected ? "connected" : "disconnected"
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
