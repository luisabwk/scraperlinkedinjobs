const express = require("express");
const puppeteer = require("puppeteer");
const axios = require("axios");

const app = express();
app.use(express.json());

// Função para obter as vagas
async function getJobListings(li_at, searchTerm, location, maxJobs) {
  let allJobs = [];
  let currentPage = 1;

  console.log("[INFO] Iniciando o navegador do Puppeteer...");

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-extensions",
        "--disable-gpu",
        "--single-process",
        "--no-zygote",
      ],
    });

    const page = await browser.newPage();
    console.log("[INFO] Navegador iniciado com sucesso.");

    // Aumentar os tempos de timeout para reduzir o número de falhas devido ao tempo limite
    await page.setDefaultNavigationTimeout(180000); // 3 minutos
    await page.setDefaultTimeout(180000); // 3 minutos

    const baseUrl = `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(
      searchTerm
    )}&location=${encodeURIComponent(
      location
    )}&geoId=106057199&f_TPR=r86400`;

    console.log(`[INFO] Acessando a URL inicial: ${baseUrl}`);

    // Define o cookie `li_at` com o valor fornecido
    try {
      await page.setCookie({
        name: "li_at",
        value: li_at,
        domain: ".linkedin.com",
      });
      console.log("[INFO] Cookie 'li_at' configurado com sucesso.");
    } catch (error) {
      console.error("[ERROR] Falha ao definir o cookie 'li_at':", error);
      throw new Error("Erro ao definir o cookie 'li_at'.");
    }

    // Define o User-Agent para simular um navegador comum
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36"
    );

    try {
      // Função para tentar navegar até uma página com retries
      async function navigateWithRetries(url, retries = 5) {
        for (let i = 0; i < retries; i++) {
          try {
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
            console.info(`[INFO] Página acessada com sucesso: ${url}`);
            return;
          } catch (error) {
            console.error(`[ERROR] Erro ao acessar a página, tentativa ${i + 1} de ${retries}:`, error);
            if (i === retries - 1) {
              throw error;
            }
          }
        }
      }

      // Acessa a URL inicial para obter informações gerais, como total de páginas
      console.log("[INFO] Navegando até a página inicial de busca...");
      await navigateWithRetries(baseUrl);

      // Verificar se fomos redirecionados para uma página de login
      if (await page.$("input#session_key")) {
        const htmlContent = await page.content();
        console.error("[ERROR] Página de login detectada. O cookie 'li_at' pode estar inválido ou expirado.");
        console.log("[DEBUG] HTML da página de login:", htmlContent);
        throw new Error("Página de login detectada. O cookie 'li_at' pode estar inválido ou expirado.");
      }
      console.log("[INFO] Página de busca acessada com sucesso.");

      // Tentativa de extrair o número total de páginas
      let totalPages = 1;
      try {
        await page.waitForSelector(".artdeco-pagination__pages", { timeout: 20000 });
        totalPages = await page.$eval(
          ".artdeco-pagination__pages li:last-child button",
          (el) => parseInt(el.innerText.trim())
        );
        console.info(`[INFO] Número total de páginas: ${totalPages}`);
      } catch (error) {
        console.warn("[WARN] Não foi possível obter o número total de páginas, tentando método alternativo...");

        // Método alternativo: verificar se há mais de uma página pela presença do botão "Próximo"
        const hasNextPage = await page.$(".artdeco-pagination__button--next");
        if (hasNextPage) {
          totalPages = 2;
          console.info("[INFO] Número de páginas ajustado para pelo menos 2, com base no botão de navegação.");
        } else {
          console.warn("[WARN] Não foi encontrado o botão de navegação 'Próximo', continuando com uma página.");
        }
      }

      // Iterar sobre cada página de 1 até o total de páginas
      for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
        console.info(`[INFO] Scraping página ${currentPage} de ${totalPages}...`);

        const pageURL = `${baseUrl}&start=${(currentPage - 1) * 25}`;
        try {
          await navigateWithRetries(pageURL);
        } catch (error) {
          console.error(`[ERROR] Erro ao acessar a página ${currentPage} após múltiplas tentativas:`, error);
          continue; 
        }

        // Captura os dados das vagas na página atual
        try {
          const jobsResult = await page.evaluate(() => {
            const jobElements = Array.from(
              document.querySelectorAll(".jobs-search-results__list-item")
            );

            if (jobElements.length === 0) {
              console.warn("[WARN] Nenhum elemento de vaga encontrado. Verifique o seletor.");
            }

            return jobElements.map((job) => {
              const title = job
                .querySelector(".job-card-list__title")
                ?.innerText.trim()
                .replace(/\n/g, ' '); 

              const company = job
                .querySelector(".job-card-container__primary-description")
                ?.innerText.trim();

              const location = job
                .querySelector(".job-card-container__metadata-item")
                ?.innerText.trim();

              const link = job.querySelector("a")?.href;

              return {
                vaga: title || "",
                empresa: company || "",
                local: location || "",
                link: link || "",
              };
            });
          });

          if (jobsResult.length === 0) {
            const htmlContent = await page.content();
            console.error("[ERROR] Nenhuma vaga encontrada nesta página. Capturando HTML para debug.");
            console.log("[DEBUG] HTML da página:", htmlContent);
          }

          console.info(`[INFO] Número de vagas coletadas na página ${currentPage}: ${jobsResult.length}`);

          jobsResult.forEach((job) => {
            if (job.link) {
              const jobIdMatch = job.link.match(/(\d+)/);
              if (jobIdMatch) {
                const jobId = jobIdMatch[0];
                if (!allJobs.some((j) => j.link.includes(jobId))) {
                  allJobs.push(job);
                }
              }
            }
          });

          if (allJobs.length >= maxJobs) {
            console.log(`[INFO] Número máximo de vagas (${maxJobs}) alcançado.`);
            break;
          }
        } catch (error) {
          console.error(`[ERROR] Erro ao coletar dados da página ${currentPage}:`, error);
        }

        console.log(`[INFO] Total de vagas coletadas até agora: ${allJobs.length}`);
      }

      console.log(`[INFO] Total de vagas coletadas: ${allJobs.length}`);
    } catch (error) {
      console.error("[ERROR] Erro durante o processo de scraping:", error);
      throw new Error("Erro durante o processo de scraping.");
    }
  } catch (error) {
    console.error("[ERROR] Erro ao iniciar o Puppeteer ou configurar o navegador:", error);
    throw new Error("Erro ao iniciar o Puppeteer ou configurar o navegador.");
  } finally {
    if (browser) {
      console.log("[INFO] Fechando o navegador do Puppeteer...");
      await browser.close();
    }
  }

  return allJobs.slice(0, maxJobs);
}

module.exports = getJobListings;
