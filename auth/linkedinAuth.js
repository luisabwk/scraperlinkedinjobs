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
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-software-rasterizer",
    ]
  });

  const page = await browser.newPage();

  try {
    console.log("[AUTH] Iniciando processo de login");
    await page.goto("https://www.linkedin.com/login", { waitUntil: "networkidle0" });

    console.log("[AUTH] Preenchendo credenciais");
    await page.type("#username", username);
    await page.type("#password", password);

    console.log("[AUTH] Submetendo login");
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      page.click(".btn__primary--large")
    ]);

    // Verificar se há necessidade de verificação
    const pageTitle = await page.title();
    if (pageTitle.includes('Security Verification')) {
      console.log("[AUTH] Verificação de segurança detectada");
      try {
        const verificationCode = await getVerificationCodeFromEmail(emailConfig);
        console.log("[AUTH] Código de verificação obtido");
        await page.type(".input_verification_pin", verificationCode);
        await page.click(".btn__primary--large");
      } catch (error) {
        throw new Error(`Falha na verificação: ${error.message}`);
      }
    }

    // Aguardar navegação e cookies
    await page.waitForNavigation({ waitUntil: 'networkidle0' });
    console.log("[AUTH] Login realizado, buscando cookie");

    const cookies = await page.cookies();
    const liAtCookie = cookies.find((cookie) => cookie.name === "li_at");

    if (!liAtCookie) {
      throw new Error("Cookie li_at não encontrado após login.");
    }

    console.log("[AUTH] Cookie li_at obtido com sucesso");
    return liAtCookie.value;

  } catch (error) {
    console.error("[AUTH] Erro durante autenticação:", error.message);
    throw new Error(`Erro ao autenticar no LinkedIn: ${error.message}`);
  } finally {
    await browser.close();
  }
}

module.exports = { authenticateLinkedIn, getVerificationCodeFromEmail };
