const puppeteerExtra = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const imap = require("imap-simple");

puppeteerExtra.use(StealthPlugin());

const getVerificationCodeFromEmail = async (emailConfig) => {
  // (existing email fetching logic remains unchanged)
};

const authenticateLinkedIn = async (credentials) => {
  let browser;
  try {
    console.log("[AUTH] Launching browser...");
    browser = await puppeteerExtra.launch({
      headless: "new",
      protocolTimeout: 120000,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();
    await page.setDefaultTimeout(120000);
    await page.setDefaultNavigationTimeout(180000);

    console.log("[AUTH] Starting login process");
    await page.goto("https://www.linkedin.com/login", { waitUntil: "networkidle0" });

    console.log("[AUTH] Filling credentials");
    await page.type("#username", credentials.linkedinUser);
    await page.type("#password", credentials.linkedinPass);

    console.log("[AUTH] Submitting login");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0" }),
      page.click(".btn__primary--large"),
    ]);

    console.log("[AUTH] Post-login URL:", page.url());
    console.log("[AUTH] Post-login Page Title:", await page.title());

    console.log("[AUTH] Checking for Security Verification page...");
    if ((await page.title()).includes("Security Verification")) {
      console.log("[AUTH] Security verification required");
      const verificationCode = await getVerificationCodeFromEmail(credentials.email);
      console.log("[AUTH] Applying verification code:", verificationCode);

      await page.waitForSelector('[name="pin"]', { timeout: 20000 }).catch((error) => {
        console.error("[DEBUG] Verification input not found:", error);
        throw new Error("Verification input not found. Check if the page structure has changed.");
      });

      await page.type('[name="pin"]', verificationCode);

      await Promise.all([
        page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll("button"));
          const targetButton = buttons.find((button) => {
            const text = button.textContent.toLowerCase();
            return ["verificar", "enviar", "submit", "verify", "send"].some((word) =>
              text.includes(word)
            );
          });
          if (targetButton) targetButton.click();
        }),
        page.waitForNavigation({ waitUntil: "networkidle0", timeout: 120000 }),
      ]).catch(async (error) => {
        console.error("[DEBUG] Navigation timeout or error. Falling back to manual URL check.", error);
        let attempts = 0;
        const maxAttempts = 24; // Retry for 2 minutes
        while (!page.url().includes("/feed") && attempts < maxAttempts) {
          console.log("[DEBUG] Waiting for redirection... Current URL:", page.url());
          await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds
          attempts++;
        }

        if (!page.url().includes("/feed")) {
          throw new Error(`Failed to navigate to LinkedIn feed. Current URL: ${page.url()}`);
        }
      });

      console.log("[DEBUG] Page title after verification:", await page.title());
      console.log("[DEBUG] Current URL after verification:", page.url());
      const errorMessage = await page.evaluate(() => {
        const errorElement = document.querySelector(".error-message-class");
        return errorElement ? errorElement.textContent : null;
      });
      if (errorMessage) {
        console.error("[DEBUG] Error message on page:", errorMessage);
      }
    }

    console.log("[AUTH] Retrieving cookies...");
    const cookies = await page.cookies();
    console.log("[DEBUG] Retrieved cookies:", cookies);

    if (!page.url().includes("/feed")) {
      console.log("[DEBUG] Not on /feed page. Current URL:", page.url());
      throw new Error("Login failed - not redirected to /feed page.");
    }

    const liAtCookie = cookies.find((c) => c.name === "li_at");
    if (!liAtCookie) {
      console.log("[DEBUG] li_at cookie not found. Ensure additional authentication steps are not required.");
      throw new Error("Login failed - cookie not found");
    }

    console.log("[AUTH] Authentication successful");
    return liAtCookie.value;
  } finally {
    if (browser) {
      console.log("[AUTH] Closing browser...");
      await browser.close();
    }
  }
};

module.exports = { authenticateLinkedIn };
