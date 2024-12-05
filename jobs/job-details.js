const puppeteer = require("puppeteer");

async function getJobDetails(browser, jobUrl, li_at) {
  console.log(`[INFO] Acessando detalhes da vaga: ${jobUrl}`);
  let page = null;

  try {
    page = await browser.newPage();
    const cookies = [{ name: "li_at", value: li_at, domain: ".linkedin.com" }];
    await page.setCookie(...cookies);

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36"
    );

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

    const jobDetails = await page.evaluate(() => {
      const title = document.querySelector(".job-details-jobs-unified-top-card__job-title")?.innerText.trim() || "";
      const company = document.querySelector(".job-details-jobs-unified-top-card__company-name")?.innerText.trim() || "";
      const locationData = document.querySelector(".job-details-jobs-unified-top-card__primary-description-container")?.innerText.trim() || "";
      const description = document.querySelector("#job-details")?.innerText.trim() || "";
      
      // Nova lógica para extrair apenas o formato de trabalho
      const formatElement = document.querySelector(".job-details-jobs-unified-top-card__job-insight .ltr");
      let format = "";
      if (formatElement) {
        const formatText = formatElement.innerText.trim();
        // Extrai apenas a primeira palavra (Remoto, Híbrido ou Presencial)
        const match = formatText.match(/^(Remoto|Híbrido|Presencial)/i);
        format = match ? match[0] : formatText;
      }

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
