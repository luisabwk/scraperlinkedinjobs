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
      // Test Proxy by accessing LinkedIn login page
      console.log("[INFO] Testing proxy with LinkedIn login page...");
      const proxyAgent = new ProxyAgent(proxyUrl, {
        headers: {
          "Proxy-Authorization": `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
        },
      });

      const response = await fetch("https://www.linkedin.com/login", { dispatcher: proxyAgent });

      if (!response.ok) {
        throw new Error(`Proxy test failed with status ${response.status}`);
      }

      console.log("[INFO] Proxy successfully accessed LinkedIn login page.");

      // Launch Puppeteer with proxy
      const browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          `--proxy-server=${proxyUrl}`,
        ],
      });

      const page = await browser.newPage();

      // Configure Proxy Authentication
      await page.authenticate({ username, password });

      // Navigate to LinkedIn login page
      await page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded" });

      // Perform login
      await page.type("#username", linkedinUsername);
      await page.type("#password", linkedinPassword);
      await page.click("button[type=submit]");

      // Wait for successful login
      try {
        await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 });
        console.log("[INFO] Successfully logged in to LinkedIn.");
      } catch (error) {
        throw new Error("Login navigation timeout or error occurred.");
      }

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
