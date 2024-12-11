const puppeteerExtra = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const imap = require("imap-simple");
const fs = require("fs"); // For saving screenshots
const path = require("path");
const nodemailer = require("nodemailer"); // For sending emails

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

const getVerificationCodeFromEmail = async (emailConfig) => {
  // (existing email fetching logic remains unchanged)
};

const authenticateLinkedIn = async (credentials, proxyConfig) => {
  let browser;
  try {
    console.log("[AUTH] Launching browser with residential proxy...");
    const args = proxyConfig
      ? [`--proxy-server=http://${proxyConfig.host}:${proxyConfig.port}`]
      : [];

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
      page.waitForNavigation({ waitUntil: "networkidle0" }),
      page.click(".btn__primary--large"),
    ]);

    console.log("[AUTH] Post-login URL:", page.url());
    console.log("[AUTH] Post-login Page Title:", await page.title());

    if ((await page.title()).includes("Security Verification")) {
      console.error("[AUTH] CAPTCHA encountered. Aborting...");
      throw new Error("CAPTCHA encountered during login");
    }

    console.log("[AUTH] Retrieving cookies...");
    const cookies = await page.cookies();
    const liAtCookie = cookies.find((cookie) => cookie.name === "li_at");

    if (!liAtCookie) {
      console.error("[AUTH] li_at cookie not found.");
      throw new Error("Login failed - li_at cookie not found.");
    }

    console.log("[AUTH] Authentication successful!");
    return liAtCookie.value;
  } finally {
    if (browser) {
      console.log("[AUTH] Closing browser...");
      await browser.close();
    }
  }
};

// Example Usage
const proxyConfig = {
  host: "geo.iproyal.com",
  port: "12321",
  username: "d4Xzafgb5TJfSLpI",
  password: "YQhSnyw789HDtj4u_country-br_city-curitiba_streaming-1",
};

authenticateLinkedIn(
  { linkedinUser: "your-email@example.com", linkedinPass: "your-password" },
  proxyConfig
).then((cookie) => {
  console.log("Authenticated successfully with li_at cookie:", cookie);
}).catch((error) => {
  console.error("Authentication failed:", error);
});
