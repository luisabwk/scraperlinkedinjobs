const express = require("express");
const cors = require("cors");
const puppeteerExtra = require("puppeteer-extra");
const { authenticateLinkedIn } = require("./auth/linkedinAuth");
const getJobListings = require("./jobs/scrape-jobs");
const getJobDetails = require("./jobs/job-details");

const app = express();
app.use(express.json());
app.use(cors());

let browser;

async function initializeBrowser() {
  try {
    browser = await puppeteerExtra.launch({
      headless: "new",
      protocolTimeout: 60000,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
      ignoreHTTPSErrors: true,
      executablePath: "/usr/bin/chromium",
    });
    console.log("[INFO] Browser initialized");
    return browser;
  } catch (error) {
    console.error("[ERROR] Browser initialization failed:", error);
    throw error;
  }
}
