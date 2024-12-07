const puppeteer = require("puppeteer");

function normalizeCompanyName(name) {
  return name.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // remove acentos
    .replace(/[^a-z0-9]/g, '')        // remove caracteres especiais
    .trim();
}

function isValidApplyUrl(url, companyName) {
  try {
    const urlLower = url.toLowerCase();
    const normalizedCompany = normalizeCompanyName(companyName);
    
    const platforms = [
      'gupy.io',
      'kenoby.com',
      'lever.co',
      'greenhouse.io',
      'abler.com.br',
      'workday.com',
      'breezy.hr',
      'pandape.com',
      'betterplace.com.br',
      'netvagas.com.br',
      'indeed.com'
    ];

    const hasCompanyName = urlLower.includes(normalizedCompany);
    const hasPlatform = platforms.some(platform => urlLower.includes(platform));

    if (hasCompanyName || hasPlatform) {
      return true;
    }

    return false;
  } catch (error) {
    return false;
  }
}

async function getJobDetails(browser, jobUrl, li_at) {
  console.log(`[INFO] Acessando detalhes da vaga: ${jobUrl}`);
  let page = null;
  let jobDetails = {};
  const externalUrls = [];

  try {
    page = await browser.newPage();

    const cookies = [{ name: "li_at", value: li_at, domain: ".linkedin.com" }];
    await page.setCookie(...cookies);

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36"
    );

    // Override do window.open para capturar a URL da nova aba
    await page.evaluateOnNewDocument(() => {
      const originalOpen = window.open;
      window.open = function(...args) {
        window.__NEW_TAB_URL__ = args[0];
        return originalOpen.apply(window, args);
      };
    });

    await page.setViewport({ width: 1920, height: 1080 });

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (resourceType === 'image' || resourceType === 'media' || resourceType === 'font') {
        req.abort();
      } else {
        req.continue();
      }
    });
    
    page.on('requestfinished', async (req) => {
      const url = req.url();
      if (jobDetails.company && url && !url.includes('linkedin.com') && isValidApplyUrl(url, jobDetails.company)) {
        externalUrls.push(url);
      }
    });

    await page.goto(jobUrl, { 
      waitUntil: ["domcontentloaded"],
      timeout: 30000 
    });

    try {
      const seeMoreButtonSelector = ".jobs-description__footer-button";
      await page.waitForSelector(seeMoreButtonSelector, { timeout: 5000 });
      await page.click(seeMoreButtonSelector);
      console.log("[INFO] Botão 'Ver mais' clicado com sucesso.");
    } catch (error) {
      console.warn("[WARN] Botão 'Ver mais' não encontrado ou não clicável.");
    }

    jobDetails = await page.evaluate(() => {
      const title = document.querySelector(".job-details-jobs-unified-top-card__job-title")?.innerText.trim() || "";
      const company = document.querySelector(".job-details-jobs-unified-top-card__company-name")?.innerText.trim() || "";
      const locationData = document.querySelector(".job-details-jobs-unified-top-card__primary-description-container")?.innerText.trim() || "";
      const description = document.querySelector("#job-details")?.innerText.trim() || "";
      
      const formatElement = document.querySelector(".job-details-jobs-unified-top-card__job-insight")?.innerText.trim() || "";
      let format = "";
      const modalidades = formatElement.match(/(Remoto|Híbrido|Presencial)/i);
      format = modalidades ? modalidades[0] : "";

      const locationMatch = locationData.match(/^(.*?)(?= ·|$)/);
      const location = locationMatch ? locationMatch[0].trim() : "";

      return {
        title,
        company,
        location,
        description,
        format,
        applyUrl: null
      };
    });

    try {
      console.log("[INFO] Verificando tipo de candidatura...");
      console.log("[DEBUG] Nome da empresa:", jobDetails.company);
      
      const applyButtonSelector = '.jobs-apply-button--top-card';
      await page.waitForSelector(applyButtonSelector, { timeout: 10000 });
      
      const buttonText = await page.evaluate((selector) => {
        const button = document.querySelector(selector);
        return button ? button.textContent.trim() : '';
      }, applyButtonSelector);
      
      console.log("[INFO] Texto do botão de candidatura:", buttonText);

      if (buttonText.includes("Candidatar-se")) {
        console.log("[INFO] Detectada candidatura externa. Iniciando processo de candidatura...");

        const modalButtonSelector = '.jobs-apply-button.artdeco-button.artdeco-button--icon-right.artdeco-button--3.artdeco-button--primary.ember-view';

        // DispatchEvent no botão de candidatura
        await page.evaluate((selector) => {
          const btn = document.querySelector(selector);
          if (btn) {
            const event = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
            btn.dispatchEvent(event);
          }
        }, applyButtonSelector);

        // Espera e tenta clicar no botão "Continuar"
        try {
          await page.waitForSelector(modalButtonSelector, { timeout: 5000 });
          await page.evaluate((selector) => {
            const btn = document.querySelector(selector);
            if (btn) {
              const event = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
              btn.dispatchEvent(event);
            }
          }, modalButtonSelector);
          console.log("[INFO] Modal detectado e botão 'Continuar' clicado.");
        } catch {
          console.log("[INFO] Nenhum modal com botão 'Continuar' detectado. Prosseguindo normalmente.");
        }

        // Aguarda um tempinho para que o window.open seja chamado e capturado
        await new Promise(resolve => setTimeout(resolve, 5000));

        let applyUrl = null;

        // Verifica se a função window.open foi chamada e a URL está disponível
        const possibleNewTabUrl = await page.evaluate(() => window.__NEW_TAB_URL__);
        if (possibleNewTabUrl && isValidApplyUrl(possibleNewTabUrl, jobDetails.company)) {
          applyUrl = possibleNewTabUrl;
          console.log("[INFO] URL de aplicação detectada via override do window.open:", applyUrl);
        } else if (externalUrls.length > 0) {
          applyUrl = externalUrls[0];
          console.log("[INFO] URL de aplicação encontrada via requisições:", applyUrl);
        } else {
          console.log("[WARN] Nenhuma URL externa detectada. Mantendo URL original da vaga.");
          applyUrl = jobUrl;
        }

        jobDetails.applyUrl = applyUrl;

      } else if (buttonText.includes("Candidatura simplificada")) {
        console.log("[INFO] Detectada candidatura simplificada. Usando URL original.");
        jobDetails.applyUrl = jobUrl;
      } else {
        console.log("[WARN] Tipo de candidatura não reconhecido:", buttonText);
        jobDetails.applyUrl = jobUrl;
      }
    } catch (error) {
      console.warn("[WARN] Erro ao processar URL de candidatura:", error.message);
      jobDetails.applyUrl = jobUrl;
    }

    return jobDetails;

  } catch (error) {
    console.error(`[ERROR] Falha ao obter detalhes da vaga: ${error.message}`);
    throw error;
  } finally {
    if (page) {
      try {
        await page.close();
        console.log("[INFO] Página principal fechada com sucesso");
      } catch (error) {
        console.warn("[WARN] Erro ao fechar página principal:", error);
      }
    }
  }
}

module.exports = getJobDetails;
