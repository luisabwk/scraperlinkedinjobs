const puppeteer = require("puppeteer");
const axios = require("axios");

class LinkedInAuthManager {
  constructor() {}

  async getCookie(username, password, emailConfig, captchaApiKey) {
    let browser, page;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      page = await browser.newPage();

      // Open LinkedIn login page
      await page.goto("https://www.linkedin.com/login", { waitUntil: "networkidle2" });

      // Fill login credentials
      await page.type("#username", username, { delay: 100 });
      await page.type("#password", password, { delay: 100 });

      // Click the login button
      await page.click(".btn__primary--large");
      await page.waitForTimeout(3000); // Wait for page load

      // Check for captcha
      const captchaExists = await page.$(".captcha-container");
      if (captchaExists) {
        console.log("[INFO] Captcha detected. Attempting to solve...");

        const captchaSolution = await this.solveCaptcha(page, captchaApiKey);
        if (!captchaSolution) {
          throw new Error("Unable to solve captcha automatically.");
        }

        // Enter the captcha solution
        await page.type("#captcha-field", captchaSolution, { delay: 100 });
        await page.click(".btn__primary--large");
        await page.waitForNavigation({ waitUntil: "networkidle2" });
      }

      // Check for verification code email
      const verificationCode = await this.checkEmailForCode(emailConfig);
      if (verificationCode) {
        console.log("[INFO] Verification code found. Submitting...");
        await page.type("#input__email_verification_pin", verificationCode, { delay: 100 });
        await page.click("#email-pin-submit-button");
        await page.waitForNavigation({ waitUntil: "networkidle2" });
      }

      // Check for successful login
      const cookies = await page.cookies();
      const liAtCookie = cookies.find((cookie) => cookie.name === "li_at");

      if (!liAtCookie) {
        throw new Error("Login failed. Cookie 'li_at' not found.");
      }

      return liAtCookie.value;
    } catch (error) {
      throw new Error(`LinkedIn authentication failed: ${error.message}`);
    } finally {
      if (browser) await browser.close();
    }
  }

  async solveCaptcha(page, captchaApiKey) {
    try {
      const captchaImage = await page.$eval(".captcha-image", (img) => img.src);

      // Send captcha to solving service
      const response = await axios.post("http://2captcha.com/in.php", null, {
        params: {
          key: captchaApiKey,
          method: "base64",
          body: captchaImage.split(",")[1],
          json: 1,
        },
      });

      const { request } = response.data;
      if (!request) {
        console.error("[ERROR] Failed to send captcha for solving.");
        return null;
      }

      console.log("[INFO] Captcha sent for solving. Waiting for response...");

      // Wait for the captcha to be solved
      let solution = null;
      for (let i = 0; i < 10; i++) {
        await new Promise((resolve) => setTimeout(resolve, 5000));

        const result = await axios.get("http://2captcha.com/res.php", {
          params: {
            key: captchaApiKey,
            action: "get",
            id: request,
            json: 1,
          },
        });

        if (result.data.request === "CAPCHA_NOT_READY") {
          continue;
        }

        if (result.data.status === 1) {
          solution = result.data.request;
          break;
        }
      }

      if (!solution) {
        console.error("[ERROR] Failed to solve captcha.");
        return null;
      }

      console.log("[INFO] Captcha solved successfully.");
      return solution;
    } catch (error) {
      console.error("[ERROR] Error solving captcha:", error.message);
      return null;
    }
  }

  async checkEmailForCode(emailConfig) {
    const Imap = require("imap");
    const { simpleParser } = require("mailparser");

    return new Promise((resolve, reject) => {
      const imap = new Imap({
        user: emailConfig.email,
        password: emailConfig.password,
        host: emailConfig.host,
        port: emailConfig.port || 993,
        tls: true,
      });

      imap.once("ready", () => {
        imap.openBox("INBOX", true, (err, box) => {
          if (err) return reject(err);

          const searchCriteria = ["UNSEEN", ["FROM", "security-noreply@linkedin.com"], ["SUBJECT", "Aqui está seu código de verificação"]];
          imap.search(searchCriteria, (err, results) => {
            if (err) return reject(err);

            if (results.length === 0) {
              imap.end();
              return resolve(null);
            }

            const fetch = imap.fetch(results, { bodies: "" });
            fetch.on("message", (msg) => {
              msg.on("body", async (stream) => {
                const parsed = await simpleParser(stream);
                const codeMatch = parsed.subject.match(/\d{6}/);
                if (codeMatch) {
                  resolve(codeMatch[0]);
                }
              });
            });

            fetch.once("end", () => {
              imap.end();
            });
          });
        });
      });

      imap.once("error", (err) => reject(err));
      imap.connect();
    });
  }
}

module.exports = LinkedInAuthManager;
