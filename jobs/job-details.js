const puppeteer = require("puppeteer");

async function getJobDetails(browser, jobUrl, li_at) {
  console.log(`[INFO] Acessando detalhes da vaga: ${jobUrl}`);
  let page = null;

  try {
    page = await browser.newPage();
    
    // Habilitar logs de console da página
    page.on('console', msg => console.log('[PAGE LOG]', msg.text()));
    
    // Interceptar requisições de navegação
    let applyUrl = null;
    await page.setRequestInterception(true);
    
    page.on('request', request => {
      const url = request.url();
      if (request.isNavigationRequest() && (url.includes('jobs/view/apply') || url.includes('jobs/apply'))) {
        applyUrl = url;
        console.log('[INFO] URL de aplicação capturada:', applyUrl);
      }
      request.continue();
    });

    // Configurar cookies e user agent
    const cookies = [{ name: "li_at", value: li_at, domain: ".linkedin.com" }];
    await page.setCookie(...cookies);

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36"
    );

    await page.goto(jobUrl, { waitUntil: "domcontentloaded", timeout: 120000 });

    try {
      const seeMoreButtonSelector = ".jobs-description__footer-button";
      await page.waitForSelector(seeMoreButtonSelector, { timeout: 5000 });
      await page.click(seeMoreButtonSelector);
      console.log("[INFO] Botão 'Ver mais' clicado com sucesso.");
    } catch (error) {
      console.warn("[WARN] Botão 'Ver mais' não encontrado ou não clicável.");
    }

    // Capturar detalhes básicos da vaga
    const jobDetails = await page.evaluate(() => {
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
        format
      };
    });

    // Tentar obter URL de aplicação
    try {
      console.log("[INFO] Tentando obter URL de aplicação...");
      
      // Seletor correto para o botão de aplicar
      const applyButtonSelector = '.jobs-apply-button.artdeco-button.artdeco-button--icon-right.artdeco-button--3.artdeco-button--primary.ember-view';
      
      await page.waitForSelector(applyButtonSelector, { timeout: 5000 });
      console.log("[INFO] Botão de aplicar encontrado");
      
      // Extrair texto do botão para debug
      const buttonText = await page.evaluate((selector) => {
        const button = document.querySelector(selector);
        return button ? button.textContent.trim() : '';
      }, applyButtonSelector);
      
      console.log("[INFO] Texto do botão:", buttonText);
      
      // Clicar no botão
      await page.click(applyButtonSelector);
      console.log("[INFO] Botão de aplicar clicado");

      // Aguardar um momento para possível carregamento do modal
      await new Promise(r => setTimeout(r, 2000));

      // Tentar capturar qualquer URL gerada
      await new Promise(r => setTimeout(r, 2000));
      
      // Adicionar a URL capturada aos detalhes
      jobDetails.applyUrl = applyUrl;
      
    } catch (error) {
      console.warn("[WARN] Não foi possível obter a URL de aplicação:", error.message);
      jobDetails.applyUrl = null;
    }

    console.log(`[INFO] Detalhes da vaga extraídos com sucesso para: ${jobUrl}`);
    return jobDetails;

  } catch (error) {
    console.error(`[ERROR] Falha ao obter detalhes da vaga: ${error.message}`);
    throw error;
  } finally {
    if (page) {
      try {
        await page.close();
        console.log("[INFO] Página fechada com sucesso");
      } catch (closeError) {
        console.error("[ERROR] Erro ao fechar página:", closeError);
      }
    }
  }
}

module.exports = getJobDetails;
