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
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 30000,
      keepalive: true
    }
  };

  try {
    const connection = await imap.connect(config);
    await connection.openBox("INBOX");
    
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      const searchCriteria = [
        ["UNSEEN"],
        ["FROM", "security-noreply@linkedin.com"],
        ["SUBJECT", "Aqui está seu código de verificação"],
        ["SINCE", new Date(Date.now() - 1000 * 60 * 5)]
      ];
      
      const fetchOptions = { bodies: ["TEXT", "HEADER"], markSeen: false };
      const messages = await connection.search(searchCriteria, fetchOptions);

      for (const message of messages) {
        const text = message.parts.find(part => part.which === "TEXT");
        if (text && text.body.match(/\b\d{6}\b/)) {
          await connection.end();
          return text.body.match(/\b\d{6}\b/)[0];
        }
      }

      if (++attempts < maxAttempts) await delay(5000);
    }

    await connection.end();
    throw new Error("Verification code not found");
  } catch (error) {
    throw new Error(`Email verification failed: ${error.message}`);
  }
};

const authenticateLinkedIn = async (username, password) => {
  const browser = await puppeteer.launch({
    headless: "new",
    protocolTimeout: 60000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-features=site-per-process'
    ],
    ignoreHTTPSErrors: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH
  });

  try {
    const page = await browser.newPage();
    await page.setDefaultTimeout(60000);
    await page.setDefaultNavigationTimeout(60000);
    
    await page.goto("https://www.linkedin.com/login", { waitUntil: "networkidle0" });
    await page.type("#username", username);
    await page.type("#password", password);
    
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      page.click(".btn__primary--large")
    ]);

    if ((await page.title()).includes('Security Verification')) {
      const verificationCode = await getVerificationCodeFromEmail();
      await page.type(".input_verification_pin", verificationCode);
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0' }),
        page.click(".btn__primary--large")
      ]);
    }

    const cookies = await page.cookies();
    const liAtCookie = cookies.find(c => c.name === "li_at");
    if (!liAtCookie) throw new Error("Login failed - cookie not found");

    return liAtCookie.value;
  } finally {
    await browser.close();
  }
};

module.exports = { authenticateLinkedIn };
