const express = require("express");
const puppeteer = require("puppeteer");
const axios = require("axios");

const app = express();
app.use(express.json());

// Função para obter as vagas
async function getJobListings(li_at, searchTerm, location) {
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
        "--disable-software-rasterizer",
      ],
    });

    const page = await browser.newPage();
    console.log("[INFO] Navegador iniciado com sucesso.");

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
      // Acessa a URL inicial para obter informações gerais, como total de páginas
      console.log("[INFO] Navegando até a página inicial de busca...");
      await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
      console.log("[INFO] Página de busca acessada com sucesso.");

      // Extrair o número total de páginas de resultados
      let totalPages = 1;
      try {
        totalPages = await page.$eval(
          ".artdeco-pagination__pages li:last-child button",
          (el) => parseInt(el.innerText.trim())
        );
        console.info(`[INFO] Número total de páginas: ${totalPages}`);
      } catch (error) {
        console.warn("[WARN] Não foi possível obter o número total de páginas, continuando com uma página.");
      }

      // Iterar sobre cada página de 1 até o total de páginas
      for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
        console.info(`[INFO] Scraping página ${currentPage} de ${totalPages}...`);

        // Navegar para a página específica
        const pageURL = `${baseUrl}&start=${(currentPage - 1) * 25}`;
        try {
          await page.goto(pageURL, { waitUntil: "domcontentloaded", timeout: 60000 });
          console.info(`[INFO] Página ${currentPage} acessada com sucesso.`);
        } catch (error) {
          console.error(`[ERROR] Erro ao acessar a página ${currentPage}:`, error);
          continue; // Pula esta página e tenta a próxima
        }

        // Captura os dados das vagas na página atual
        try {
          const jobsResult = await page.evaluate(() => {
            const jobElements = Array.from(
              document.querySelectorAll(".jobs-search-results__list-item")
            );

            return jobElements.map((job) => {
              const title = job
                .querySelector(".job-card-list__title")
                ?.innerText.trim()
                .replace(/\n/g, ' '); // Remover quebras de linha

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
          console.info(`[INFO] Número de vagas coletadas na página ${currentPage}: ${jobsResult.length}`);

          // Adiciona os resultados ao array geral, removendo duplicados com base no ID do link
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

  return allJobs;
}

// Endpoint da API para scraping
app.post("/scrape-jobs", async (req, res) => {
  const { li_at, searchTerm, location, webhook } = req.body;

  if (!li_at || !searchTerm || !location) {
    return res.status(400).send({ error: "Parâmetros 'li_at', 'searchTerm' e 'location' são obrigatórios." });
  }

  try {
    const jobs = await getJobListings(li_at, searchTerm, location);

    // Enviar o resultado ao webhook, caso tenha sido fornecido
    if (webhook) {
      console.log("[INFO] Enviando dados para o webhook...");
      await axios
        .post(webhook, { jobs })
        .then((response) => {
          console.log("[SUCCESS] Webhook acionado com sucesso:", response.status);
        })
        .catch((error) => {
          console.error(
            "[ERROR] Erro ao acionar o webhook:",
            error.response?.status,
            error.response?.data
          );
        });
    }

    res.status(200).send({ message: "Scraping realizado com sucesso!", jobs });
  } catch (error) {
    console.error("[ERROR] Falha durante a requisição:", error.message);
    res.status(500).send({ error: error.message });
  }
});

// Inicializar o servidor na porta 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
