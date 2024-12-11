const puppeteerExtra = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const imap = require("imap-simple");

puppeteerExtra.use(StealthPlugin());

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
    console.log("[EMAIL] Config:", {
      user: config.imap.user,
      host: config.imap.host,
      port: config.imap.port,
      tls: config.imap.tls
    });

    const connection = await imap.connect(config);
    console.log("[EMAIL] Connecting to inbox...");
    await connection.openBox("INBOX");
    console.log("[EMAIL] Connected to inbox successfully");
    
    let attempts = 0;
    const maxAttempts = 20;

    while (attempts < maxAttempts) {
      console.log(`[EMAIL] Attempt ${attempts + 1}/${maxAttempts}`);
      
      const searchCriteria = [
        ["SUBJECT", "código de verificação"]
      ];
      
      const fetchOptions = { 
        bodies: ["HEADER.FIELDS (FROM SUBJECT)", "TEXT"],
        markSeen: false
      };

      const messages = await connection.search(searchCriteria, fetchOptions);
      console.log(`[EMAIL] Found ${messages.length} messages`);

      if (messages.length > 0) {
        const latestMessage = messages[messages.length - 1]; // Get the most recent message
        const header = latestMessage.parts.find(part => part.which === "HEADER.FIELDS (FROM SUBJECT)");
        console.log("[EMAIL] Latest message headers:", header?.body);
        
        if (header?.body?.from?.[0]?.includes("linkedin.com")) {
          console.log("[EMAIL] Found LinkedIn email:", header.body);
          const subject = header?.body?.subject?.[0];
          const codeMatch = subject?.match(/\d{6}/);
          if (codeMatch) {
            console.log("[EMAIL] Code found:", codeMatch[0]);
            await connection.end();
            return codeMatch[0];
          }
        } else {
          console.log("[EMAIL] No LinkedIn email found in latest message.");
        }
      } else {
        console.log("[EMAIL] No messages matching criteria.");
      }

      attempts++;
      if (attempts < maxAttempts) {
        console.log("[EMAIL] Retrying in 5 seconds...");
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    await connection.end();
    throw new Error("Code not found");
  } catch (error) {
    console.error("[EMAIL] Error:", error);
    throw new Error(`Email verification failed: ${error.message}`);
  }
};

const authenticateLinkedIn = async (credentials) => {
  let browser;
  try {
    console.log("[AUTH] Launching browser...");
    browser = await puppeteerExtra.launch({
      headless: "new",
      protocolTimeout: 120000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ],
      ignoreHTTPSErrors: true
    });

    const page = await browser.newPage();
    await page.setDefaultTimeout(120000);
    await page.setDefaultNavigationTimeout(120000);
    
    console.log("[AUTH] Starting login process");
    await page.goto("https://www.linkedin.com/login", { waitUntil: "networkidle0" });

    console.log("[AUTH] Filling credentials");
    await page.type("#username", credentials.linkedinUser);
    await page.type("#password", credentials.linkedinPass);
    
    console.log("[AUTH] Submitting login");
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      page.click(".btn__primary--large")
    ]);

    console.log("[AUTH] Checking for Security Verification page...");
    if ((await page.title()).includes('Security Verification')) {
      console.log("[AUTH] Security verification required");
      const verificationCode = await getVerificationCodeFromEmail(credentials.email);
      console.log("[AUTH] Applying verification code:", verificationCode);
      
      await page.type('[name="pin"]', verificationCode);

      await Promise.all([
        page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const targetButton = buttons.find(button => {
            const text = button.textContent.toLowerCase();
            return ['verificar', 'enviar', 'submit', 'verify', 'send'].some(word => text.includes(word));
          });
          if (targetButton) {
            console.log("[AUTH] Clicking verification button...");
            targetButton.click();
          }
        }),
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 120000 })
      ]).catch(async (error) => {
        console.error("[DEBUG] Navigation timeout or error. Falling back to manual URL check.", error);
        let attempts = 0;
        const maxAttempts = 24; // Retry for 2 minutes
        while (!page.url().includes('/feed') && attempts < maxAttempts) {
          console.log("[DEBUG] Waiting for redirection... Current URL:", page.url());
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
          attempts++;
        }

        if (!page.url().includes('/feed')) {
          throw new Error(`Failed to navigate to LinkedIn feed. Current URL: ${page.url()}`);
        }
      });

      console.log("[DEBUG] Page title after verification:", await page.title());
      console.log("[DEBUG] Current URL after verification:", page.url());
      const errorMessage = await page.evaluate(() => {
        const errorElement = document.querySelector('.error-message-class'); // Replace with actual error element if known
        return errorElement ? errorElement.textContent : null;
      });
      if (errorMessage) {
        console.error("[DEBUG] Error message on page:", errorMessage);
      }
    }

    console.log("[AUTH] Retrieving cookies...");
    const cookies = await page.cookies();
    console.log("[DEBUG] Retrieved cookies:", cookies);
    const liAtCookie = cookies.find(c => c.name === "li_at");
    if (!liAtCookie) {
      console.log("[DEBUG] li_at cookie not found. Ensure additional authentication steps are not required.");
      throw new Error("Login failed - cookie not found");
    }

    console.log("[AUTH] Authentication successful");
    return liAtCookie.value;
  } finally {
    if (browser) {
      console.log("[AUTH] Closing browser...");
      await browser.close();
    }
  }
};

module.exports = { authenticateLinkedIn };
