const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const path = require("path");
require('dotenv').config();

// Função para fazer scroll automático para carregar mais conteúdo
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 300;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight - window.innerHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100 + Math.floor(Math.random() * 150)); // Variação aleatória para parecer humano
    });
  });
}

// Função para aguardar carregamento de rede
async function waitForNetworkIdle(page, timeout = 15000, maxInflightRequests = 0) {
  try {
    await page.waitForNetworkIdle({ 
      idleTime: 1000, 
      timeout: timeout,
      maxInflightRequests: maxInflightRequests 
    });
    return true;
  } catch (error) {
    console.warn('[WARN] Network idle timeout reached, continuing anyway');
    return false;
  }
}

// Função para simular comportamento humano
async function humanBehavior(page) {
  // Movimentos aleatórios do mouse
  await page.mouse.move(
    100 + Math.floor(Math.random() * 500), 
    100 + Math.floor(Math.random() * 500), 
    { steps: 10 }
  );
  
  // Pequena pausa
  await new Promise(r => setTimeout(r, 500 + Math.floor(Math.random() * 1000)));
  
  // Scroll leve
  await page.mouse.wheel({ deltaY: 200 + Math.floor(Math.random() * 400) });
  
  // Outra pausa
  await new Promise(r => setTimeout(r, 500 + Math.floor(Math.random() * 1000)));
}

// Função principal para extrair listagens de vagas
async function getJobListings(browser, searchTerm, location, li_at, maxJobs = 100) {
  console.log("[DEBUG] Iniciando o processo de getJobListings...");
  let allJobs = [];
  
  // Criar diretório para screenshots
  const screenshotDir = path.join(__dirname, "../screenshots");
  try {
    await fs.mkdir(screenshotDir, { recursive: true });
    console.log(`[INFO] Diretório de screenshots criado: ${screenshotDir}`);
  } catch (error) {
    console.error("[ERROR] Falha ao criar diretório de screenshots:", error);
  }
  
  // URL de busca com parâmetros otimizados para LinkedIn
  // Usando o formato diferente da URL para evitar detecção de padrões
  const baseUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(searchTerm)}&location=${encodeURIComponent(location)}&geoId=106057199&f_TPR=r604800&trk=public_jobs_jobs-search-bar_search-submit&position=1&pageNum=0`;

  console.log(`[INFO] Acessando a URL inicial: ${baseUrl}`);

  if (!browser || typeof browser.newPage !== "function") {
    throw new Error("Navegador Puppeteer não inicializado corretamente.");
  }

  let page = null;

  try {
    page = await browser.newPage();
    
    // Configurar proxy rotativo do IPRoyal se disponível
    const proxyUsername = process.env.PROXY_USERNAME;
    const proxyPassword = process.env.PROXY_PASSWORD;
    
    if (proxyUsername && proxyPassword) {
      console.log("[INFO] Configurando proxy rotativo do IPRoyal...");
      await page.authenticate({
        username: proxyUsername,
        password: proxyPassword
      });
    } else {
      console.warn("[WARN] Credenciais de proxy não encontradas nas variáveis de ambiente.");
    }
    
    // Configurar navegador para parecer mais humano
    // Usando viewport realista com dimensões variadas
    await page.setViewport({ 
      width: 1280 + Math.floor(Math.random() * 100), 
      height: 800 + Math.floor(Math.random() * 100),
      deviceScaleFactor: 1,
      hasTouch: false,
      isLandscape: true,
      isMobile: false
    });
    
    // Configurando user-agent realista
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );
    
    // Headers adicionais para parecer mais legítimo
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'sec-ch-ua': '"Google Chrome";v="122", " Not;A Brand";v="99", "Chromium";v="122"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'Referer': 'https://www.google.com/',
      'DNT': '1'
    });

    // Configurar cookies para autenticação
    const cookies = [
      {
        name: "li_at",
        value: li_at,
        domain: ".linkedin.com",
      },
      {
        name: "lang",
        value: "pt_BR",
        domain: ".linkedin.com",
      },
      {
        name: "lidc",
        value: `b=VGTM01:g=45:u=1:i=now:t=${Date.now()}`,
        domain: ".linkedin.com",
      },
      {
        name: "JSESSIONID",
        value: `ajax:${Math.random().toString(36).substring(2)}`,
        domain: ".linkedin.com",
      }
    ];
    
    await page.setCookie(...cookies);
    console.log("[INFO] Cookies configurados com sucesso.");

    // ========== ANTI-DETECÇÃO ==========
    // Modificar o userAgent para remover identificadores de headless
    await page.evaluateOnNewDocument(() => {
      // Sobrescrever propriedades do navegador que podem ser usadas para detecção
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
      
      // Sobrescrever o userAgent
      const userAgent = navigator.userAgent;
      if (userAgent.includes("HeadlessChrome")) {
        Object.defineProperty(navigator, 'userAgent', {
          get: () => userAgent.replace("HeadlessChrome", "Chrome"),
        });
      }
      
      // Adicionar plugins para parecer mais realista
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          {
            description: "Chrome PDF Plugin",
            filename: "internal-pdf-viewer",
            length: 1,
            name: "Chrome PDF Plugin"
          },
          {
            description: "Chrome PDF Viewer",
            filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai",
            length: 1,
            name: "Chrome PDF Viewer"
          },
          {
            description: "Native Client",
            filename: "internal-nacl-plugin",
            length: 2,
            name: "Native Client"
          }
        ],
      });
      
      // Simular linguagens
      Object.defineProperty(navigator, 'languages', {
        get: () => ['pt-BR', 'pt', 'en-US', 'en'],
      });
      
      // Modificar os valores de outerWidth e outerHeight
      Object.defineProperty(window, 'outerWidth', {
        get: () => 1280 + Math.floor(Math.random() * 100),
      });
      Object.defineProperty(window, 'outerHeight', {
        get: () => 800 + Math.floor(Math.random() * 100),
      });
      
      // Simular WebGL
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        // UNMASKED_VENDOR_WEBGL
        if (parameter === 37445) {
          return 'Google Inc. (Intel)';
        }
        // UNMASKED_RENDERER_WEBGL
        if (parameter === 37446) {
          return 'ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)';
        }
        return getParameter.apply(this, arguments);
      };
    });

    // Otimizar carregamento bloqueando recursos desnecessários mas nem todos
    // para não parecer suspeito
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      const url = req.url();
      
      // Bloquear recursos específicos que não são cruciais
      if (
        // Bloquear analytics e rastreamento que poderiam detectar automação
        url.includes('google-analytics.com') || 
        url.includes('analytics') || 
        url.includes('tracking') || 
        url.includes('/log') ||
        url.includes('doubleclick.net') ||
        // Bloquear anúncios
        url.includes('googleadservices') ||
        url.includes('pagead') ||
        // Tipos de recursos menos importantes (mas não todos)
        (resourceType === 'image' && Math.random() > 0.3) || // Carregar algumas imagens aleatoriamente
        resourceType === 'media' ||
        (resourceType === 'font' && !url.includes('linkedin.com'))
      ) {
        req.abort();
      } else {
        req.continue();
      }
    });
    
    // Navegação com retry
    let maxRetries = 3;
    let currentRetry = 0;
    let success = false;

    while (currentRetry < maxRetries && !success) {
      try {
        console.log(`[INFO] Navigation attempt ${currentRetry + 1} of ${maxRetries}`);
        
        // Adicionar um delay aleatório para parecer mais humano
        await new Promise(r => setTimeout(r, 2000 + Math.floor(Math.random() * 3000)));
        
        // Simular comportamento humano antes da navegação
        await humanBehavior(page);
        
        // Navegação com timeout generoso
        await page.goto(baseUrl, { 
          waitUntil: "domcontentloaded",
          timeout: 120000
        });

        // Esperar carregamento inicial com intervalo aleatório
        await new Promise(resolve => setTimeout(resolve, 5000 + Math.floor(Math.random() * 3000)));
        
        // Capturar screenshot inicial
        try {
          await page.screenshot({ 
            path: path.join(screenshotDir, `initial_page_${currentRetry}.png`), 
            fullPage: true 
          });
          console.log(`[INFO] Screenshot inicial salvo: initial_page_${currentRetry}.png`);
        } catch (ssError) {
          console.warn(`[WARN] Erro ao salvar screenshot: ${ssError.message}`);
        }
        
        // Verificar status da navegação
        const pageUrl = page.url();
        
        // Verificar se fomos redirecionados para login
        if (pageUrl.includes('/login') || pageUrl.includes('/checkpoint')) {
          console.error("[ERROR] Redirecionado para página de login ou checkpoint.");
          try {
            await page.screenshot({ 
              path: path.join(screenshotDir, `login_redirect_${currentRetry}.png`), 
              fullPage: true 
            });
          } catch (e) {}
          throw new Error("LinkedIn redirecionou para página de login. O cookie li_at pode estar inválido.");
        }
        
        // Verificar se há captcha ou desafio de segurança
        const securityCheck = await page.evaluate(() => {
          const body = document.body.innerText.toLowerCase();
          return {
            hasCaptcha: body.includes('captcha') || body.includes('robot') || body.includes('verificação'),
            hasError: body.includes('erro') || body.includes('error'),
            hasLogin: body.includes('sign in') || body.includes('entrar'),
            title: document.title
          };
        });
        
        console.log(`[INFO] Verificação de segurança: ${JSON.stringify(securityCheck)}`);
        
        if (securityCheck.hasCaptcha) {
          console.error("[ERROR] Desafio de segurança ou captcha detectado.");
          try {
            await page.screenshot({ 
              path: path.join(screenshotDir, `captcha_detected_${currentRetry}.png`), 
              fullPage: true 
            });
          } catch (e) {}
          throw new Error("LinkedIn está solicitando verificação de segurança ou captcha.");
        }
        
        if (securityCheck.hasLogin) {
          console.error("[ERROR] Página de login detectada.");
          try {
            await page.screenshot({ 
              path: path.join(screenshotDir, `login_page_${currentRetry}.png`), 
              fullPage: true 
            });
          } catch (e) {}
          throw new Error("LinkedIn está solicitando login. O cookie li_at pode estar inválido.");
        }
        
        // Simular comportamento humano novamente
        await humanBehavior(page);
        
        // Verificar se existem elementos de vaga
        const jobElements = await page.evaluate(() => {
          // Tentar detectar elementos de vaga com diferentes seletores
          const selectors = [
            '.job-card-container',
            '.job-search-card',
            '.jobs-search-results__list-item',
            '.scaffold-layout__list-item',
            '.jobs-search-two-pane__results',
            '.jobs-search-results-list',
            '.job-card-list'
          ];
          
          for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
              return {
                count: elements.length,
                selector
              };
            }
          }
          
          // Se não encontrar com seletores padrão, procurar links de vagas
          const jobLinks = document.querySelectorAll('a[href*="/jobs/view/"]');
          if (jobLinks.length > 0) {
            return {
              count: jobLinks.length,
              selector: 'a[href*="/jobs/view/"]'
            };
          }
          
          return { count: 0, selector: null };
        });
        
        console.log(`[INFO] Found ${jobElements.count} job elements with selector: ${jobElements.selector}`);
        
        if (jobElements.count > 0) {
          success = true;
          console.log("[INFO] Navigation successful, job elements detected");
        } else {
          console.warn("[WARN] No job elements found, attempting scrolling and waiting...");
          
          // Injetar mover cursor e clicar em diferentes áreas para simular usuário real
          await page.mouse.move(500, 400);
          await page.mouse.down();
          await new Promise(r => setTimeout(r, 100));
          await page.mouse.up();
          
          // Tentar rolar a página para carregar mais conteúdo
          await autoScroll(page);
          
          // Esperar novamente após scrolling
          await new Promise(resolve => setTimeout(resolve, 3000 + Math.floor(Math.random() * 2000)));
          
          // Verificar novamente após o scroll
          const jobElementsAfterScroll = await page.evaluate(() => {
            const jobLinks = document.querySelectorAll('a[href*="/jobs/view/"]');
            return jobLinks.length;
          });
          
          if (jobElementsAfterScroll > 0) {
            success = true;
            console.log(`[INFO] Found ${jobElementsAfterScroll} job links after scrolling`);
          } else {
            // Tentar usando uma abordagem diferente - analisar texto da página
            const pageContainsJobText = await page.evaluate(() => {
              const text = document.body.innerText.toLowerCase();
              return (
                text.includes('vagas') || 
                text.includes('emprego') || 
                text.includes('resultados') ||
                text.includes('jobs found') ||
                text.includes('trabalho')
              );
            });
            
            if (pageContainsJobText) {
              console.log('[INFO] Página contém texto relacionado a vagas, tentando continuar...');
              success = true;
            } else {
              // Capturar HTML para análise
              try {
                const html = await page.content();
                await fs.writeFile(path.join(screenshotDir, `page_source_${currentRetry}.html`), html);
                console.log(`[INFO] HTML da página salvo para análise: page_source_${currentRetry}.html`);
              } catch (e) {
                console.warn(`[WARN] Erro ao salvar HTML da página: ${e.message}`);
              }
              
              throw new Error("Não foi possível encontrar elementos de vaga após scroll e espera.");
            }
          }
        }
      } catch (error) {
        currentRetry++;
        console.warn(`[WARN] Navigation attempt ${currentRetry} failed:`, error.message);
        
        if (currentRetry === maxRetries) {
          throw new Error(`All navigation attempts failed: ${error.message}`);
        }
        
        // Limpar estado e esperar antes da próxima tentativa
        await page.evaluate(() => window.stop());
        await new Promise(resolve => setTimeout(resolve, 8000 + Math.floor(Math.random() * 5000)));
      }
    }

    console.log("[INFO] Página inicial acessada com sucesso. Extraindo vagas...");
    
    // Fazer scroll completo para garantir carregamento de todas as vagas
    await autoScroll(page);
    console.log("[INFO] Scroll completo realizado para carregar todas as vagas");
    
    // Pausa aleatória após scroll
    await new Promise(resolve => setTimeout(resolve, 3000 + Math.floor(Math.random() * 3000)));
    
    // Capturar screenshot após scroll
    try {
      await page.screenshot({ 
        path: path.join(screenshotDir, `after_scroll.png`), 
        fullPage: true 
      });
      console.log("[INFO] Screenshot após scroll salvo");
    } catch (e) {
      console.warn(`[WARN] Erro ao salvar screenshot após scroll: ${e.message}`);
    }
    
    // Determinar quantidade de páginas
    let totalPages = 1;
    try {
      const paginationData = await page.evaluate(() => {
        // Método 1: botões de paginação numérica
        const pageButtons = Array.from(document.querySelectorAll('.artdeco-pagination__pages button'));
        if (pageButtons.length > 0) {
          const pageNumbers = pageButtons
            .map(btn => parseInt(btn.textContent.trim()))
            .filter(num => !isNaN(num));
            
          if (pageNumbers.length > 0) {
            return { pages: Math.max(...pageNumbers), method: 'buttons' };
          }
        }
        
        // Método 2: texto de resultados
        const resultsText = document.body.innerText.match(/Mostrando (\d+)-(\d+) de (\d+) resultados/i);
        if (resultsText && resultsText[3]) {
          const totalResults = parseInt(resultsText[3]);
          return { 
            pages: Math.ceil(totalResults / 25), 
            method: 'results-text',
            total: totalResults
          };
        }
        
        // Método 3: contagem de elementos
        const jobCards = document.querySelectorAll('.job-card-container, .job-search-card, a[href*="/jobs/view/"]');
        return { 
          pages: 1, 
          method: 'element-count',
          jobCount: jobCards.length
        };
      });
      
      if (paginationData.pages > 1) {
        totalPages = Math.min(paginationData.pages, 5); // Limitar a 5 páginas para evitar bloqueio
      }
      
      console.log(`[INFO] Paginação detectada: ${totalPages} páginas (método: ${paginationData.method})`);
    } catch (error) {
      console.warn("[WARN] Erro ao detectar paginação:", error.message);
    }

    // Processar cada página
    for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
      console.log(`[INFO] Processando página ${currentPage} de ${totalPages}...`);
      
      // Navegar para nova página se não for a primeira
      if (currentPage > 1) {
        const nextPageUrl = `${baseUrl}&start=${(currentPage - 1) * 25}`;
        console.log(`[INFO] Navegando para: ${nextPageUrl}`);
        
        // Pausa antes de carregar próxima página
        await new Promise(r => setTimeout(r, 3000 + Math.floor(Math.random() * 2000)));
        
        try {
          // Simular comportamento humano antes de navegar
          await humanBehavior(page);
          
          await page.goto(nextPageUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
          
          // Pausa após carregamento
          await new Promise(r => setTimeout(r, 3000 + Math.floor(Math.random() * 2000)));
          
          // Comportamento humano após carregamento
          await humanBehavior(page);
          
          // Rolar a página para carregar todo o conteúdo
          await autoScroll(page);
        } catch (error) {
          console.warn(`[WARN] Erro ao navegar para página ${currentPage}:`, error.message);
          continue;
        }
      }
      
      // Extrair dados das vagas usando seletores variados
      let jobsResult = [];
      
      try {
        // Testar múltiplos seletores para encontrar o que funciona
        const selectorSets = [
          // Set 1: Seletores padrão do LinkedIn
          {
            container: '.job-card-container',
            title: '.job-card-list__title',
            company: '.job-card-container__primary-description',
            location: '.job-card-container__metadata-wrapper',
            link: 'a[href*="/jobs/view/"]'
          },
          // Set 2: Seletores alternativos
          {
            container: '.job-search-card',
            title: 'h3',
            company: 'h4',
            location: '.job-search-card__location',
            link: 'a[href*="/jobs/view/"]'
          },
          // Set 3: Seletores genéricos
          {
            container: '.jobs-search-results__list-item',
            title: 'a[data-control-name="job_card_title_click"]',
            company: '.artdeco-entity-lockup__subtitle',
            location: '.artdeco-entity-lockup__caption',
            link: 'a[href*="/jobs/view/"]'
          }
        ];
        
        for (const selectors of selectorSets) {
          const foundJobs = await page.evaluate((sel) => {
            const containers = document.querySelectorAll(sel.container);
            if (containers.length === 0) return null;
            
            return Array.from(containers).map(card => {
              const titleEl = card.querySelector(sel.title);
              const companyEl = card.querySelector(sel.company);
              const locationEl = card.querySelector(sel.location);
              const linkEl = card.querySelector(sel.link);
              
              const title = titleEl ? titleEl.innerText.trim() : "";
              const company = companyEl ? companyEl.innerText.trim() : "";
              const locationText = locationEl ? locationEl.innerText.trim() : "";
              const link = linkEl ? linkEl.href : "";
              
              // Separar local e formato
              let location = locationText;
              let formato = "";
              
              const formatMatch = locationText.match(/\(([^)]+)\)/);
              if (formatMatch) {
                formato = formatMatch[1].trim();
                location = locationText.replace(/\(.*?\)/, "").trim();
              }
              
              return {
                vaga: title,
                empresa: company,
                local: location,
                formato: formato,
                link: link
              };
            });
          }, selectors);
          
          if (foundJobs && foundJobs.length > 0) {
            console.log(`[INFO] Encontrado ${foundJobs.length} vagas com seletor "${selectors.container}"`);
            jobsResult = foundJobs;
            break;
          }
        }
        
        // Se não encontrou com seletores, usar método alternativo
        if (jobsResult.length === 0) {
          console.warn("[WARN] Nenhuma vaga encontrada com seletores padrão, tentando método alternativo...");
          
          // Método alternativo: buscar todos os links que parecem ser de vagas
          jobsResult = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a[href*="/jobs/view/"]'));
            return links.map(link => {
              // Tentar encontrar informações de título, empresa e localização próximas ao link
              let card = link;
              // Navegar para cima na hierarquia DOM para encontrar o container
              for (let i = 0; i < 5 && card.parentElement; i++) {
                card = card.parentElement;
                // Se encontrar um elemento que parece ser um card, parar
                if (card.classList.length > 0 || card.tagName === 'LI') {
                  break;
                }
              }
              
              // Obter o título da vaga (texto do próprio link)
              const title = link.innerText.trim() || "Título não disponível";
              
              // Tentar encontrar a empresa - geralmente um h4 ou span próximo
              let company = "";
              const companyElement = card.querySelector('h4, [class*="company"], [class*="subtitle"]');
              if (companyElement) {
                company = companyElement.innerText.trim();
              }
              
              // Tentar encontrar a localização - geralmente um span ou div com texto sobre localização
              let location = "";
              const locationElement = card.querySelector('[class*="location"], [class*="caption"], [class*="metadata"]');
              if (locationElement) {
                location = locationElement.innerText.trim();
              }
              
              return {
                vaga: title,
                empresa: company,
                local: location,
                formato: "",
                link: link.href
              };
            });
          });
          
          console.log(`[INFO] Método alternativo encontrou ${jobsResult.length} links de vagas`);
        }
      } catch (error) {
        console.error(`[ERROR] Erro ao extrair dados das vagas na página ${currentPage}:`, error.message);
        // Continuar com próxima página mesmo com erro
        continue;
      }
      
      console.log(`[INFO] Encontrado ${jobsResult.length} vagas na página ${currentPage}`);
      
      // Adicionar vagas ao array geral, evitando duplicatas
      if (jobsResult.length > 0) {
        jobsResult.forEach(job => {
          if (job.link) {
            const jobIdMatch = job.link.match(/\/jobs\/view\/(\d+)/);
            if (jobIdMatch) {
              const jobId = jobIdMatch[1];
              if (!allJobs.some(j => j.link && j.link.includes(jobId))) {
                allJobs.push(job);
              }
            }
          }
        });
      }
      
      console.log(`[INFO] Total de vagas coletadas até agora: ${allJobs.length}`);
      
      // Verificar se atingiu o limite máximo
      if (allJobs.length >= maxJobs) {
        console.log(`[INFO] Limite máximo de vagas (${maxJobs}) atingido.`);
        break;
      }
      
      // Esperar entre páginas para parecer navegação humana
      if (currentPage < totalPages) {
        const waitTime = 5000 + Math.floor(Math.random() * 5000);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    console.log(`[INFO] Coleta finalizada. Total de vagas encontradas: ${allJobs.length}`);
    return { totalVagas: allJobs.length, vagas: allJobs.slice(0, maxJobs) };
  } catch (error) {
    console.error("[ERROR] Erro ao realizar scraping:", error);
    
    // Capturar screenshot final em caso de erro
    if (page) {
      try {
        await page.screenshot({ 
          path: path.join(screenshotDir, 'error_final_state.png'), 
          fullPage: true 
        });
        console.log("[INFO] Screenshot do estado de erro salvo");
      } catch (e) {
        console.error("[ERROR] Erro ao salvar screenshot final:", e.message);
      }
    }
    
    throw new Error(`Erro durante o scraping: ${error.message}`);
  } finally {
    if (page) {
      try {
        await page.close();
        console.log("[INFO] Page closed successfully");
      } catch (closeError) {
        console.error("[ERROR] Error closing page:", closeError);
      }
    }
  }
}

module.exports = getJobListings;
