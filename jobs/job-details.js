const puppeteer = require("puppeteer");

async function getJobDetails(browser, jobUrl, li_at) {
  console.log(`[INFO] Acessando detalhes da vaga: ${jobUrl}`);
  let page = null;

  try {
    page = await browser.newPage();
    
    // Configurar cookies e user agent
    const cookies = [{ name: "li_at", value: li_at, domain: ".linkedin.com" }];
    await page.setCookie(...cookies);

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36"
    );

    await page.goto(jobUrl, { waitUntil: "networkidle0", timeout: 120000 });

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

    // Nova lógica para URL de aplicação
    try {
      console.log("[INFO] Verificando tipo de candidatura...");
      
      const applyButtonSelector = '.jobs-apply-button';
      await page.waitForSelector(applyButtonSelector, { timeout: 5000 });
      
      // Capturar o texto do botão
      const buttonText = await page.evaluate((selector) => {
        const button = document.querySelector(selector);
        return button ? button.textContent.trim() : '';
      }, applyButtonSelector);
      
      console.log("[INFO] Texto do botão de candidatura:", buttonText);

      if (buttonText.includes("Candidate-se")) {
        console.log("[INFO] Detectada candidatura externa. Tentando obter URL...");
        
        // Configurar listener para capturar nova URL
        let externalUrl = null;
        page.on('request', request => {
          if (request.isNavigationRequest()) {
            externalUrl = request.url();
            console.log('[INFO] URL de redirecionamento capturada:', externalUrl);
          }
        });

        // Clicar no botão e aguardar redirecionamento
        await page.click(applyButtonSelector);
        await new Promise(r => setTimeout(r, 2000));
        
        jobDetails.applyUrl = externalUrl;
        console.log("[INFO] URL externa definida:", externalUrl);
        
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
