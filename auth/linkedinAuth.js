const puppeteer = require("puppeteer");
const { ProxyAgent } = require("undici");
const fetch = require("node-fetch");

class LinkedInAuthManager {
  async loginWithVerificationAndCaptcha(
    linkedinUsername,
    linkedinPassword,
    emailUsername,
    emailPassword,
    emailHost,
    emailPort,
    captchaApiKey
  ) {
    const proxyUrl = "http://geo.iproyal.com:12321";
    const username = "d4Xzafgb5TJfSLpI";
    const password = "YQhSnyw789HDtj4u_country-br_city-curitiba_streaming-1";

    try {
      // Test Proxy
      const proxyAgent = new ProxyAgent(proxyUrl, {
        headers: {
          "Proxy-Authorization": `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
        },
      });

      const response = await fetch("https://www.linkedin.com/login", { dispatcher: proxyAgent });
      if (!response.ok) {
        throw new Error(`Proxy test failed with status ${response.status}`);
      }

      // Launch Puppeteer
      const browser = await puppeteer.launch({
        headless: false, // Debug mode
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          `--proxy-server=${proxyUrl}`,
        ],
      });

      const page = await browser.newPage();

      // Configure Proxy Authentication
      await page.authenticate({ username, password });

      // Set User-Agent
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36"
      );

      // Navigate to LinkedIn login page
      try {
        await page.goto("https://www.linkedin.com/login", { waitUntil: "networkidle2", timeout: 120000 });
        console.log("[INFO] Successfully accessed LinkedIn login page.");
      } catch (error) {
        console.error("[ERROR] Navigation timeout or error occurred. Capturing screenshot...");
        await page.screenshot({ path: "login_timeout.png" });
        throw error;
      }

      // Perform login
      await page.type("#username", linkedinUsername);
      await page.type("#password", linkedinPassword);
      await page.click("button[type=submit]");

      // Wait for successful login
      await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 120000 });

      // Extract cookie li_at
      const cookies = await page.cookies();
      const li_at = cookies.find((cookie) => cookie.name === "li_at")?.value;

      if (!li_at) {
        throw new Error("Failed to retrieve li_at cookie.");
      }

      console.log("[INFO] Authentication successful. Returning li_at cookie.");
      await browser.close();
      return li_at;
    } catch (error) {
      console.error("[ERROR] LinkedIn login failed:", error);
      throw error;
    }
  }
}

module.exports = LinkedInAuthManager;
