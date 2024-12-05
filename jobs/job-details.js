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
    
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      if (resourceType === 'image' || resourceType === 'media' || resourceType === 'font') {
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

    // Captura inicial dos links da página
    const initialLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a')).map(a => a.href);
    });

    try {
      const seeMoreButtonSelector = ".jobs-description__footer-button";
      await page.waitForSelector(seeMoreButtonSelector, { timeout: 5000 });
      await page.click(seeMoreButtonSelector);
      console.log("[INFO] Botão 'Ver mais' clicado com sucesso.");
    } catch (error) {
      console.warn("[WARN] Botão 'Ver mais' não encontrado ou não clicável.");
    }

    // Capturar detalhes básicos da vaga
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
        
        // Extrair URL do botão antes de clicar
        const buttonInfo = await page.evaluate(() => {
          const button = document.querySelector('.jobs-apply-button--top-card');
          return {
            href: button ? button.getAttribute('href') : null,
            onclick: button ? button.getAttribute('onclick') : null,
            dataset: button ? {...button.dataset} : {}
          };
        });
        
        console.log("[DEBUG] Informações do botão:", buttonInfo);

        // Configurar listener de requisições
        const requestUrls = [];
        page.on('request', request => {
          const url = request.url();
          if (url.includes('/jobs/view/apply') || url.includes('jobs/apply')) {
            requestUrls.push(url);
          }
        });

        // Clicar no botão
        await page.click(applyButtonSelector);
        console.log("[INFO] Botão de candidatura clicado");

        // Aguardar um momento para capturar redirecionamentos
        await new Promise(r => setTimeout(r, 3000));

        // Capturar novos links após o clique
        const newLinks = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('a')).map(a => a.href);
        });

        // Encontrar novos links que não existiam antes
        const newApplyLinks = newLinks.filter(link => 
          !initialLinks.includes(link) && 
          (link.includes('/jobs/view/apply') || link.includes('jobs/apply'))
        );

        if (requestUrls.length > 0) {
          finalUrl = requestUrls[requestUrls.length - 1];
          console.log("[INFO] URL capturada via requisição:", finalUrl);
        } else if (newApplyLinks.length > 0) {
          finalUrl = newApplyLinks[0];
          console.log("[INFO] URL capturada via novos links:", finalUrl);
        } else if (buttonInfo.href) {
          finalUrl = buttonInfo.href;
          console.log("[INFO] URL capturada do atributo href:", finalUrl);
        }

        jobDetails.applyUrl = finalUrl || null;
        
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

  } catch (error) {
    console.error(`[ERROR] Falha ao obter detalhes da vaga: ${error.message}`);
    throw error;
  } finally {
    if (page) {
      try {
        await page.close();
        console.log("[INFO] Página principal fechada com sucesso");
      } catch (error) {
        console.error("[ERROR] Erro ao fechar página principal:", error);
      }
    }
  }

  return jobDetails;
}

module.exports = getJobDetails;
