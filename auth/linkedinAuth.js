const puppeteer = require("puppeteer");
const imap = require("imap-simple");

const getVerificationCodeFromEmail = async (emailConfig) => {
  const config = {
    imap: {
      user: emailConfig.email,
      password: emailConfig.appPassword,
      host: emailConfig.host || "imap.gmail.com",
      port: emailConfig.port || 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 30000,
      keepalive: true
    }
  };

  try {
    const connection = await imap.connect(config);
    await connection.openBox("INBOX");

    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      const searchCriteria = [
        "UNSEEN",
        ["SUBJECT", "Aqui está seu código de verificação"],
        ["FROM", "security-noreply@linkedin.com"],
        ["SINCE", new Date(Date.now() - 1000 * 60 * 5)]
      ];
      
      const fetchOptions = { bodies: ["TEXT", "HEADER"], markSeen: false };
      const messages = await connection.search(searchCriteria, fetchOptions);

      for (const message of messages) {
        const text = message.parts.find(part => part.which === "TEXT");
        if (text) {
          const matches = text.body.match(/\b\d{6}\b/);
          if (matches) {
            await connection.end();
            return matches[0];
          }
        }
      }

      attempts++;
      if (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    await connection.end();
    throw new Error("Verification code not found");
  } catch (error) {
    throw new Error(`Email verification failed: ${error.message}`);
  }
};

const authenticateLinkedIn = async (credentials) => {
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
      executablePath: "/usr/bin/chromium"
    });

    const page = await browser.newPage();
    await page.setDefaultTimeout(60000);
    await page.setDefaultNavigationTimeout(60000);
    
    await page.goto("https://www.linkedin.com/login", { waitUntil: "networkidle0" });
    await page.type("#username", credentials.linkedinUser);
    await page.type("#password", credentials.linkedinPass);
    
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      page.click(".btn__primary--large")
    ]);

    if ((await page.title()).includes('Security Verification')) {
      const verificationCode = await getVerificationCodeFromEmail(credentials.email);
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
