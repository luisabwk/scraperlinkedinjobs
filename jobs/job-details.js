const puppeteer = require("puppeteer");

function normalizeCompanyName(name) {
  return name.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // remove acentos
    .replace(/[^a-z0-9]/g, '')        // remove caracteres especiais
    .trim();
}

function isValidApplyUrl(url, companyName) {
  try {
    const urlLower = url.toLowerCase();
    const normalizedCompany = normalizeCompanyName(companyName);
    
    // Lista de plataformas conhecidas
    const platforms = [
      'gupy.io',
      'kenoby.com',
      'lever.co',
      'greenhouse.io',
      'abler.com.br',
      'workday.com',
      'breezy.hr',
      'pandape.com',
      'betterplace.com.br',
      'netvagas.com.br',
      'indeed.com'
    ];

    // Verificar se a URL contém o nome da empresa normalizado
    const hasCompanyName = urlLower.includes(normalizedCompany);
    
    // Verificar se a URL contém alguma plataforma conhecida
    const hasPlatform = platforms.some(platform => urlLower.includes(platform));

    // URL é válida se contiver OU o nome da empresa OU uma plataforma conhecida
    if (hasCompanyName || hasPlatform) {
      if (hasCompanyName) {
        console.log("[DEBUG] URL contém nome da empresa");
      }
      if (hasPlatform) {
        console.log("[DEBUG] URL contém plataforma conhecida");
      }
      return true;
    }

    return false;
  } catch (error) {
    return false;
  }
}

async function getJobDetails(browser, jobUrl, li_at) {
  console.log(`[INFO] Acessando detalhes da vaga: ${jobUrl}`);
  let page = null;
  let jobDetails = {};
  const externalUrls = [];

  try {
    page = await browser.newPage();
    
    // Configurar interceptação de requisições
    await page.setRequestInterception(true);
    
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (resourceType === 'image' || resourceType === 'media' || resourceType === 'font') {
        req.abort();
      } else {
        req.continue();
      }
    });
    
    page.on('requestfinished', (req) => {
      const url = req.url();
      if (url && !url.includes('linkedin.com') && isValidApplyUrl(url, jobDetails.company)) {
        console.log("[DEBUG] URL potencial encontrada:", url);
        externalUrls.push(url);
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
      console.log("[DEBUG] Nome da empresa:", jobDetails.company);
      
      const applyButtonSelector = '.jobs-apply-button--top-card';
      await page.waitForSelector(applyButtonSelector, { timeout: 10000 });
      
      const buttonText = await page.evaluate((selector) => {
        const button = document.querySelector(selector);
        return button ? button.textContent.trim() : '';
      }, applyButtonSelector);
      
      console.log("[INFO] Texto do botão de candidatura:", buttonText);

      if (buttonText.includes("Candidatar-se")) {
        console.log("[INFO] Detectada candidatura externa. Iniciando processo de candidatura...");
        try {
          // Verificar existência do modal
          const modalExists = await page.evaluate(() => {
            const modalButton = document.querySelector('.jobs-apply-button.artdeco-button.artdeco-button--icon-right.artdeco-button--3.artdeco-button--primary.ember-view');
            return modalButton && modalButton.offsetParent !== null;
          });

          // Clicar no botão apropriado
          if (modalExists) {
            console.log("[INFO] Modal detectado. Clicando no botão 'Continuar'...");
            await page.click('.jobs-apply-button.artdeco-button.artdeco-button--icon-right.artdeco-button--3.artdeco-button--primary.ember-view');
          } else {
            console.log("[INFO] Clicando no botão 'Candidatar-se'...");
            await page.click(applyButtonSelector);
          }

          console.log("[INFO] Botão clicado com sucesso");

          // Aguardar redirecionamentos
          await Promise.race([
            new Promise(r => setTimeout(r, 3000)),
            page.waitForNavigation({ timeout: 3000 }).catch(() => {})
          ]);

          let applyUrl = null;

          // Verificar URLs coletadas
          if (externalUrls.length > 0) {
            applyUrl = externalUrls[0];
            console.log("[INFO] URL de aplicação encontrada via requisições:", applyUrl);
          } else {
            // Verificar nova aba
            try {
              const pages = await browser.pages();
              const newPage = pages[pages.length - 1];
              if (newPage && newPage !== page) {
                const newUrl = await newPage.url();
                console.log("[DEBUG] URL da nova aba:", newUrl);
                
                if (isValidApplyUrl(newUrl, jobDetails.company)) {
                  applyUrl = newUrl;
                  console.log("[INFO] URL de aplicação válida encontrada na nova aba");
                }
                await newPage.close();
              } else {
                console.log("[INFO] Nenhuma nova aba detectada");
              }
            } catch (err) {
              console.warn("[WARN] Erro ao verificar novas abas:", err.message);
            }
          }

          jobDetails.applyUrl = applyUrl || jobUrl;
        } catch (error) {
          console.warn("[WARN] Erro ao processar candidatura:", error.message);
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
