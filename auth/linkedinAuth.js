const puppeteer = require("puppeteer");
const imap = require("imap-simple");

class LinkedInAuthManager {
  async authenticate(username, password, emailConfig) {
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });

      const page = await browser.newPage();
      await page.goto("https://www.linkedin.com/login");

      await page.type("#username", username);
      await page.type("#password", password);
      await page.click("button[type='submit']");
      await page.waitForNavigation();

      if (await this.isVerificationRequired(page)) {
        const verificationCode = await this.fetchVerificationCode(emailConfig);
        if (!verificationCode) {
          throw new Error("Failed to retrieve verification code");
        }

        await page.type("input#input__email_verification_pin", verificationCode);
        await page.click("button[type='submit']");
        await page.waitForNavigation();
      }

      const cookies = await page.cookies();
      const li_atCookie = cookies.find((cookie) => cookie.name === "li_at");
      if (!li_atCookie) {
        throw new Error("li_at cookie not found after login");
      }

      return li_atCookie.value;
    } catch (error) {
      console.error("[ERROR] Authentication failed:", error);
      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  async isVerificationRequired(page) {
    try {
      await page.waitForSelector("input#input__email_verification_pin", { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async fetchVerificationCode(emailConfig) {
    const config = {
      imap: {
        user: emailConfig.username,
        password: emailConfig.password,
        host: emailConfig.host,
        port: 993,
        tls: true,
      },
    };

    const connection = await imap.connect(config);
    await connection.openBox("INBOX");

    const searchCriteria = [["UNSEEN"], ["HEADER", "SUBJECT", "Aqui está seu código de verificação"]];
    const fetchOptions = { bodies: ["HEADER"], markSeen: true };
    const messages = await connection.search(searchCriteria, fetchOptions);

    if (messages.length === 0) {
      return null;
    }

    const subject = messages[0].parts[0].body.subject[0];
    const match = subject.match(/\b\d{6}\b/);

    return match ? match[0] : null;
  }
}

module.exports = LinkedInAuthManager;
