const puppeteer = require("puppeteer");

async function getJobDetails(browser, jobUrl, li_at) {
  console.log(`[INFO] Acessando detalhes da vaga: ${jobUrl}`);
  let page = null;
  let newPage = null;

  try {
    page = await browser.newPage();
    
    // ... (código anterior até a parte do botão) ...

    try {
      console.log("[INFO] Verificando tipo de candidatura...");
      
      const applyButtonSelector = '.jobs-apply-button--top-card';
      await page.waitForSelector(applyButtonSelector, { timeout: 10000 });
      
      const buttonText = await page.evaluate((selector) => {
        const button = document.querySelector(selector);
        return button ? button.textContent.trim() : '';
      }, applyButtonSelector);
      
      console.log("[INFO] Texto do botão de candidatura:", buttonText);

      if (buttonText.includes("Candidate-se")) {
        console.log("[INFO] Detectada candidatura externa. Tentando obter URL...");
        
        // Configurar listener para nova aba antes de clicar
        const newTabPromise = new Promise(resolve => {
          browser.once('targetcreated', async target => {
            newPage = await target.page();
            resolve(newPage);
          });
        });

        // Clicar no botão
        await page.click(applyButtonSelector);
        
        // Aguardar nova aba e capturar URL
        try {
          const newPageTarget = await Promise.race([
            newTabPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout esperando nova aba')), 5000))
          ]);

          if (newPageTarget) {
            // Aguardar um pouco para garantir que a URL foi carregada
            await new Promise(r => setTimeout(r, 1000));
            const finalUrl = await newPageTarget.url();
            console.log("[INFO] URL da nova aba:", finalUrl);
            jobDetails.applyUrl = finalUrl;
          }
        } catch (error) {
          console.warn("[WARN] Erro ao capturar URL da nova aba:", error.message);
          jobDetails.applyUrl = null;
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
    // Fechar todas as páginas
    if (newPage) {
      try {
        await newPage.close();
        console.log("[INFO] Nova aba fechada com sucesso");
      } catch (error) {
        console.error("[ERROR] Erro ao fechar nova aba:", error);
      }
    }
    if (page) {
      try {
        await page.close();
        console.log("[INFO] Página principal fechada com sucesso");
      } catch (error) {
        console.error("[ERROR] Erro ao fechar página principal:", error);
      }
    }
  }
}

module.exports = getJobDetails;
