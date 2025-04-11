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
        { selector: "iframe[title*='reCAPTCHA']", description: "reCAPTCHA" },
        { selector: "iframe[src*='recaptcha']", description: "reCAPTCHA iframe" },
        { selector: "#input__email_verification_pin", description: "Email verification" },
        { selector: ".secondary-action", description: "Security verification" },
        { selector: ".recaptcha-checkbox-border", description: "reCAPTCHA checkbox" },
        { selector: ".challenge-dialog", description: "Security challenge" }
      ];
      
      let foundChallenge = false;
      let challengeType = null;
      
      for (const { selector, description } of challengeSelectors) {
        const element = await page.$(selector);
        if (element) {
          console.log(`[INFO] Detected ${description}`);
          foundChallenge = true;
          challengeType = description;
          
          // Captura uma screenshot para diagnóstico
          await page.screenshot({ path: `challenge_${description.replace(/\s+/g, '_')}.png` });
          break;
        }
      }
      
      // Se encontramos um CAPTCHA e temos uma API key, tentar resolver
      if (foundChallenge && captchaApiKey) {
        console.log(`[INFO] Attempting to solve ${challengeType} using 2Captcha API`);
        
        let solved = false;
        
        // Tente resolver o reCAPTCHA se detectado
        if (challengeType && (challengeType.includes("reCAPTCHA") || challengeType.includes("CAPTCHA"))) {
          solved = await this.solveRecaptcha(page, captchaApiKey);
        }
        
        // Verificar checkpoint de segurança específico do LinkedIn
        const isCheckpointPage = page.url().includes("checkpoint/challenge");
        if (isCheckpointPage) {
          console.log("[INFO] Detected LinkedIn security checkpoint page");
          
          // Verificar se tem um botão de "verify" ou similar para clicar
          const verifyButtonSelectors = [
            'button[data-control-name="submit"]',
            'button[type="submit"]',
            'button.artdeco-button--primary'
          ];
          
          for (const buttonSelector of verifyButtonSelectors) {
            const verifyButton = await page.$(buttonSelector);
            if (verifyButton) {
              console.log(`[INFO] Found verify button with selector: ${buttonSelector}`);
              await verifyButton.click();
              await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {});
              break;
            }
          }
          
          // Esperar um pouco para ver se conseguimos passar pelo checkpoint
          await new Promise(r => setTimeout(r, 5000));
        }
        
        if (!solved && isCheckpointPage) {
          console.warn("[WARN] Could not automatically solve the security challenge");
          await page.screenshot({ path: "challenge_unsolved.png" });
          throw new Error(`LinkedIn security challenge detected but could not be solved automatically. Manual verification required.`);
        }
      } else if (foundChallenge) {
        console.warn("[WARN] Security challenge detected but no 2Captcha API key provided");
        await page.screenshot({ path: "challenge_no_api_key.png" });
        throw new Error(`LinkedIn security challenge detected. Manual verification required or provide a valid 2Captcha API key.`);
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
      let li_at = cookies.find((cookie) => cookie.name === "li_at")?.value;
      
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
  
  // Método para resolver reCAPTCHA usando a API do 2Captcha
  async solveRecaptcha(page, apiKey) {
    try {
      console.log("[INFO] Starting reCAPTCHA solving process with 2Captcha");
      
      // Verificar se existe um iframe do reCAPTCHA
      const recaptchaIframe = await page.$("iframe[src*='recaptcha']");
      if (!recaptchaIframe) {
        console.warn("[WARN] No reCAPTCHA iframe found on the page");
        return false;
      }
      
      // Obter o sitekey do reCAPTCHA
      const sitekey = await page.evaluate(() => {
        // Tentar encontrar o sitekey nos atributos data do iframe
        const iframe = document.querySelector("iframe[src*='recaptcha']");
        if (iframe) {
          const src = iframe.getAttribute("src");
          const sitekeyMatch = src.match(/[?&]k=([^&]+)/);
          return sitekeyMatch ? sitekeyMatch[1] : null;
        }
        
        // Tentar encontrar nos atributos data da div
        const divs = Array.from(document.querySelectorAll("div[data-sitekey]"));
        return divs.length > 0 ? divs[0].getAttribute("data-sitekey") : null;
      });
      
      if (!sitekey) {
        console.warn("[WARN] Could not extract reCAPTCHA sitekey");
        return false;
      }
      
      console.log(`[INFO] Found reCAPTCHA sitekey: ${sitekey}`);
      
      // Obter a URL atual para o domínio
      const pageUrl = page.url();
      
      // Enviar solicitação para o 2Captcha
      console.log("[INFO] Sending reCAPTCHA solving request to 2Captcha");
      const captchaResponse = await fetch(`https://2captcha.com/in.php?key=${apiKey}&method=userrecaptcha&googlekey=${sitekey}&pageurl=${encodeURIComponent(pageUrl)}&json=1`);
      const captchaData = await captchaResponse.json();
      
      if (!captchaData.status || captchaData.status !== 1) {
        console.error(`[ERROR] 2Captcha error: ${captchaData.error}`);
        return false;
      }
      
      const captchaId = captchaData.request;
      console.log(`[INFO] reCAPTCHA task submitted, ID: ${captchaId}`);
      
      // Esperar pela solução (polling)
      let solution = null;
      let attempts = 0;
      const maxAttempts = 30; // 30 tentativas com 5 segundos entre = até 2.5 minutos de espera
      
      while (!solution && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Esperar 5 segundos entre tentativas
        attempts++;
        
        console.log(`[INFO] Checking reCAPTCHA solution (attempt ${attempts}/${maxAttempts})...`);
        const resultResponse = await fetch(`https://2captcha.com/res.php?key=${apiKey}&action=get&id=${captchaId}&json=1`);
        const resultData = await resultResponse.json();
        
        if (resultData.status === 1) {
          solution = resultData.request;
          break;
        } else if (resultData.request !== "CAPCHA_NOT_READY") {
          console.error(`[ERROR] 2Captcha error: ${resultData.request}`);
          return false;
        }
      }
      
      if (!solution) {
        console.error("[ERROR] Failed to get reCAPTCHA solution after maximum attempts");
        return false;
      }
      
      console.log("[INFO] reCAPTCHA solution received, applying to the page");
      
      // Aplicar a solução do reCAPTCHA na página
      const success = await page.evaluate((recaptchaSolution) => {
        // Verificar se existe a função de callback do reCAPTCHA
        if (typeof window.___grecaptcha_cfg !== 'undefined') {
          window.___grecaptcha_cfg.clients[0].Y.Y.callback(recaptchaSolution);
          return true;
        }
        
        // Tentar inserir diretamente num campo textarea do reCAPTCHA
        const textarea = document.querySelector('textarea[name="g-recaptcha-response"]');
        if (textarea) {
          textarea.value = recaptchaSolution;
          return true;
        }
        
        return false;
      }, solution);
      
      if (!success) {
        console.warn("[WARN] Could not apply reCAPTCHA solution directly");
        
        // Tentar injetar o código que define g-recaptcha-response
        await page.evaluate((recaptchaSolution) => {
          // Criar um elemento de script para injetar o código
          const script = document.createElement('script');
          script.textContent = `
            document.querySelector('textarea#g-recaptcha-response') ? 
              document.querySelector('textarea#g-recaptcha-response').value = "${recaptchaSolution}" : 
              document.querySelector('textarea[name="g-recaptcha-response"]').value = "${recaptchaSolution}";
            
            // Tentar chamar o callback manualmente se existir
            if (window.___grecaptcha_cfg) {
              const callbacks = Object.keys(window.___grecaptcha_cfg.clients)
                .map(key => Object.values(window.___grecaptcha_cfg.clients[key])[1])
                .filter(Boolean)
                .map(token => Object.values(token)[0])
                .filter(Boolean)
                .map(v => Object.entries(v))
                .flat()
                .filter(([k]) => k === 'callback')
                .map(([_, v]) => v)
                .filter(Boolean);
              
              callbacks.forEach(cb => {
                try { cb("${recaptchaSolution}"); } catch(e) { console.error(e); }
              });
            }
          `;
          document.body.appendChild(script);
        }, solution);
      }
      
      // Verificar se existe um botão de verificação para clicar após resolver o captcha
      const verifyButtonSelectors = [
        '#recaptcha-verify-button',
        'button[type="submit"]',
        'button.artdeco-button--primary',
        'button[data-control-name="submit"]',
        '.recaptcha-submit'
      ];
      
      for (const buttonSelector of verifyButtonSelectors) {
        const verifyButton = await page.$(buttonSelector);
        if (verifyButton) {
          console.log(`[INFO] Clicking verify button with selector: ${buttonSelector}`);
          await verifyButton.click();
          await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {});
          break;
        }
      }
      
      // Esperar um pouco para ver se a página avança
      await new Promise(r => setTimeout(r, 5000));
      
      // Verificar se ainda estamos na página de desafio
      const currentUrl = page.url();
      const stillInChallenge = currentUrl.includes("checkpoint") || currentUrl.includes("challenge");
      
      if (stillInChallenge) {
        console.warn("[WARN] Still on challenge page after reCAPTCHA solving attempt");
        return false;
      }
      
      console.log("[INFO] Successfully solved reCAPTCHA challenge");
      return true;
    } catch (error) {
      console.error("[ERROR] Error solving reCAPTCHA:", error.message);
      return false;
    }
  }
}

module.exports = LinkedInAuthManager;