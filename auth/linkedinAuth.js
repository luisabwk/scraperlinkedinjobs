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

  console.log(`[DEBUG] Email config: ${config.imap.user} / ${config.imap.host}`);

  try {
    const connection = await imap.connect(config);
    console.log("[DEBUG] Connected to IMAP server");
    
    await connection.openBox("INBOX");
    console.log("[DEBUG] Opened INBOX");

    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      console.log(`[DEBUG] Search attempt ${attempts + 1}`);

      const searchCriteria = [
        "UNSEEN",
        ["SUBJECT", "Aqui está seu código de verificação"],
        ["FROM", "security-noreply@linkedin.com"],
        ["SINCE", new Date(Date.now() - 1000 * 60 * 5)]
      ];

      console.log("[DEBUG] Search criteria:", JSON.stringify(searchCriteria));
      
      const fetchOptions = { bodies: ["TEXT", "HEADER"], markSeen: false };
      const messages = await connection.search(searchCriteria, fetchOptions);
      console.log(`[DEBUG] Found ${messages.length} messages`);

      for (const message of messages) {
        const text = message.parts.find(part => part.which === "TEXT");
        if (text) {
          const matches = text.body.match(/\b\d{6}\b/);
          if (matches) {
            console.log("[DEBUG] Found verification code");
            await connection.end();
            return matches[0];
          }
        }
      }

      attempts++;
      if (attempts < maxAttempts) {
        console.log("[DEBUG] No code found, waiting 5s");
        await delay(5000);
      }
    }

    await connection.end();
    throw new Error("Verification code not found after maximum attempts");
  } catch (error) {
    console.error("[DEBUG] IMAP error:", error);
    throw new Error(`Email verification failed: ${error.message}`);
  }
};

const authenticateLinkedIn = async (username, password) => {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      protocolTimeout: 60000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ],
      ignoreHTTPSErrors: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH
    });

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
      console.log("[DEBUG] Security verification needed");
      const verificationCode = await getVerificationCodeFromEmail();
      console.log("[DEBUG] Got verification code");
      
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
    if (browser) await browser.close();
  }
};

module.exports = { authenticateLinkedIn };
