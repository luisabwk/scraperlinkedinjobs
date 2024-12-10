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
      authTimeout: 10000,
      keepalive: true,
      debug: console.log
    }
  };

  try {
    console.log("[AUTH] Connecting to email server...");
    console.log(`[AUTH] Using email: ${config.imap.user}`);
    const connection = await imap.connect(config);
    
    await connection.openBox("INBOX");
    console.log("[AUTH] Connected to inbox");

    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      console.log(`[AUTH] Searching for verification email (attempt ${attempts + 1}/${maxAttempts})`);
      
      const searchCriteria = [
        ["UNSEEN"],
        ["FROM", "security-noreply@linkedin.com"],
        ["SUBJECT", "Aqui está seu código de verificação"],
        ["SINCE", new Date(Date.now() - 1000 * 60 * 5)]
      ];
      
      const fetchOptions = { 
        bodies: ["TEXT", "HEADER"], 
        markSeen: false 
      };

      const messages = await connection.search(searchCriteria, fetchOptions);
      console.log(`[AUTH] Found ${messages.length} messages`);

      for (const message of messages) {
        const text = message.parts.find(part => part.which === "TEXT");
        if (text) {
          const matches = text.body.match(/\b\d{6}\b/);
          if (matches) {
            await connection.end();
            console.log("[AUTH] Verification code found");
            return matches[0];
          }
        }
      }

      attempts++;
      if (attempts < maxAttempts) {
        console.log("[AUTH] No code found, waiting before next attempt...");
        await delay(5000);
      }
    }

    await connection.end();
    throw new Error("No verification code found after maximum attempts");
  } catch (error) {
    console.error("[AUTH] Email error:", error);
    throw new Error(`Email verification failed: ${error.message}`);
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
        '--disable-software-rasterizer',
        '--disable-features=site-per-process',
        '--memory-pressure-off',
        '--single-process',
        '--deterministic-fetch'
      ],
      ignoreHTTPSErrors: true,
      timeout: 30000,
      waitForInitialPage: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH
    });

    const page = await authBrowser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');
    await page.setDefaultNavigationTimeout(30000);

    console.log("[AUTH] Starting login process");
    await page.goto("https://www.linkedin.com/login", { 
      waitUntil: "networkidle0",
      timeout: 30000 
    });

    console.log("[AUTH] Filling credentials");
    await page.type("#username", username);
    await page.type("#password", password);

    console.log("[AUTH] Submitting login");
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }),
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
          page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }),
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
    if (authBrowser) await authBrowser.close();
  }
};

module.exports = { authenticateLinkedIn };
