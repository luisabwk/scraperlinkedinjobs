const puppeteer = require("puppeteer");

async function getJobDetails(browser, jobUrl, li_at) {
  console.log(`[INFO] Acessando detalhes da vaga: ${jobUrl}`);
  let page = null;
  let newPage = null;
  let finalUrl = null;
  let jobDetails = {};

  try {
    page = await browser.newPage();
    await page.setDefaultNavigationTimeout(60000);
    await page.setDefaultTimeout(30000);
    
    let redirectUrl = null;
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = request.url();
      if (request.resourceType() === 'document' && !url.includes('linkedin.com')) {
        redirectUrl = url;
        console.log("[DEBUG] URL externa encontrada:", url);
      }
      if (request.resourceType() === 'image' || request.resourceType() === 'media' || request.resourceType() === 'font') {
        request.abort();
      } else {
        request.continue();
      }
    });

    const cookies = [{ name: "li_at", value: li_at, domain: ".linkedin.com" }];
    await page.setCookie(...cookies);

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36"
    );

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
      
      const applyButtonSelector = '.jobs-apply-button--top-card';
      await page.waitForSelector(applyButtonSelector, { timeout: 10000 });
      
      const buttonText = await page.evaluate((selector) => {
        const button = document.querySelector(selector);
        return button ? button.textContent.trim() : '';
      }, applyButtonSelector);
      
      console.log("[INFO] Texto do botão de candidatura:", buttonText);

      if (buttonText.includes("Candidatar-se")) {
        console.log("[INFO] Detectada candidatura externa. Tentando obter URL...");

        // Monitorar console da página
        page.on('console', msg => {
          const text = msg.text();
          console.log("[DEBUG] Console da página:", text);
        });

        // Tentar interceptar a URL através do evento de clique
        await page.evaluate(() => {
          window.externalUrl = null;
          const button = document.querySelector('.jobs-apply-button--top-card');
          if (button) {
            console.log("[DEBUG] Atributos do botão:", {
              href: button.href,
              onclick: button.onclick?.toString(),
              dataset: JSON.stringify(button.dataset)
            });
          }
        });

        // Clicar no botão e aguardar possível redirecionamento
        await Promise.all([
          page.click(applyButtonSelector),
          new Promise(resolve => setTimeout(resolve, 5000))
        ]);
        
        console.log("[INFO] Botão de candidatura clicado");
        
        // Verificar redirecionamentos
        if (redirectUrl) {
          console.log("[INFO] URL de redirecionamento encontrada:", redirectUrl);
          jobDetails.applyUrl = redirectUrl;
        } else {
          const currentUrl = await page.url();
          console.log("[DEBUG] URL atual após clique:", currentUrl);
          
          if (currentUrl !== jobUrl && !currentUrl.includes('linkedin.com')) {
            jobDetails.applyUrl = currentUrl;
          } else {
            jobDetails.applyUrl = jobUrl;
          }
        }
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
