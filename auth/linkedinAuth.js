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
      console.log("[INFO] Testing proxy with LinkedIn login page...");
      const proxyAgent = new ProxyAgent(proxyUrl, {
        headers: {
          "Proxy-Authorization": `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
        },
      });

      const response = await fetch("https://www.linkedin.com/login", {
        dispatcher: proxyAgent,
        timeout: 120000,
      });

      if (!response.ok) {
        throw new Error(`Proxy test failed with status ${response.status}`);
      }

      console.log("[INFO] Proxy test successful. Launching Puppeteer...");
      const browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          `--proxy-server=${proxyUrl}`,
        ],
        protocolTimeout: 120000, // Timeout global para Puppeteer
        dumpio: true, // Habilita logs detalhados
      });

      const page = await browser.newPage();
      await page.authenticate({ username, password });
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36"
      );

      console.log("[INFO] Navigating to LinkedIn login page...");
      await page.goto("https://www.linkedin.com/login", { waitUntil: "networkidle2", timeout: 120000 });

      console.log("[INFO] Filling login credentials...");
      await page.waitForSelector("#username", { timeout: 60000 });
      await page.type("#username", linkedinUsername);
      await page.type("#password", linkedinPassword);

      console.log("[INFO] Attempting to login...");
      await page.click(".btn__primary--large.from__button--floating");

      try {
        console.log("[INFO] Waiting for navigation to complete...");
        await page.waitForSelector(".global-nav__primary-link", { timeout: 120000 });
        console.log("[INFO] Successfully logged in and reached the homepage.");
      } catch (error) {
        console.error("[ERROR] Navigation timeout. Capturing screenshot...");
        await page.screenshot({ path: "login_failed.png" });
        throw new Error("Timeout ao navegar para a página inicial após o login.");
      }

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
