const puppeteer = require("puppeteer");
const imap = require("imap-simple");

async function getVerificationCodeFromEmail(emailConfig) {
  const config = {
    imap: {
      user: emailConfig.email,
      password: emailConfig.password,
      host: emailConfig.host,
      port: 993,
      tls: true,
      authTimeout: 3000,
    },
  };

  try {
    const connection = await imap.connect(config);
    await connection.openBox("INBOX");

    const searchCriteria = [["UNSEEN"], ["SINCE", new Date()]];
    const fetchOptions = { bodies: ["HEADER.FIELDS (SUBJECT)"], markSeen: true };

    const messages = await connection.search(searchCriteria, fetchOptions);
    for (const message of messages) {
      const subject = message.parts[0].body.subject[0];
      const match = subject.match(/\d{6}/);
      if (match) {
        connection.end();
        return match[0];
      }
    }

    connection.end();
    throw new Error("Código de verificação não encontrado.");
  } catch (error) {
    throw new Error(`Erro ao buscar código de verificação: ${error.message}`);
  }
}

async function authenticateLinkedIn(emailConfig, username, password) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  try {
    await page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded" });
    await page.type("#username", username);
    await page.type("#password", password);
    await page.click(".btn__primary--large");

    try {
      await page.waitForSelector(".input_verification_pin", { timeout: 5000 });
      const verificationCode = await getVerificationCodeFromEmail(emailConfig);
      await page.type(".input_verification_pin", verificationCode);
      await page.click(".btn__primary--large");
    } catch (error) {
      console.log("[INFO] Verificação adicional não foi necessária.");
    }

    await page.waitForSelector("body", { timeout: 30000 });
    const cookies = await page.cookies();
    const liAtCookie = cookies.find((cookie) => cookie.name === "li_at");

    if (liAtCookie) {
      return liAtCookie.value;
    } else {
      throw new Error("Cookie li_at não encontrado.");
    }
  } catch (error) {
    throw new Error(`Erro ao autenticar no LinkedIn: ${error.message}`);
  } finally {
    await browser.close();
  }
}

module.exports = { authenticateLinkedIn, getVerificationCodeFromEmail };
