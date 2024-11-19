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
        "--single-process", // Evita multiprocessamento, útil em ambientes limitados
        "--no-zygote",      // Desativa processos zygote, reduzindo o consumo de recursos
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
          totalPages = 2; // Se houver um botão "Próximo", pelo menos há mais de uma página.
          console.info("[INFO] Número de páginas ajustado para pelo menos 2, com base no botão de navegação.");
        } else {
          console.warn("[WARN] Não foi encontrado o botão de navegação 'Próximo', continuando com uma página.");
        }
      }

      // Iterar sobre cada página de 1 até o total de páginas
      for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
        console.info(`[INFO] Scraping página ${currentPage} de ${totalPages}...`);

        // Navegar para a página específica com retries
        const pageURL = `${baseUrl}&start=${(currentPage - 1) * 25}`;
        try {
          await navigateWithRetries(pageURL);
        } catch (error) {
          console.error(`[ERROR] Erro ao acessar a página ${currentPage} após múltiplas tentativas:`, error);
          continue; // Pula esta página e tenta a próxima
        }

        // Captura os dados das vagas na página atual
        try {
          const jobsResult = await page.evaluate(() => {
            const jobElements = Array.from(
              document.querySelectorAll(".job-card-container")
            );

            return jobElements.map((job) => {
              const title = job
                .querySelector(".t-24")
                ?.innerText.trim()
                .replace(/\n/g, ' '); // Remover quebras de linha

              const company = job
                .querySelector(".job-card-container__company-name")
                ?.innerText.trim();

              const location = job
                .querySelector("[class*='tvm__text--low-emphasis']")
                ?.innerText.trim();

              const linkElement = job.querySelector("a[data-control-name='job_card_container']");
              const link = linkElement ? linkElement.href : "";

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

          // Verificar se já coletamos o número máximo de vagas solicitado
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

  return allJobs.slice(0, maxJobs); // Retorna apenas o número máximo de vagas solicitado
}

// Função para obter detalhes de uma vaga específica
async function getJobDetails(li_at, jobLink) {
  let browser;
  let jobDetails = {};

  console.log(`[INFO] Iniciando o navegador do Puppeteer para detalhar a vaga: ${jobLink}`);

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
    console.log("[INFO] Navegador iniciado com sucesso para detalhes da vaga.");

    // Define o cookie `li_at` com o valor fornecido
    await page.setCookie({
      name: "li_at",
      value: li_at,
      domain: ".linkedin.com",
    });
    console.log("[INFO] Cookie 'li_at' configurado com sucesso para detalhes da vaga.");

    // Define o User-Agent
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36"
    );

    // Navega até a página da vaga
    await page.goto(jobLink, { waitUntil: "domcontentloaded", timeout: 90000 });

    // Extrai os detalhes da vaga
    jobDetails = await page.evaluate(() => {
      const title = document.querySelector(".t-24")?.innerText.trim() || "";
      const company = document.querySelector(".job-details-jobs-unified-top-card__company-name")?.innerText.trim() || "";
      const location = document.querySelector(".job-details-jobs-unified-top-card__primary-description-container")?.innerText.trim() || "";
      const jobType = document.querySelector(".job-details-jobs-unified-top-card__job-insight.job-details-jobs-unified-top-card__job-insight--highlight")?.innerText.trim() || "";
      const jobDescription = document.querySelector(".jobs-description__container.jobs-description__container--condensed")?.innerText.trim() ||
                            document.querySelector("#job-details")?.innerText.trim() || "";
      const applyUrl = document.querySelector(".jobs-apply-button.artdeco-button.artdeco-button--3.artdeco-button--primary.ember-view")?.href || "";

      return {
        vaga: title,
        empresa: company,
        local: location,
        tipo: jobType,
        descricao: jobDescription,
        url_candidatura: applyUrl
      };
    });
    console.log(`[INFO] Detalhes da vaga obtidos com sucesso: ${jobLink}`);
  } catch (error) {
    console.error(`[ERROR] Erro ao obter detalhes da vaga ${jobLink}:`, error);
    throw new Error(`Erro ao obter detalhes da vaga: ${jobLink}`);
  } finally {
    if (browser) {
      console.log("[INFO] Fechando o navegador do Puppeteer após obter detalhes da vaga...");
      await browser.close();
    }
  }

  return jobDetails;
}

// Endpoint da API para scraping
app.post("/scrape-jobs", async (req, res) => {
  const { li_at, searchTerm, location, webhook, maxJobs } = req.body;

  if (!li_at || !searchTerm || !location) {
    return res.status(400).send({ error: "Parâmetros 'li_at', 'searchTerm' e 'location' são obrigatórios." });
  }

  const maxJobsCount = maxJobs || 50; // Define um limite padrão de 50 vagas, caso não seja especificado

  try {
    const jobs = await getJobListings(li_at, searchTerm, location, maxJobsCount);

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

// Endpoint da API para obter detalhes de uma vaga específica
app.post("/jobdetails", async (req, res) => {
  const { li_at, jobLink } = req.body;

  if (!li_at || !jobLink) {
    return res.status(400).send({ error: "Parâmetros 'li_at' e 'jobLink' são obrigatórios." });
  }

  try {
    const jobDetails = await getJobDetails(li_at, jobLink);
    res.status(200).send({ message: "Detalhes da vaga obtidos com sucesso!", jobDetails });
  } catch (error) {
    console.error("[ERROR] Falha ao obter detalhes da vaga:", error.message);
    res.status(500).send({ error: error.message });
  }
});

// Inicializar o servidor na porta 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
