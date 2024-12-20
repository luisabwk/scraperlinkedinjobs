const puppeteer = require("puppeteer");
const Imap = require("imap");
const { simpleParser } = require("mailparser");

class LinkedInAuthManager {
  async loginWithVerification(
    linkedinUsername,
    linkedinPassword,
    emailUsername,
    emailPassword,
    emailHost,
    emailPort
  ) {
    let browser;

    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });

      const page = await browser.newPage();

      await page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded" });
      await page.type("#username", linkedinUsername, { delay: 100 });
      await page.type("#password", linkedinPassword, { delay: 100 });
      await page.click("[data-litms-control-urn='login-submit']");

      try {
        await page.waitForSelector("#input__email_verification_pin", { timeout: 5000 });
        const verificationCode = await this.getVerificationCode(
          emailUsername,
          emailPassword,
          emailHost,
          emailPort
        );

        await page.type("#input__email_verification_pin", verificationCode, { delay: 100 });
        await page.click("[data-litms-control-urn='verify-pin']");
      } catch (error) {
        console.warn("[WARN] Verification code input not found, proceeding...");
      }

      await page.waitForNavigation({ waitUntil: "domcontentloaded" });

      const cookies = await page.cookies();
      const liAtCookie = cookies.find((cookie) => cookie.name === "li_at");

      if (!liAtCookie) {
        throw new Error("li_at cookie not found after login");
      }

      return liAtCookie.value;
    } catch (error) {
      console.error("[ERROR] LinkedIn login failed:", error);
      throw error;
    } finally {
      if (browser) await browser.close();
    }
  }

  async getVerificationCode(emailUsername, emailPassword, emailHost, emailPort) {
    return new Promise((resolve, reject) => {
      const imap = new Imap({
        user: emailUsername,
        password: emailPassword,
        host: emailHost,
        port: emailPort,
        tls: true,
      });

      imap.once("ready", () => {
        imap.openBox("INBOX", false, (err, box) => {
          if (err) return reject(err);

          const searchCriteria = ["UNSEEN", ["FROM", "security-noreply@linkedin.com"]];
          const fetchOptions = { bodies: "", markSeen: true };

          imap.search(searchCriteria, (err, results) => {
            if (err) return reject(err);

            if (!results || results.length === 0) {
              return reject(new Error("No verification email found"));
            }

            const f = imap.fetch(results, fetchOptions);

            f.on("message", (msg) => {
              msg.on("body", (stream) => {
                simpleParser(stream, (err, mail) => {
                  if (err) return reject(err);

                  const subject = mail.subject || "";
                  const match = subject.match(/\d{6}/);
                  if (match) {
                    resolve(match[0]);
                  } else {
                    reject(new Error("No verification code found in email subject"));
                  }
                });
              });
            });

            f.once("end", () => {
              imap.end();
            });
          });
        });
      });

      imap.once("error", (err) => {
        reject(err);
      });

      imap.connect();
    });
  }
}

module.exports = LinkedInAuthManager;
