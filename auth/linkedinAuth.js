const puppeteer = require("puppeteer");
const HttpsProxyAgent = require("https-proxy-agent");
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
    const proxyAgent = new HttpsProxyAgent(proxyUrl, {
      username: "d4Xzafgb5TJfSLpI",
      password: "YQhSnyw789HDtj4u_country-br_city-curitiba_streaming-1",
    });

    try {
      // Test Proxy by accessing LinkedIn login page
      console.log("[INFO] Testing proxy with LinkedIn login page...");
      const response = await fetch("https://www.linkedin.com/login", { agent: proxyAgent });
      if (!response.ok) {
        throw new Error(`Proxy test failed with status ${response.status}`);
      }
      console.log(`[INFO] Proxy successfully accessed LinkedIn login page.`);

      const browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          `--proxy-server=${proxyUrl}`,
          "--ignore-certificate-errors",
        ],
      });

      const page = await browser.newPage();
      await page.authenticate({
        username: "d4Xzafgb5TJfSLpI",
        password: "YQhSnyw789HDtj4u",
      });

      await page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded" });

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
