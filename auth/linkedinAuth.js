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

      // Wait for LinkedIn homepage to load with increased timeout
      await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 });

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
