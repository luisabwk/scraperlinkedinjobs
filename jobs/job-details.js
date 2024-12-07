// ... início do código permanece igual até o if do Candidatar-se ...

      if (buttonText.includes("Candidatar-se")) {
        console.log("[INFO] Detectada candidatura externa. Iniciando processo de candidatura...");

        // Intercepta requisições após clicar no botão
        await page.setRequestInterception(true);
        page.on('request', (req) => {
          req.continue();
        });
        page.on('requestfinished', (req) => {
          const url = req.url();
          if (url && !url.includes('linkedin.com') && isValidApplyUrl(url, jobDetails.company)) {
            console.log("[DEBUG] URL potencial encontrada:", url);
            externalUrls.push(url);
          }
        });

        // Primeiro, verificar se o modal existe antes de tentar clicar
        const modalExists = await page.evaluate(() => {
          const modalButton = document.querySelector('.jobs-apply-button.artdeco-button.artdeco-button--icon-right.artdeco-button--3.artdeco-button--primary.ember-view');
          return modalButton && modalButton.offsetParent !== null;  // verifica se o botão está visível
        });

        try {
          if (modalExists) {
            console.log("[INFO] Modal detectado. Clicando no botão 'Continuar'...");
            await page.click('.jobs-apply-button.artdeco-button.artdeco-button--icon-right.artdeco-button--3.artdeco-button--primary.ember-view');
          } else {
            console.log("[INFO] Clicando no botão 'Candidatar-se'...");
            await page.click(applyButtonSelector);
          }

          console.log("[INFO] Botão clicado com sucesso");

          // Aguardar um curto período para capturar redirecionamentos
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
          console.warn("[WARN] Erro ao clicar no botão:", error.message);
          jobDetails.applyUrl = jobUrl;
        }

      } else if (buttonText.includes("Candidatura simplificada")) {
        console.log("[INFO] Detectada candidatura simplificada. Usando URL original.");
        jobDetails.applyUrl = jobUrl;
      } else {
        console.log("[WARN] Tipo de candidatura não reconhecido:", buttonText);
        jobDetails.applyUrl = jobUrl;
      }

// ... resto do código permanece igual ...
