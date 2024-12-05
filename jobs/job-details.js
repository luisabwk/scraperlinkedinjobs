const puppeteer = require("puppeteer");

async function getJobDetails(browser, jobUrl, li_at) {
  console.log(`[INFO] Acessando detalhes da vaga: ${jobUrl}`);

  try {
    const page = await browser.newPage();
    // Configurar o cookie 'li_at' para autenticação no LinkedIn
    const cookies = [{ name: "li_at", value: li_at, domain: ".linkedin.com" }];
    await page.setCookie(...cookies);

    // Definir um User-Agent para simular um navegador comum
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36"
    );

    // Acessar a página da vaga
    await page.goto(jobUrl, { waitUntil: "domcontentloaded", timeout: 120000 });

    // Verificar e clicar no botão "Ver mais" para carregar a descrição completa
    const seeMoreButtonSelector = ".jobs-description__footer-button";
    try {
      await page.waitForSelector(seeMoreButtonSelector, { timeout: 5000 });
      await page.click(seeMoreButtonSelector);
      console.log("[INFO] Botão 'Ver mais' clicado com sucesso.");
    } catch (error) {
      console.warn("[WARN] Botão 'Ver mais' não encontrado ou não clicável.");
    }

    // Esperar que o conteúdo completo seja carregado
    await page.waitForSelector(".jobs-box__html-content", { timeout: 10000 });

    // Extrair detalhes da vaga
    const jobDetails = await page.evaluate(() => {
      const title = document.querySelector(".job-details-jobs-unified-top-card__job-title")?.innerText.trim() || "";
      const company = document.querySelector(".job-details-jobs-unified-top-card__company-name")?.innerText.trim() || "";
      const locationData = document.querySelector(".job-details-jobs-unified-top-card__primary-description-container")?.innerText.trim() || "";
      const description = document.querySelector("#job-details")?.innerText.trim() || "";
      const format = document.querySelector(".job-details-jobs-unified-top-card__job-insight")?.innerText.trim() || "";

      // Extrair apenas a informação antes do primeiro caractere '·'
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

    console.log(`[INFO] Detalhes da vaga extraídos com sucesso para: ${jobUrl}`);
    return jobDetails;
  } catch (error) {
    console.error(`[ERROR] Falha ao obter detalhes da vaga: ${error.message}`);
    throw new Error("Erro ao obter detalhes da vaga.");
  } finally {
    if (page) {
      await page.close().catch(console.error);
    }
  }
}

module.exports = getJobDetails;
