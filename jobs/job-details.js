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
          // Array para armazenar todos os targets criados
          const allTargets = [];
          
          // Criar Promise para capturar nova aba antes de clicar no botão
          const newTabPromise = new Promise((resolve) => {
            browser.on('targetcreated', async (target) => {
              const targetInfo = {
                type: target.type(),
                url: target.url(),
                opener: target.opener() ? await target.opener().url() : null
              };
              allTargets.push(targetInfo);
              
              console.log("[DEBUG] Novo target detectado:", {
                tipo: targetInfo.type,
                url: targetInfo.url,
                paginaOrigem: targetInfo.opener
              });

              if (target.type() === 'page') {
                const newPage = await target.page();
                console.log("[DEBUG] Nova página criada");
                
                // Monitor de eventos da nova página
                newPage.on('console', msg => console.log('[DEBUG] Console da nova página:', msg.text()));
                newPage.on('error', err => console.log('[DEBUG] Erro na nova página:', err));
                newPage.on('pageerror', err => console.log('[DEBUG] Erro de página na nova aba:', err));
                newPage.on('requestfailed', request => console.log('[DEBUG] Requisição falhou na nova aba:', request.url()));
                newPage.on('response', response => console.log('[DEBUG] Resposta recebida na nova aba:', {
                  url: response.url(),
                  status: response.status()
                }));
                
                resolve(newPage);
              }
            });

            // Monitor para outros eventos do browser
            browser.on('targetchanged', (target) => {
              console.log('[DEBUG] Target alterado:', {
                tipo: target.type(),
                url: target.url()
              });
            });

            browser.on('targetdestroyed', (target) => {
              console.log('[DEBUG] Target destruído:', {
                tipo: target.type(),
                url: target.url()
              });
            });
          });

          // Estado do botão antes do clique
          console.log("[DEBUG] Estado do botão antes do clique:", await page.evaluate((selector) => {
            const button = document.querySelector(selector);
            return {
              existe: !!button,
              visivel: button ? window.getComputedStyle(button).display !== 'none' : false,
              clicavel: button ? !button.disabled : false,
              texto: button ? button.textContent : null,
              html: button ? button.outerHTML : null
            };
          }, applyButtonSelector));

          // Clicar no botão 'Candidatar-se'
          console.log("[INFO] Clicando no botão 'Candidatar-se'...");
          await page.click(applyButtonSelector);
          console.log("[INFO] Botão clicado com sucesso");

          // Estado da página após o clique
          console.log("[DEBUG] Estado da página após clique:", {
            url: await page.url(),
            titulo: await page.title()
          });

          // Verificar mudanças no DOM após o clique
          const domChanges = await page.evaluate(() => {
            return {
              botaoAindaExiste: !!document.querySelector('.jobs-apply-button--top-card'),
              modalAberto: !!document.querySelector('[role="dialog"]'),
              novosBotoes: Array.from(document.querySelectorAll('button')).map(b => ({
                texto: b.textContent,
                visivel: window.getComputedStyle(b).display !== 'none'
              }))
            };
          });
          console.log("[DEBUG] Mudanças no DOM após clique:", domChanges);

          console.log("[INFO] Aguardando nova aba...");
          
          // Aguardar nova aba ser aberta com timeout
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => {
              console.log("[DEBUG] Timeout atingido. Estado final:", {
                totalTargets: allTargets.length,
                targets: allTargets
              });
              reject(new Error('Timeout esperando nova aba'));
            }, 5000)
          );

          const newPage = await Promise.race([newTabPromise, timeoutPromise])
            .catch(error => {
              console.warn("[WARN] Erro aguardando nova aba:", error.message);
              return null;
            });

          let applyUrl = null;

          if (newPage) {
            console.log("[INFO] Nova aba detectada");
            
            try {
              // Aguardar navegação na nova aba
              await newPage.waitForNavigation({ waitUntil: 'networkidle0', timeout: 5000 })
                .catch(() => console.log("[INFO] Timeout de navegação na nova aba"));
              
              const newUrl = await newPage.url();
              console.log("[DEBUG] URL da nova aba:", newUrl);

              if (isValidApplyUrl(newUrl, jobDetails.company)) {
                applyUrl = newUrl;
                console.log("[INFO] URL de aplicação válida encontrada na nova aba");
              } else {
                console.log("[INFO] URL da nova aba não é válida para aplicação");
              }

              await newPage.close();
              console.log("[INFO] Nova aba fechada");
            } catch (err) {
              console.warn("[WARN] Erro ao processar nova aba:", err.message);
              if (newPage) await newPage.close().catch(() => {});
            }
          }

          if (!applyUrl && externalUrls.length > 0) {
            applyUrl = externalUrls[0];
            console.log("[INFO] URL de aplicação encontrada via requisições:", applyUrl);
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
