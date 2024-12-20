const puppeteer = require("puppeteer");
const axios = require("axios");
const { ProxyAgent } = require("undici");

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
    try {
      const proxyUrl = "http://usuario:senha@_country-br_city-curitiba_streaming-1@geo.iproyal.com:12321";
      const proxyAgent = new ProxyAgent(proxyUrl, {
        headers: {
          'Proxy-Authorization': `Basic ${Buffer.from('usuario:senha').toString('base64')}`,
        },
      });

      const browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          `--proxy-server=${proxyUrl}`
        ],
      });

      const page = await browser.newPage();

      // Test Proxy
      const response = await fetch("https://icanhazip.com", {
        dispatcher: proxyAgent,
      });
      if (!response.ok) {
        throw new Error(`Proxy test failed with status ${response.status}`);
      }
      const ip = await response.text();
      console.log(`[INFO] Proxy IP in use: ${ip.trim()}`);

      await page.goto("https://www.linkedin.com/login", {
        waitUntil: "domcontentloaded",
      });

      await page.type("#username", linkedinUsername);
      await page.type("#password", linkedinPassword);
      await page.click("button[type=submit]");

      // Check for CAPTCHA
      if (await page.$(".captcha-internal")) {
        console.log("[INFO] CAPTCHA detected. Attempting to solve...");

        const captchaImageSrc = await page.$eval(".captcha-internal img", (img) => img.src);
        const solvedCaptcha = await this.solveCaptcha(captchaApiKey, captchaImageSrc);

        if (!solvedCaptcha) {
          throw new Error("Failed to solve CAPTCHA");
        }

        await page.type("#captcha-answer", solvedCaptcha);
        await page.click("button[type=submit]");
      }

      // Check for additional verification step
      const verificationPageContent = await page.content();

      if (verificationPageContent.includes("verification code")) {
        console.log("[INFO] Email verification step detected.");

        const verificationCode = await this.getVerificationCodeFromEmail(
          emailUsername,
          emailPassword,
          emailHost,
          emailPort
        );

        if (verificationCode) {
          const verificationInput = await page.$("#input__email_verification_pin");
          if (!verificationInput) {
            throw new Error("Verification input field not found");
          }
          await verificationInput.type(verificationCode);
          await page.click("button[type=submit]");
        } else {
          throw new Error("Verification code not received from email");
        }
      } else if (verificationPageContent.includes("phone verification")) {
        console.log("[INFO] Phone verification step detected. Please complete manually.");
        throw new Error("Phone verification is not supported in this automation.");
      } else {
        console.log("[INFO] No additional verification required.");
      }

      // Wait for multiple indicators of success
      try {
        const success = await Promise.race([
          page.waitForSelector(".global-nav__primary-link", { timeout: 60000 }),
          page.waitForFunction(
            () => document.querySelector("body").innerText.includes("Welcome"),
            { timeout: 60000 }
          ),
        ]);

        if (!success) {
          throw new Error("Failed to detect LinkedIn homepage load");
        }
      } catch (e) {
        console.error("[ERROR] Navigation or detection failed. Capturing screenshot...");
        await page.screenshot({ path: "navigation_error.png" });
        throw new Error("Timeout waiting for LinkedIn homepage or element detection");
      }

      const cookies = await page.cookies();
      const li_at = cookies.find((cookie) => cookie.name === "li_at")?.value;

      if (!li_at) {
        throw new Error("Failed to retrieve li_at cookie");
      }

      await browser.close();
      return li_at;
    } catch (error) {
      console.error("[ERROR] LinkedIn login failed:", error);
      throw error;
    }
  }

  async solveCaptcha(apiKey, imageUrl) {
    try {
      const response = await axios.post(
        "http://2captcha.com/in.php",
        null,
        {
          params: {
            key: apiKey,
            method: "base64",
            body: imageUrl,
            json: 1,
          },
        }
      );

      if (response.data.status !== 1) {
        throw new Error("Failed to submit CAPTCHA");
      }

      const captchaId = response.data.request;

      // Wait for CAPTCHA to be solved
      let solvedCaptcha;
      for (let i = 0; i < 10; i++) {
        await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds

        const result = await axios.get("http://2captcha.com/res.php", {
          params: {
            key: apiKey,
            action: "get",
            id: captchaId,
            json: 1,
          },
        });

        if (result.data.status === 1) {
          solvedCaptcha = result.data.request;
          break;
        }
      }

      if (!solvedCaptcha) {
        throw new Error("Failed to solve CAPTCHA within time limit");
      }

      return solvedCaptcha;
    } catch (error) {
      console.error("[ERROR] CAPTCHA solving failed:", error);
      throw error;
    }
  }

  async getVerificationCodeFromEmail(emailUsername, emailPassword, emailHost, emailPort) {
    // Implementation to connect to the email server and extract the verification code
    console.log("[INFO] Mocking email verification process...");
    return "123456"; // Replace this with real implementation
  }
}

module.exports = LinkedInAuthManager;
