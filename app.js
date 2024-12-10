const express = require("express");
const cors = require("cors");
const puppeteer = require("puppeteer");
const { authenticateLinkedIn } = require("./auth/linkedinAuth");
const getJobListings = require("./jobs/scrape-jobs");
const getJobDetails = require("./jobs/job-details");

// Load environment variables
require('dotenv').config();

const app = express();

// Middleware setup
app.use(express.json());
app.use(cors());

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("[ERROR] Unexpected error:", err);
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined
  });
});

// Global Puppeteer browser instance
let browser;

// Initialize browser
async function initializeBrowser() {
  try {
    browser = await puppeteer.launch({
      headless: true,
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
      executablePath: process.env.CHROME_BIN || null
    });
    console.log("[INFO] Browser initialized successfully");
    
    // Restart browser if it crashes
    browser.on('disconnected', async () => {
      console.log("[WARN] Browser disconnected. Reinitializing...");
      await initializeBrowser();
    });
  } catch (error) {
    console.error("[ERROR] Failed to initialize browser:", error);
    throw error;
  }
}

// Authentication endpoint
app.post("/auth", async (req, res) => {
  const { username, password, emailConfig } = req.body;

  if (!username || !password || !emailConfig) {
    return res.status(400).json({
      error: "Missing required parameters",
      requiredFields: ['username', 'password', 'emailConfig']
    });
  }

  try {
    const liAtCookie = await authenticateLinkedIn(emailConfig, username, password);
    res.status(200).json({
      message: "Authentication successful",
      li_at: liAtCookie
    });
  } catch (error) {
    console.error("[ERROR] Authentication failed:", error);
    res.status(401).json({
      error: "Authentication failed",
      message: error.message
    });
  }
});

// Job scraping endpoint
app.post("/scrape-jobs", async (req, res) => {
  const { searchTerm, location, li_at, maxJobs = 50 } = req.body;

  if (!searchTerm || !location || !li_at) {
    return res.status(400).json({
      error: "Missing required parameters",
      requiredFields: ['searchTerm', 'location', 'li_at']
    });
  }

  try {
    const jobs = await getJobListings(browser, searchTerm, location, li_at, maxJobs);
    res.status(200).json({
      message: "Jobs scraped successfully",
      totalJobs: jobs.totalVagas,
      jobs: jobs.vagas
    });
  } catch (error) {
    console.error("[ERROR] Job scraping failed:", error);
    res.status(500).json({
      error: "Failed to scrape jobs",
      message: error.message
    });
  }
});

// Job details endpoint
app.post("/job-details", async (req, res) => {
  const { jobUrl, li_at } = req.body;

  if (!jobUrl || !li_at) {
    return res.status(400).json({
      error: "Missing required parameters",
      requiredFields: ['jobUrl', 'li_at']
    });
  }

  try {
    const jobDetails = await getJobDetails(browser, jobUrl, li_at);
    res.status(200).json({
      message: "Job details retrieved successfully",
      jobDetails
    });
  } catch (error) {
    console.error("[ERROR] Failed to get job details:", error);
    res.status(500).json({
      error: "Failed to retrieve job details",
      message: error.message
    });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    browserStatus: browser && !browser.disconnected ? "connected" : "disconnected"
  });
});

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('[ERROR] Unhandled Rejection:', reason);
  // Attempt to reinitialize browser if it's a browser-related error
  if (reason.message?.includes('browser')) {
    initializeBrowser().catch(console.error);
  }
});

process.on('uncaughtException', (error) => {
  console.error('[ERROR] Uncaught Exception:', error);
  // Attempt to reinitialize browser if it's a browser-related error
  if (error.message?.includes('browser')) {
    initializeBrowser().catch(console.error);
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[INFO] SIGTERM received. Cleaning up...');
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});

// Initialize and start server
const PORT = process.env.PORT || 8080;

async function startServer() {
  try {
    await initializeBrowser();
    app.listen(PORT, () => {
      console.log(`[INFO] Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('[ERROR] Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
