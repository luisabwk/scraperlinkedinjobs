const puppeteer = require("puppeteer");
const axios = require("axios");

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
      const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });

      const page = await browser.newPage();

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

      // Additional verification via email
      const verificationCode = await this.getVerificationCodeFromEmail(
        emailUsername,
        emailPassword,
        emailHost,
        emailPort
      );

      if (verificationCode) {
        await page.type("#input__email_verification_pin", verificationCode);
        await page.click("button[type=submit]");
      }

      // Wait for LinkedIn homepage to load
      await page.waitForNavigation({ waitUntil: "networkidle2" });

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
