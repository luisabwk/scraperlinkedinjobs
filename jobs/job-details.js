const puppeteer = require("puppeteer");

async function getJobDetails(browser, jobUrl, li_at) {
  console.log(`[INFO] Acessando detalhes da vaga: ${jobUrl}`);
  let page = null;
  let newPage = null;
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

        const newPagePromise = new Promise(resolve => {
          browser.once('targetcreated', async target => {
            const newPage = await target.page();
            resolve(newPage);
          });
        });

        await page.click(applyButtonSelector);
        console.log("[INFO] Botão de candidatura clicado");

        try {
          newPage = await newPagePromise;
          console.log("[DEBUG] Nova aba criada");

          if (newPage) {
            await newPage.waitForNavigation({ waitUntil: 'networkidle0', timeout: 5000 })
              .catch(() => console.log("[DEBUG] Timeout esperando navegação completa"));

            const currentUrl = await newPage.url();
            console.log("[DEBUG] URL atual da nova aba:", currentUrl);

            // Verificar se é uma URL externa (não-LinkedIn)
            if (currentUrl && !currentUrl.includes('linkedin.com')) {
                console.log("[INFO] URL externa encontrada");
                jobDetails.applyUrl = currentUrl;
            } else {
                console.log("[INFO] URL do LinkedIn encontrada - usando URL original da vaga");
                jobDetails.applyUrl = jobUrl;
            }
          }
        } catch (error) {
          console.warn("[WARN] Erro ao processar nova aba:", error.message);
          jobDetails.applyUrl = jobUrl;
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

  } catch (error) {
    console.error(`[ERROR] Falha ao obter detalhes da vaga: ${error.message}`);
    throw error;
  } finally {
    if (newPage) {
      try {
        await newPage.close();
        console.log("[INFO] Nova aba fechada com sucesso");
      } catch (error) {
        console.warn("[WARN] Erro ao fechar nova aba:", error);
      }
    }
    
    if (page) {
      try {
        await page.close();
        console.log("[INFO] Página principal fechada com sucesso");
      } catch (error) {
        console.warn("[WARN] Erro ao fechar página principal:", error);
      }
    }
  }

  return jobDetails;
}

module.exports = getJobDetails;
