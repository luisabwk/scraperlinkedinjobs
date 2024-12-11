const puppeteerExtra = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs"); // For saving screenshots
const path = require("path");
const nodemailer = require("nodemailer"); // For sending emails
const { ProxyAgent } = require('undici'); // For testing proxy

puppeteerExtra.use(StealthPlugin());

const sendEmailWithScreenshot = async (screenshotPath, recipientEmail, emailConfig) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: emailConfig.email,
      pass: emailConfig.appPassword,
    },
  });

  const mailOptions = {
    from: emailConfig.email,
    to: recipientEmail,
    subject: "LinkedIn Automation Error Screenshot",
    text: "An error occurred during LinkedIn automation. Please find the screenshot attached.",
    attachments: [
      {
        filename: "screenshot_error.png",
        path: screenshotPath,
      },
    ],
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("[EMAIL] Screenshot sent successfully to", recipientEmail);
  } catch (error) {
    console.error("[EMAIL] Failed to send email:", error);
  }
};

const testProxy = async (proxyConfig) => {
  const proxyUrl = `http://${proxyConfig.username}:${proxyConfig.password}@${proxyConfig.host}:${proxyConfig.port}`;
  const client = new ProxyAgent(proxyUrl);
  const url = 'https://ipv4.icanhazip.com';

  try {
    console.log("[PROXY] Testing proxy...");
    const response = await fetch(url, { dispatcher: client });
    const data = await response.text();
    console.log("[PROXY] Proxy IP Address:", data.trim());
  } catch (error) {
    console.error("[PROXY] Proxy test failed:", error);
    throw new Error("Proxy test failed. Ensure the proxy credentials and server are correct.");
  }
};

const authenticateLinkedIn = async (credentials, proxyConfig) => {
  let browser;
  try {
    await testProxy(proxyConfig);

    console.log("[AUTH] Launching browser with residential proxy...");
    const args = [`--proxy-server=http://${proxyConfig.host}:${proxyConfig.port}`];

    browser = await puppeteerExtra.launch({
      headless: "new", // Use headful mode for debugging: set this to false
      args: [
        ...args,
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();

    // Authenticate proxy if credentials are provided
    if (proxyConfig && proxyConfig.username && proxyConfig.password) {
      console.log("[AUTH] Authenticating proxy...");
      await page.authenticate({
        username: proxyConfig.username,
        password: proxyConfig.password,
      });
    }

    // Rotate User-Agent
    const userAgent =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36";
    await page.setUserAgent(userAgent);

    // Navigate to LinkedIn
    console.log("[AUTH] Starting login process...");
    try {
      await page.goto("https://www.linkedin.com/login", { waitUntil: "networkidle0" });
    } catch (error) {
      console.error("[AUTH] Proxy connection failed. Error:", error.message);
      throw new Error("Proxy connection failed. Ensure the proxy credentials and server are correct.");
    }

    console.log("[AUTH] Filling credentials...");
    await page.type("#username", credentials.linkedinUser);
    await page.type("#password", credentials.linkedinPass);

    console.log("[AUTH] Submitting login...");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0", timeout: 120000 }),
      page.click(".btn__primary--large"),
    ]);

    console.log("[AUTH] Post-login URL:", page.url());
    console.log("[AUTH] Post-login Page Title:", await page.title());

    if (!page.url().includes("/feed")) {
      const screenshotPath = path.join(__dirname, "screenshot_post_login_error.png");
      await page.screenshot({ path: screenshotPath });
      console.log("[DEBUG] Screenshot saved to", screenshotPath);

      // Send the screenshot via email
      await sendEmailWithScreenshot(screenshotPath, credentials.email.email, {
        email: credentials.email.email,
        appPassword: credentials.email.appPassword,
      });

      throw new Error("Login failed - Not redirected to LinkedIn feed page. Screenshot captured.");
    }

    console.log("[AUTH] Retrieving cookies...");
    if (page.url().includes("/feed")) {
      const cookies = await page.cookies();
      const liAtCookie = cookies.find((cookie) => cookie.name === "li_at");

      if (!liAtCookie) {
        console.error("[AUTH] li_at cookie not found.");
        throw new Error("Login failed - li_at cookie not found.");
      }

      console.log("[AUTH] Authentication successful!");
      return liAtCookie.value;
    } else {
      throw new Error("Not on the expected feed page to fetch cookies.");
    }
  } finally {
    if (browser) {
      console.log("[AUTH] Closing browser...");
      await browser.close();
    }
  }
};

module.exports = { authenticateLinkedIn, testProxy, sendEmailWithScreenshot };
