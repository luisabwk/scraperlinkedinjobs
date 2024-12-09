const puppeteer = require("puppeteer");
const Imap = require("imap-simple");
const { simpleParser } = require("mailparser");

class LinkedInAuthManager {
  constructor(emailConfig) {
    this.emailConfig = emailConfig;
  }

  async getVerificationCode() {
    const imapConfig = {
      imap: {
        user: this.emailConfig.email,
        password: this.emailConfig.password,
        host: this.emailConfig.host,
        port: 993,
        tls: true,
        authTimeout: 3000,
      },
    };

    return new Promise((resolve, reject) => {
      Imap.connect(imapConfig).then((connection) => {
        connection.openBox("INBOX").then(() => {
          const searchCriteria = ["UNSEEN", ["FROM", "security-noreply@linkedin.com"]];
          const fetchOptions = { bodies: ["HEADER.FIELDS (FROM)", "TEXT"] };

          connection.search(searchCriteria, fetchOptions).then((messages) => {
            if (messages.length === 0) {
              return reject(new Error("Nenhum e-mail de verificação encontrado."));
            }

            const latestEmail = messages[messages.length - 1];
            const body = latestEmail.parts.find((part) => part.which === "TEXT").body;

            const codeMatch = body.match(/\b\d{6}\b/);
            if (codeMatch) {
              resolve(codeMatch[0]); // Retorna o código de 6 dígitos
            } else {
              reject(new Error("Código de verificação não encontrado no e-mail."));
            }
          });
        });
      }).catch(reject);
    });
  }

  async getCookie(username, password) {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    try {
      await page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded" });
      await page.type("#username", username);
      await page.type("#password", password);
      await page.click("button[type=submit]");

      const verificationCode = await this.getVerificationCode();
      console.log("[INFO] Código de verificação obtido:", verificationCode);

      await page.type("#input__phone_verification_pin", verificationCode);
      await page.click("button[type=submit]");

      await page.waitForNavigation();

      const cookies = await page.cookies();
      const li_at = cookies.find((cookie) => cookie.name === "li_at")?.value;
      if (!li_at) {
        throw new Error("Erro ao obter o cookie li_at.");
      }

      return li_at;
    } finally {
      await browser.close();
    }
  }
}

module.exports = LinkedInAuthManager;
