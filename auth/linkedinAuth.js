const puppeteer = require("puppeteer");
const imap = require("imap-simple");
require('dotenv').config();

const getVerificationCodeFromEmail = async () => {
  const config = {
    imap: {
      user: process.env.EMAIL_USER,
      password: process.env.EMAIL_PASSWORD,
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT) || 993,
      tls: true,
      authTimeout: 3000,
      tlsOptions: { rejectUnauthorized: false }
    }
  };

  try {
    console.log("[AUTH] Connecting to email server...");
    const connection = await imap.connect(config);
    await connection.openBox("INBOX");

    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      console.log(`[AUTH] Searching for verification email (attempt ${attempts + 1}/${maxAttempts})`);
      
      const searchCriteria = [
        ["UNSEEN"],
        ["FROM", "security-noreply@linkedin.com"],
        ["SUBJECT", "Aqui está seu código de verificação"],
        ["SINCE", new Date(Date.now() - 1000 * 60 * 5)]
      ];
      
      const fetchOptions = { bodies: ["HEADER.FIELDS (SUBJECT)", "TEXT"], markSeen: true };
      const messages = await connection.search(searchCriteria, fetchOptions);

      for (const message of messages) {
        const subject = message.parts.find(part => part.which === "HEADER.FIELDS (SUBJECT)");
        const body = message.parts.find(part => part.which === "TEXT");

        if (subject && body) {
          const verificationCode = body.body.match(/\b\d{6}\b/);
          if (verificationCode) {
            connection.end();
            return verificationCode[0];
          }
        }
      }

      attempts++;
      if (attempts < maxAttempts) {
        await delay(10000);
      }
    }

    connection.end();
    throw new Error("Verification code not found after maximum attempts");
  } catch (error) {
    throw new Error(`Failed to get verification code: ${error.message}`);
  }
};

const authenticateLinkedIn = async (username, password) => {
  let authBrowser;
  try {
    authBrowser = await puppeteer.launch({
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
        '--disable-extensions'
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH
    });

    const page = await authBrowser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');

    console.log("[AUTH] Starting login process");
    await page.goto("https://www.linkedin.com/login", { waitUntil: "networkidle0" });

    console.log("[AUTH] Filling credentials");
    await page.type("#username", username);
    await page.type("#password", password);

    console.log("[AUTH] Submitting login");
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      page.click(".btn__primary--large")
    ]);

    const pageTitle = await page.title();
    if (pageTitle.includes('Security Verification')) {
      console.log("[AUTH] Security verification detected");
      
      try {
        const verificationCode = await getVerificationCodeFromEmail();
        console.log("[AUTH] Verification code obtained");
        
        await page.type(".input_verification_pin", verificationCode);
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle0' }),
          page.click(".btn__primary--large")
        ]);
      } catch (error) {
        throw new Error(`Verification failed: ${error.message}`);
      }
    }

    const cookies = await page.cookies();
    const liAtCookie = cookies.find((cookie) => cookie.name === "li_at");

    if (!liAtCookie) {
      throw new Error("Login failed - li_at cookie not found");
    }

    console.log("[AUTH] Authentication successful");
    return liAtCookie.value;

  } catch (error) {
    console.error("[AUTH] Authentication failed:", error.message);
    throw new Error(`LinkedIn authentication failed: ${error.message}`);
  } finally {
    if (authBrowser) {
      await authBrowser.close();
    }
  }
};

module.exports = { authenticateLinkedIn };
