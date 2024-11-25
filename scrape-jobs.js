const puppeteer = require("puppeteer");
const axios = require("axios");

async function getJobListings(page, searchTerm, location, li_at) {
  let allJobs = [];
  let currentPage = 1;

  const baseUrl = `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(
    searchTerm
  )}&location=${encodeURIComponent(
    location
  )}&geoId=106057199&f_TPR=r86400`;

  console.log(`[INFO] Acessando a URL inicial: ${baseUrl}`);

  // Define o cookie `li_at` com o valor fornecido
  await page.setCookie({
    name: "li_at",
    value: li_at,
    domain: ".linkedin.com",
  });

  // Define o User-Agent para simular um navegador comum
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36"
  );

  try {
    // Acessa a URL inicial para obter informações gerais, como total de páginas
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Verificar se fomos redirecionados para uma página de login
    if (await page.$("input#session_key")) {
      throw new Error("Página de login detectada. O cookie 'li_at' pode estar inválido ou expirado.");
    }

    // Extrair o número total de páginas de resultados
    let totalPages = 1;
    try {
      totalPages = await page.$eval(
        ".artdeco-pagination__pages li:last-child button",
        (el) => parseInt(el.innerText.trim())
      );
    } catch (error) {
      console.warn("[WARN] Não foi possível obter o número total de páginas, continuando com uma página.");
    }

    console.info(`[INFO] Número total de páginas: ${totalPages}`);

    // Iterar sobre cada página de 1 até o total de páginas
    for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
      console.info(`[INFO] Scraping página ${currentPage} de ${totalPages}...`);

      // Navegar para a página específica
      const pageURL = `${baseUrl}&start=${(currentPage - 1) * 25}`;
      await page.goto(pageURL, { waitUntil: "domcontentloaded", timeout: 60000 });

      // Captura os dados das vagas na página atual
      const jobsResult = await page.evaluate(() => {
        const jobElements = Array.from(
          document.querySelectorAll(".jobs-search-results__list-item")
        );

        // Se não encontrar elementos de vagas, logar aviso
        if (jobElements.length === 0) {
          console.warn("[WARN] Nenhum elemento de vaga encontrado na página atual.");
        }

        return jobElements.map((job) => {
          const title = job
            .querySelector(".job-card-list__title")
            ?.innerText.trim()
            .replace(/\n/g, ' ') || "Título não encontrado";

          const company = job
            .querySelector(".job-card-container__primary-description")
            ?.innerText.trim() || "Empresa não encontrada";

          const location = job
            .querySelector(".job-card-container__metadata-item")
            ?.innerText.trim() || "Localização não encontrada";

          const format = job
            .querySelector(".job-card-container__workplace-type")
            ?.innerText.trim() || "Formato não encontrado";

          const cargahoraria = job
            .querySelector(".job-card-container__work-schedule")
            ?.innerText.trim() || "Carga horária não encontrada";

          const link = job.querySelector("a")?.href || "Link não encontrado";

          return {
            vaga: title,
            empresa: company,
            local: location,
            formato: format,
            cargahoraria: cargahoraria,
            link: link,
          };
        });
      });

      // Logando número de vagas coletadas na página atual
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

      console.log(`[INFO] Total de vagas coletadas até agora: ${allJobs.length}`);
    }

    console.log(`[INFO] Total de vagas coletadas: ${allJobs.length}`);

    // Enviar todos os resultados ao webhook em um único pacote
    console.log("[INFO] Enviando dados para o webhook...");
    await axios
      .post("https://hook.us1.make.com/agmroyiby7p6womm81ud868tfntxb03c", { jobs: allJobs })
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
  } catch (error) {
    console.error("[ERROR] Erro ao carregar a página inicial:", error);
  }
}

module.exports = async (req, res) => {
  const { li_at, searchTerm, location, webhook } = req.body;

  if (!li_at || !searchTerm || !location) {
    return res.status(400).send({ error: "Parâmetros 'li_at', 'searchTerm' e 'location' são obrigatórios." });
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  try {
    // Usando a função getJobListings
    const jobs = await getJobListings(page, searchTerm, location, li_at);
    res.status(200).send({ jobs });
  } catch (error) {
    console.error("[ERROR] Ocorreu um erro:", error);
    res.status(500).send({ error: error.message });
  } finally {
    await browser.close();
  }
};
