const puppeteer = require("puppeteer");

async function getJobDetails(browser, jobUrl, li_at) {
  console.log(`[INFO] Acessando detalhes da vaga: ${jobUrl}`);
  let page = null;
  let applyPage = null;

  try {
    page = await browser.newPage();
    const cookies = [{ name: "li_at", value: li_at, domain: ".linkedin.com" }];
    await page.setCookie(...cookies);

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36"
    );

    // Configurar listener para novas páginas/popups antes de clicar no botão
    const pagePromise = new Promise(resolve => {
      browser.once('targetcreated', async target => {
        applyPage = await target.page();
        resolve(applyPage);
      });
    });

    await page.goto(jobUrl, { waitUntil: "domcontentloaded", timeout: 120000 });

    const seeMoreButtonSelector = ".jobs-description__footer-button";
    try {
      await page.waitForSelector(seeMoreButtonSelector, { timeout: 5000 });
      await page.click(seeMoreButtonSelector);
      console.log("[INFO] Botão 'Ver mais' clicado com sucesso.");
    } catch (error) {
      console.warn("[WARN] Botão 'Ver mais' não encontrado ou não clicável.");
    }

    await page.waitForSelector(".jobs-box__html-content", { timeout: 10000 });

    // Capturar detalhes iniciais da vaga
    let jobDetails = await page.evaluate(() => {
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
      };
    });

    // Tentar obter o link de aplicação
    try {
      console.log("[INFO] Tentando obter link de aplicação...");
      
      // Esperar pelo botão de aplicar
      await page.waitForSelector('.jobs-apply-button', { timeout: 5000 });
      
      // Clicar no botão e aguardar nova página/popup
      await page.click('.jobs-apply-button');
      const newPage = await pagePromise;
      
      // Aguardar um momento para garantir que a URL está carregada
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Pegar a URL da página de aplicação
      const applyUrl = newPage.url();
      console.log("[INFO] Link de aplicação obtido:", applyUrl);
      
      // Adicionar URL aos detalhes da vaga
      jobDetails.applyUrl = applyUrl;

      // Fechar a página de aplicação
      if (newPage) {
        await newPage.close();
      }
    } catch (error) {
      console.warn("[WARN] Não foi possível obter o link de aplicação:", error.message);
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
