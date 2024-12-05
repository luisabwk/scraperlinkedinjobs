const puppeteer = require("puppeteer");

async function getJobDetails(browser, jobUrl, li_at) {
  console.log(`[INFO] Acessando detalhes da vaga: ${jobUrl}`);
  let page = null;

  try {
    page = await browser.newPage();
    
    // Interceptar requisições de navegação para capturar redirecionamentos
    let applyUrl = null;
    page.on('request', request => {
      if (request.isNavigationRequest() && request.url().includes('jobs/view/apply')) {
        applyUrl = request.url();
        console.log('[INFO] URL de aplicação capturada:', applyUrl);
      }
      request.continue();
    });

    // Habilitar interceptação de requisições
    await page.setRequestInterception(true);

    // Configurar cookies e user agent
    const cookies = [{ name: "li_at", value: li_at, domain: ".linkedin.com" }];
    await page.setCookie(...cookies);

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36"
    );

    // Acessar a página da vaga
    await page.goto(jobUrl, { waitUntil: "domcontentloaded", timeout: 120000 });

    // Expandir descrição se necessário
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
      
      // Clicar no botão de aplicar
      await page.waitForSelector('.jobs-apply-button', { timeout: 5000 });
      await page.click('.jobs-apply-button');
      console.log("[INFO] Botão de aplicar clicado");

      // Esperar pelo modal
      await page.waitForSelector('button[aria-label="Continuar para a aplicação da vaga"]', { timeout: 5000 });
      await page.click('button[aria-label="Continuar para a aplicação da vaga"]');
      console.log("[INFO] Botão Continuar clicado");

      // Aguardar um pouco para capturar a URL
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
