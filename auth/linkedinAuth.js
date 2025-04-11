const puppeteer = require("puppeteer");
const { ProxyAgent } = require("undici");
const fetch = require("node-fetch");
require('dotenv').config();

class LinkedInAuthManager {
  async loginWithVerificationAndCaptcha(
    linkedinUsername,
    linkedinPassword,
    emailUsername,
    emailPassword,
    emailHost,
    emailPort,
    captchaApiKey
  ) {
    // Usando variáveis de ambiente para as credenciais do proxy rotativo
    const proxyHost = process.env.PROXY_HOST;
    const proxyPort = process.env.PROXY_PORT;
    const username = process.env.PROXY_USERNAME;
    const password = process.env.PROXY_PASSWORD;
    const proxyUrl = `http://${proxyHost}:${proxyPort}`;

    try {
      console.log("[INFO] Testing proxy with LinkedIn login page...");
      const proxyAgent = new ProxyAgent(proxyUrl, {
        headers: {
          "Proxy-Authorization": `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
        },
      });

      const response = await fetch("https://www.linkedin.com/login", {
        dispatcher: proxyAgent,
        timeout: 120000,
      });

      if (!response.ok) {
        throw new Error(`Proxy test failed with status ${response.status}`);
      }

      console.log("[INFO] Proxy test successful. Launching Puppeteer...");
      const browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-web-security",
          "--disable-features=IsolateOrigins,site-per-process",
          "--enable-unsafe-swiftshader",
          `--proxy-server=${proxyUrl}`,
        ],
        protocolTimeout: 180000, // Aumentado para 3 minutos
        dumpio: true, // Habilita logs detalhados
      });

      const page = await browser.newPage();
      
      // Configuração adicional para evitar detecção
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
      });
      
      await page.authenticate({ username, password });
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
      );

      // Configurar viewport para parecer mais com um usuário real
      await page.setViewport({
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1,
        hasTouch: false,
        isLandscape: true,
        isMobile: false
      });

      // Inicializar com TimeoutError mais descritivo
      let timeoutError = new Error("Login process timed out at initialization");
      
      // Interceptar requisições para depuração
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        // Bloquear recursos não necessários para acelerar o carregamento
        const resourceType = request.resourceType();
        if (resourceType === 'image' || resourceType === 'media' || resourceType === 'font') {
          request.abort();
        } else {
          request.continue();
        }
      });

      // Registrar eventos de console da página para diagnóstico
      page.on('console', msg => console.log(`[PAGE CONSOLE] ${msg.type()}: ${msg.text()}`));

      console.log("[INFO] Navigating to LinkedIn login page...");
      await page.goto("https://www.linkedin.com/login", { 
        waitUntil: "networkidle2", 
        timeout: 120000 
      });

      // Verificar se a página foi carregada corretamente
      const pageTitle = await page.title();
      console.log(`[INFO] Page title: ${pageTitle}`);
      
      if (!pageTitle.includes("LinkedIn") && !pageTitle.includes("Login")) {
        await page.screenshot({ path: "login_page_error.png" });
        throw new Error(`Login page not loaded correctly. Title: ${pageTitle}`);
      }

      console.log("[INFO] Filling login credentials...");
      
      // Esperar pelos campos com estratégia de retry
      let retries = 3;
      let usernameField = null;
      let passwordField = null;
      
      while (retries > 0 && (!usernameField || !passwordField)) {
        try {
          usernameField = await page.waitForSelector("#username", { timeout: 30000 });
          passwordField = await page.waitForSelector("#password", { timeout: 30000 });
          break;
        } catch (error) {
          retries--;
          console.warn(`[WARN] Retry ${3-retries}/3: Waiting for login fields. Error: ${error.message}`);
          
          if (retries === 0) {
            await page.screenshot({ path: "login_fields_not_found.png" });
            timeoutError = new Error("Could not find login form fields");
            throw timeoutError;
          }
          
          // Recarregar a página e tentar novamente
          await page.reload({ waitUntil: "networkidle2", timeout: 60000 });
          await new Promise(r => setTimeout(r, 5000));
        }
      }

      // Usar o clique antes de digitar para garantir que o campo está focado
      await page.click("#username");
      await page.type("#username", linkedinUsername, { delay: 100 });
      
      await page.click("#password");
      await page.type("#password", linkedinPassword, { delay: 100 });

      console.log("[INFO] Attempting to login...");
      
      // Garantir que o botão está visível e clicável
      await page.waitForSelector(".btn__primary--large.from__button--floating", { 
        visible: true, 
        timeout: 30000 
      });
      
      // Usar promise.all para esperar tanto o clique quanto a navegação
      await Promise.all([
        page.click(".btn__primary--large.from__button--floating"),
        page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(e => {
          console.warn("[WARN] Navigation timeout after login attempt, continuing anyway:", e.message);
        })
      ]);
      
      console.log("[INFO] Login button clicked, checking for possible challenges...");
      
      // Esperar um pouco para garantir que a página carregou após o clique
      await new Promise(r => setTimeout(r, 5000));
      
      // Verificar possíveis desafios de segurança ou verificação
      const challengeSelectors = [
        { selector: "#captcha-challenge", description: "CAPTCHA challenge" },
        { selector: "#input__email_verification_pin", description: "Email verification" },
        { selector: ".secondary-action", description: "Security verification" },
        { selector: ".recaptcha-checkbox-border", description: "reCAPTCHA checkbox" }
      ];
      
      for (const { selector, description } of challengeSelectors) {
        const hasChallenge = await page.$(selector) !== null;
        if (hasChallenge) {
          console.log(`[INFO] Detected ${description}`);
          // Captura uma screenshot para diagnóstico
          await page.screenshot({ path: `challenge_${description.replace(/\s+/g, '_')}.png` });
          // Se for um captcha ou verificação de email, poderíamos implementar solução aqui
        }
      }
      
      // Novas estratégias para verificar o login bem-sucedido:
      console.log("[INFO] Checking if login was successful using multiple strategies...");
      
      // Estratégia 1: Verificar a URL atual
      const currentUrl = page.url();
      console.log(`[INFO] Current URL after login attempt: ${currentUrl}`);
      
      if (currentUrl.includes("checkpoint") || currentUrl.includes("challenge")) {
        console.log("[INFO] Security checkpoint detected. Taking screenshot...");
        await page.screenshot({ path: "security_checkpoint.png" });
        throw new Error("LinkedIn security checkpoint detected. Manual verification required.");
      }
      
      // Estratégia 2: Tentar múltiplos seletores para detectar login bem-sucedido
      const possibleSuccessSelectors = [
        ".global-nav__primary-link",
        ".feed-identity-module__actor-meta",
        ".search-global-typeahead__input",
        ".profile-rail-card__actor-link",
        ".share-box-feed-entry__avatar",
        "[data-control-name='identity_welcome_message']"
      ];
      
      let loggedIn = false;
      
      // Esperar por qualquer um dos seletores de sucesso
      for (const selector of possibleSuccessSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            console.log(`[INFO] Login detected via selector: ${selector}`);
            loggedIn = true;
            break;
          }
        } catch (e) {
          // Continuar tentando outros seletores
        }
      }
      
      // Estratégia 3: Verificar pelo cookie li_at
      const cookies = await page.cookies();
      const li_at = cookies.find((cookie) => cookie.name === "li_at")?.value;
      
      if (li_at) {
        console.log("[INFO] Found li_at cookie - this suggests successful authentication");
        loggedIn = true;
      } else {
        console.warn("[WARN] li_at cookie not found");
      }
      
      // Se não detectamos login por nenhum dos métodos, tentar navegar para a página inicial
      if (!loggedIn) {
        console.log("[INFO] No clear login indicators found. Trying to navigate to LinkedIn homepage...");
        
        await Promise.all([
          page.goto("https://www.linkedin.com/feed/", { waitUntil: "networkidle2", timeout: 60000 }),
          new Promise(r => setTimeout(r, 10000))
        ]).catch(e => {
          console.warn("[WARN] Navigation to feed timeout:", e.message);
        });
        
        // Verificar novamente os cookies após a navegação
        const updatedCookies = await page.cookies();
        const updatedLi_at = updatedCookies.find((cookie) => cookie.name === "li_at")?.value;
        
        if (updatedLi_at) {
          console.log("[INFO] Found li_at cookie after navigation to feed page");
          loggedIn = true;
          li_at = updatedLi_at;
        }
      }
      
      // Decisão final sobre o status do login
      if (!loggedIn) {
        await page.screenshot({ path: "login_failed.png" });
        throw new Error("Unable to confirm successful login to LinkedIn");
      }
      
      if (!li_at) {
        throw new Error("Failed to retrieve li_at cookie even though other login indicators were present.");
      }

      console.log("[INFO] Authentication successful. Returning li_at cookie.");
      await browser.close();
      return li_at;
    } catch (error) {
      console.error("[ERROR] LinkedIn login failed:", error);
      throw error;
    }
  }
}

module.exports = LinkedInAuthManager;