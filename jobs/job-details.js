const puppeteer = require("puppeteer");

async function getJobDetails(browser, jobUrl, li_at) {
  console.log(`[INFO] Acessando detalhes da vaga: ${jobUrl}`);
  let page = null;

  try {
    page = await browser.newPage();
    
    // Configuração para expor funções do navegador
    await page.exposeFunction('logClick', async (text) => {
      console.log('[Click Event]', text);
    });

    // Configurar cookies e user agent
    const cookies = [{ name: "li_at", value: li_at, domain: ".linkedin.com" }];
    await page.setCookie(...cookies);

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36"
    );

    // Acessar a página
    console.log("[INFO] Carregando página...");
    await page.goto(jobUrl, { waitUntil: "networkidle0", timeout: 120000 });
    console.log("[INFO] Página carregada");

    // Expandir descrição
    try {
      const seeMoreButtonSelector = ".jobs-description__footer-button";
      await page.waitForSelector(seeMoreButtonSelector, { timeout: 5000 });
      await page.click(seeMoreButtonSelector);
      console.log("[INFO] Botão 'Ver mais' clicado com sucesso.");
    } catch (error) {
      console.warn("[WARN] Botão 'Ver mais' não encontrado ou não clicável.");
    }

    // Capturar detalhes básicos
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
      console.log("[INFO] Buscando botão de aplicação...");

      // Injetar listeners para monitorar mudanças na página
      await page.evaluate(() => {
        window.addEventListener('click', e => {
          const element = e.target;
          if (element.tagName === 'A' && element.href) {
            window.logClick(`Link clicked: ${element.href}`);
          }
          if (element.tagName === 'BUTTON') {
            window.logClick(`Button clicked: ${element.textContent}`);
          }
        }, true);
      });

      // Aguardar e clicar no botão de aplicar
      const applyButtonSelector = '.jobs-apply-button';
      await page.waitForSelector(applyButtonSelector, { visible: true, timeout: 5000 });
      
      // Capturar atributos do botão antes de clicar
      const buttonInfo = await page.evaluate((selector) => {
        const button = document.querySelector(selector);
        return {
          text: button.textContent.trim(),
          href: button.getAttribute('href'),
          onclick: button.getAttribute('onclick'),
          dataControl: button.getAttribute('data-control-name'),
          classes: button.className
        };
      }, applyButtonSelector);
      
      console.log("[INFO] Informações do botão:", buttonInfo);

      // Clicar no botão e monitorar eventos
      await Promise.all([
        page.click(applyButtonSelector),
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 5000 }).catch(() => {})
      ]);

      // Capturar URL após o clique
      const currentUrl = page.url();
      console.log("[INFO] URL após clique:", currentUrl);

      // Verificar se há um formulário de aplicação
      const formUrl = await page.evaluate(() => {
        const form = document.querySelector('form[data-control-name*="apply"]');
        return form ? form.action : null;
      });

      jobDetails.applyUrl = formUrl || currentUrl;
      
    } catch (error) {
      console.warn("[WARN] Não foi possível obter a URL de aplicação:", error.message);
      jobDetails.applyUrl = null;
    }

    return jobDetails;

  } catch (error) {
    console.error(`[ERROR] Falha ao obter detalhes da vaga: ${error.message}`);
    throw error;
  } finally {
    if (page) {
      await page.close().catch(console.error);
    }
  }
}

module.exports = getJobDetails;
