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
      
      // Verificar se estamos em uma página de checkpoint do LinkedIn
      const isCheckpointPage = page.url().includes("checkpoint/challenge");
      if (isCheckpointPage) {
        console.log("[INFO] Detected LinkedIn security checkpoint page");
        foundChallenge = true;
        challengeType = "LinkedIn checkpoint";
        await page.screenshot({ path: "linkedin_checkpoint.png" });
      }
      
      // Se encontramos um desafio e temos uma API key, tentar resolver
      if (foundChallenge && captchaApiKey) {
        console.log(`[INFO] Attempting to solve ${challengeType || "security challenge"} using 2Captcha API`);
        
        let solved = false;
        
        // Tente resolver o reCAPTCHA se detectado
        if (challengeType && (challengeType.includes("reCAPTCHA") || challengeType.includes("CAPTCHA"))) {
          solved = await this.solveRecaptchaV2WithNewAPI(page, captchaApiKey);
        }
        
        // Se for um checkpoint do LinkedIn, tentar identificar e resolver o desafio específico
        if (isCheckpointPage && !solved) {
          // Tentar verificar se existe reCAPTCHA no checkpoint
          const hasRecaptcha = await page.$("iframe[src*='recaptcha']") !== null;
          if (hasRecaptcha) {
            console.log("[INFO] Found reCAPTCHA in LinkedIn checkpoint");
            solved = await this.solveRecaptchaV2WithNewAPI(page, captchaApiKey);
          } else {
            // Tentar identificar outros tipos de desafios
            const pageContent = await page.content();
            if (pageContent.includes("captcha") || pageContent.includes("CAPTCHA")) {
              console.log("[INFO] Found captcha reference in page content");
              solved = await this.solveRecaptchaV2WithNewAPI(page, captchaApiKey);
            } else {
              // Nova verificação para buscar padrões específicos de reCAPTCHA no código HTML
              const recaptchaPatterns = [
                "g-recaptcha",
                "grecaptcha.execute",
                "grecaptcha.render",
                "recaptcha_challenge",
                "recaptcha-token",
                "data-sitekey"
              ];
              
              for (const pattern of recaptchaPatterns) {
                if (pageContent.includes(pattern)) {
                  console.log(`[INFO] Detected reCAPTCHA pattern: ${pattern}`);
                  solved = await this.solveRecaptchaV2WithNewAPI(page, captchaApiKey);
                  break;
                }
              }
            }
          }
          
          // Verificar se tem um botão de "verify" ou similar para clicar
          if (!solved) {
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
                
                // Verificar se saímos da página de checkpoint
                if (!page.url().includes("checkpoint/challenge")) {
                  solved = true;
                  break;
                }
              }
            }
          }
        }
        
        if (!solved && foundChallenge) {
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
  
  // Método atualizado para resolver reCAPTCHA usando a nova API do 2Captcha
  async solveRecaptchaV2WithNewAPI(page, apiKey) {
    try {
      console.log("[INFO] Starting reCAPTCHA solving process with 2Captcha API v2");
      
      // Obter o sitekey do reCAPTCHA
      let sitekey = await page.evaluate(() => {
        // Tentar encontrar o sitekey nos atributos data do iframe
        const iframes = Array.from(document.querySelectorAll("iframe[src*='recaptcha']"));
        for (const iframe of iframes) {
          const src = iframe.getAttribute("src") || "";
          const sitekeyMatch = src.match(/[?&]k=([^&]+)/);
          if (sitekeyMatch) return sitekeyMatch[1];
        }
        
        // Tentar encontrar nos atributos data da div
        const divs = Array.from(document.querySelectorAll("div[data-sitekey]"));
        return divs.length > 0 ? divs[0].getAttribute("data-sitekey") : null;
      });
      
      if (!sitekey) {
        console.warn("[WARN] Could not extract reCAPTCHA sitekey using DOM selectors, trying alternative methods");
        
        // Obter e analisar o conteúdo completo da página
        const pageContent = await page.content();
        
        // Log do conteúdo relevante para depuração
        const captchaSnippets = pageContent.match(/(recaptcha|sitekey|grecaptcha).{0,100}/gi);
        if (captchaSnippets && captchaSnippets.length > 0) {
          console.log(`[INFO] Found ${captchaSnippets.length} captcha-related snippets in page content`);
          captchaSnippets.slice(0, 5).forEach(snippet => {
            console.log(`[DEBUG] Captcha snippet: ${snippet}`);
          });
        }
        
        // Tentar extrair qualquer string que se pareça com um sitekey
        const sitekeyRegex = /\b(6L[a-zA-Z0-9_-]{38,40})\b/g;
        const potentialSitekeys = [];
        let match;
        
        while ((match = sitekeyRegex.exec(pageContent)) !== null) {
          potentialSitekeys.push(match[1]);
        }
        
        if (potentialSitekeys.length > 0) {
          console.log(`[INFO] Found potential sitekeys in HTML: ${potentialSitekeys.join(', ')}`);
          sitekey = potentialSitekeys[0];
        }
        
        // Tentar diferentes padrões regex para encontrar o sitekey
        const sitekeyPatterns = [
          /['"](6L[a-zA-Z0-9_-]{38,40})['"]/,                 // Formato padrão de sitekey
          /sitekey['"]?\s*[:=]\s*['"]([^'"]+)['"]/,           // sitekey: "KEY" ou sitekey="KEY"
          /data-sitekey=['"]([^'"]+)['"]/,                    // data-sitekey="KEY"
          /grecaptcha\.render\([^,]+,\s*\{[^}]*['"]sitekey['"]\s*:\s*['"]([^'"]+)['"]/,  // grecaptcha.render
          /k=([a-zA-Z0-9_-]{40})/,                            // k=KEY em URLs
          /reCAPTCHA[^>]+sitekey=([a-zA-Z0-9_-]{40})/,        // Parâmetro em texto
          /"sitekey"\s*:\s*"([^"]+)"/,                        // JSON format: "sitekey": "VALUE"
          /'sitekey'\s*:\s*'([^']+)'/                         // JSON format: 'sitekey': 'VALUE'
        ];
        
        for (const pattern of sitekeyPatterns) {
          const match = pageContent.match(pattern);
          if (match && match[1]) {
            sitekey = match[1];
            console.log(`[INFO] Found sitekey using pattern ${pattern}: ${sitekey}`);
            break;
          }
        }
        
        // Se ainda não encontrou, tente extrair diretamente do objeto grecaptcha
        if (!sitekey) {
          console.log("[INFO] Attempting to extract sitekey from grecaptcha configuration");
          sitekey = await page.evaluate(() => {
            try {
              // Tentar extrair do objeto de configuração do grecaptcha
              if (window.___grecaptcha_cfg && window.___grecaptcha_cfg.clients) {
                const clientKeys = Object.keys(window.___grecaptcha_cfg.clients);
                for (const clientKey of clientKeys) {
                  const client = window.___grecaptcha_cfg.clients[clientKey];
                  // Procurar pela configuração do widget que contém a chave do site
                  for (const widgetKey in client) {
                    if (client[widgetKey] && client[widgetKey].sitekey) {
                      return client[widgetKey].sitekey;
                    }
                  }
                }
              }
              return null;
            } catch (e) {
              console.error("Error extracting sitekey from grecaptcha config:", e);
              return null;
            }
          });
        }
        
        // Se ainda não encontrou, verificar se o LinkedIn está usando outro tipo de desafio
        if (!sitekey) {
          const hasLinkedinChallenge = await page.evaluate(() => {
            return document.querySelector('.challenge-dialog') !== null ||
                   document.querySelector('form[name="checkpoint-challenge"]') !== null ||
                   document.body.textContent.includes('security verification') ||
                   document.body.textContent.includes("confirm you're not a robot");
          });
          
          if (hasLinkedinChallenge) {
            console.log("[INFO] LinkedIn challenge detected but appears to be a non-standard reCAPTCHA");
            
            // Definir sitekeys conhecidos do LinkedIn
            const linkedinSitekeys = [
              "6LfCVLAUAAAAAMfHXD6LNPSboAs0qWvwE9pLF9Y6", // Sitekey conhecido para LinkedIn
              "6Lc7Oa4UAAAAAEt8K9lCI7ucTOStB6ZJ5of6mU6M", // Sitekey alternativo para LinkedIn
              "6LeZmb0UAAAAAGt0cEvY41up9CsV2cqAq1k1gX-X"  // Outro sitekey reportado
            ];
            
            // Procurar referências diretas a estes sitekeys no conteúdo da página
            for (const knownKey of linkedinSitekeys) {
              if (pageContent.includes(knownKey)) {
                sitekey = knownKey;
                console.log(`[INFO] Found known LinkedIn sitekey: ${sitekey}`);
                break;
              }
            }
            
            // Se não encontrou nenhum sitekey conhecido na página, use o primeiro como padrão
            if (!sitekey) {
              sitekey = linkedinSitekeys[0];
              console.log(`[INFO] Using default LinkedIn sitekey: ${sitekey}`);
            }
          }
        }
      }
      
      if (!sitekey) {
        console.error("[ERROR] Could not extract reCAPTCHA sitekey using any method");
        
        // Capturar screenshot para análise
        await page.screenshot({ path: "recaptcha_sitekey_error.png", fullPage: true });
        return false;
      }
      
      console.log(`[INFO] Using reCAPTCHA sitekey: ${sitekey}`);
      
      // Obter a URL atual para o domínio
      const pageUrl = page.url();
      
      // Preparar os dados para a API do 2captcha usando o novo formato
      const createTaskData = {
        clientKey: apiKey,
        task: {
          type: "RecaptchaV2TaskProxyless",
          websiteURL: pageUrl,
          websiteKey: sitekey
        }
      };
      
      // 1. Criar a tarefa com o método createTask
      console.log("[INFO] Creating reCAPTCHA task with 2Captcha API");
      const createTaskResponse = await fetch("https://api.2captcha.com/createTask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createTaskData)
      });
      
      const createTaskResult = await createTaskResponse.json();
      console.log(`[INFO] Create task response: ${JSON.stringify(createTaskResult)}`);
      
      if (createTaskResult.errorId !== 0) {
        console.error(`[ERROR] 2Captcha API error: ${createTaskResult.errorDescription}`);
        return false;
      }
      
      const taskId = createTaskResult.taskId;
      console.log(`[INFO] Task created with ID: ${taskId}`);
      
      // 2. Esperar pela solução através do método getTaskResult
      let solution = null;
      let attempts = 0;
      const maxAttempts = 30; // 30 tentativas com 5 segundos entre = até 2.5 minutos de espera
      
      const getTaskResultData = {
        clientKey: apiKey,
        taskId: taskId
      };
      
      while (!solution && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Esperar 5 segundos entre tentativas
        attempts++;
        
        console.log(`[INFO] Checking reCAPTCHA solution (attempt ${attempts}/${maxAttempts})...`);
        const resultResponse = await fetch("https://api.2captcha.com/getTaskResult", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(getTaskResultData)
        });
        
        const resultData = await resultResponse.json();
        console.log(`[INFO] Task result response: ${JSON.stringify(resultData)}`);
        
        if (resultData.errorId !== 0) {
          console.error(`[ERROR] 2Captcha get task result error: ${resultData.errorDescription}`);
          // Se for um erro permanente, abortar
          if (resultData.errorId !== 1) return false;
          continue;
        }
        
        if (resultData.status === "ready") {
          solution = resultData.solution.gRecaptchaResponse;
          break;
        }
      }
      
      if (!solution) {
        console.error("[ERROR] Failed to get reCAPTCHA solution after maximum attempts");
        return false;
      }
      
      console.log("[INFO] reCAPTCHA solution received, applying to the page");
      
      // Aplicar a solução do reCAPTCHA na página
      const success = await page.evaluate((recaptchaSolution) => {
        // Estratégia 1: Definir diretamente no objeto grecaptcha
        if (typeof window.grecaptcha !== 'undefined' && window.grecaptcha.enterprise === undefined) {
          try {
            for (const [widgetId, _] of Object.entries(window.___grecaptcha_cfg.clients[0].Y.Y)) {
              if (!isNaN(widgetId)) {
                window.grecaptcha.getResponse = () => recaptchaSolution;
                window.grecaptcha.enterprise = undefined;
                return true;
              }
            }
          } catch (e) {
            console.error("Error in strategy 1:", e);
          }
        }
        
        // Estratégia 2: Injetar o token na textarea
        try {
          const textareas = document.querySelectorAll('textarea[name="g-recaptcha-response"]');
          if (textareas.length > 0) {
            for (const textarea of textareas) {
              textarea.value = recaptchaSolution;
            }
            return true;
          }
        } catch (e) {
          console.error("Error in strategy 2:", e);
        }
        
        // Estratégia 3: Usar o objeto ___grecaptcha_cfg
        try {
          if (typeof window.___grecaptcha_cfg !== 'undefined') {
            // Tentar encontrar e executar callbacks
            const callbacks = Object.entries(window.___grecaptcha_cfg.clients)
              .flatMap(([_, client]) => {
                return Object.entries(client).flatMap(([_, value]) => {
                  return Object.entries(value).filter(([key]) => key === 'callback')
                    .map(([_, callback]) => callback);
                });
              })
              .filter(callback => typeof callback === 'function');
            
            if (callbacks.length > 0) {
              for (const callback of callbacks) {
                try { 
                  callback(recaptchaSolution); 
                  return true;
                } catch (e) {
                  console.error("Error executing callback:", e);
                }
              }
            }
          }
        } catch (e) {
          console.error("Error in strategy 3:", e);
        }
        
        return false;
      }, solution);
      
      if (!success) {
        console.warn("[WARN] Could not apply reCAPTCHA solution directly, trying alternative methods");
        
        // Método alternativo: injetar o script diretamente
        await page.evaluate((recaptchaSolution) => {
          document.querySelector('textarea#g-recaptcha-response') ? 
            document.querySelector('textarea#g-recaptcha-response').innerHTML = recaptchaSolution : 
            document.querySelectorAll('textarea[name="g-recaptcha-response"]').forEach(elem => elem.innerHTML = recaptchaSolution);
          
          // Tentar disparar evento de mudança
          const event = new Event('change', { bubbles: true });
          document.querySelector('textarea[name="g-recaptcha-response"]')?.dispatchEvent(event);
        }, solution);
      }
      
      // Verificar se existe um botão de verificação para clicar após resolver o captcha
      const verifyButtonSelectors = [
        '#recaptcha-verify-button',
        'button[type="submit"]',
        'button.artdeco-button--primary',
        'button[data-control-name="submit"]',
        '.recaptcha-submit',
        'button[aria-label*="verify"]',
        'input[type="submit"]'
      ];
      
      let verifyButtonFound = false;
      
      for (const buttonSelector of verifyButtonSelectors) {
        const verifyButton = await page.$(buttonSelector);
        if (verifyButton) {
          console.log(`[INFO] Clicking verify button with selector: ${buttonSelector}`);
          await verifyButton.click();
          verifyButtonFound = true;
          await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {});
          break;
        }
      }
      
      // Se não encontrou botão de verificação, tente enviar o formulário diretamente
      if (!verifyButtonFound) {
        console.log("[INFO] No verify button found, attempting to submit the form directly");
        
        const formSubmitResult = await page.evaluate((recaptchaSolution) => {
          // Preencher todos os campos de g-recaptcha-response
          const recaptchaResponseFields = document.querySelectorAll('textarea[name="g-recaptcha-response"]');
          if (recaptchaResponseFields.length) {
            recaptchaResponseFields.forEach(field => field.value = recaptchaSolution);
          }
          
          // Tentar encontrar e enviar qualquer formulário na página
          const forms = document.querySelectorAll('form');
          if (forms.length) {
            for (const form of forms) {
              try {
                console.log(`Submitting form: ${form.id || form.name || 'unnamed form'}`);
                form.submit();
                return true;
              } catch (e) {
                console.error(`Error submitting form: ${e.message}`);
              }
            }
          }
          
          // Verificar se há algum botão que parece ser de submissão
          const possibleSubmitButtons = Array.from(document.querySelectorAll('button, input[type="submit"]'))
            .filter(el => {
              const text = el.textContent.toLowerCase();
              return text.includes('verify') || 
                     text.includes('submit') || 
                     text.includes('continue') || 
                     text.includes('next') ||
                     text.includes('confirmar') ||
                     text.includes('verificar') ||
                     text.includes('continuar') ||
                     text.includes('avançar');
            });
          
          if (possibleSubmitButtons.length) {
            possibleSubmitButtons[0].click();
            return true;
          }
          
          return false;
        }, solution);
        
        if (formSubmitResult) {
          console.log("[INFO] Form submitted via JavaScript");
          await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {});
        }
      }
      
      // Esperar um pouco para ver se a página avança
      await new Promise(r => setTimeout(r, 5000));
      
      // Verificar se ainda estamos na página de desafio
      const currentUrl = page.url();
      const stillInChallenge = currentUrl.includes("checkpoint") || currentUrl.includes("challenge");
      
      // Verificar elementos na página que indicam falha ou sucesso
      const captchaStatus = await page.evaluate(() => {
        // Verificar mensagens de erro específicas
        const errorMessages = Array.from(document.querySelectorAll('.error, .error-message, .captcha-error'))
          .map(el => el.innerText)
          .filter(text => text.length > 0);
          
        if (errorMessages.length > 0) {
          return {success: false, errors: errorMessages};
        }
        
        // Verificar se a página contém mensagens de sucesso
        const pageText = document.body.innerText.toLowerCase();
        const successIndicators = [
          "verification successful",
          "verificação bem-sucedida",
          "thank you for verifying",
          "obrigado por verificar",
          "you're all set",
          "tudo pronto"
        ];
        
        for (const indicator of successIndicators) {
          if (pageText.includes(indicator)) {
            return {success: true, message: indicator};
          }
        }
        
        // Retornar status neutro se não encontrar indicadores claros
        return {success: null};
      });
      
      if (captchaStatus.success === false) {
        console.warn(`[WARN] CAPTCHA error detected: ${captchaStatus.errors?.join(', ')}`);
        return false;
      } else if (captchaStatus.success === true) {
        console.log(`[INFO] CAPTCHA success confirmed: ${captchaStatus.message}`);
        return true;
      }
      
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