const puppeteer = require("puppeteer");

async function getJobDetails(browser, jobUrl, li_at) {
  console.log(`[INFO] Acessando detalhes da vaga: ${jobUrl}`);
  let page = null;
  let newPage = null;
  let finalUrl = null;
  let jobDetails = {};

  try {
    page = await browser.newPage();

    // Configuração do navegador (mantida igual)...
    await page.setDefaultNavigationTimeout(60000);
    await page.setDefaultTimeout(30000);
    
    let redirectUrl = null;
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = request.url();
      console.log("[DEBUG] Request interceptada:", url);
      if (request.resourceType() === 'document' && !url.includes('linkedin.com')) {
        redirectUrl = url;
        console.log("[DEBUG] URL externa encontrada:", url);
      }
      if (request.resourceType() === 'image' || request.resourceType() === 'media' || request.resourceType() === 'font') {
        request.abort();
      } else {
        request.continue();
      }
    });

    // ... resto do código até o botão de candidatura ...

    if (buttonText.includes("Candidatar-se")) {
      console.log("[INFO] Detectada candidatura externa. Tentando obter URL...");

      // Injetar código para interceptar o clique
      await page.evaluate(() => {
        const button = document.querySelector('.jobs-apply-button--top-card');
        if (button) {
          const originalClick = button.onclick;
          button.onclick = function(e) {
            console.log("URL do botão:", this.href);
            if (originalClick) return originalClick.call(this, e);
          };
        }
      });

      // Monitorar o console da página
      page.on('console', msg => {
        const text = msg.text();
        if (text.includes('URL do botão:')) {
          const url = text.split('URL do botão:')[1].trim();
          if (url && !url.includes('linkedin.com')) {
            console.log("[DEBUG] URL capturada do console:", url);
            finalUrl = url;
          }
        }
      });

      // Clicar no botão e aguardar
      await Promise.all([
        page.click(applyButtonSelector),
        new Promise(r => setTimeout(r, 5000)) // Aguardar 5 segundos por qualquer redirecionamento
      ]);
      
      console.log("[INFO] Botão de candidatura clicado");
      
      // Usar a URL encontrada (da interceptação ou do console)
      if (redirectUrl) {
        console.log("[INFO] Usando URL do redirecionamento:", redirectUrl);
        jobDetails.applyUrl = redirectUrl;
      } else if (finalUrl) {
        console.log("[INFO] Usando URL do console:", finalUrl);
        jobDetails.applyUrl = finalUrl;
      } else {
        // Tentar pegar do botão diretamente uma última vez
        const buttonUrl = await page.evaluate(() => {
          const button = document.querySelector('.jobs-apply-button--top-card');
          return button ? (button.href || button.getAttribute('data-url') || button.getAttribute('data-apply-url')) : null;
        });
        
        if (buttonUrl && !buttonUrl.includes('linkedin.com')) {
          console.log("[INFO] URL encontrada no botão:", buttonUrl);
          jobDetails.applyUrl = buttonUrl;
        } else {
          console.log("[INFO] Nenhuma URL externa encontrada - usando URL original");
          jobDetails.applyUrl = jobUrl;
        }
      }
    }

    // ... resto do código igual ...

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
