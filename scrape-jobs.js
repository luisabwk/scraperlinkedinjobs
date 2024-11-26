const puppeteer = require("puppeteer");
const axios = require("axios");

async function getJobListings(page, searchTerm, location, li_at) {
  let allJobs = [];
  let currentPage = 1;

  const baseUrl = `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(
    searchTerm
  )}&location=${encodeURIComponent(location)}&geoId=106057199&f_TPR=r86400`;

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
    await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: 60000 });

    // Verificar se fomos redirecionados para uma página de login
    if (await page.$("input#session_key")) {
      throw new Error("Página de login detectada. O cookie 'li_at' pode estar inválido ou expirado.");
    }

    // Aguarda os resultados carregarem
    await page.waitForSelector(".job-card-container", { timeout: 60000 });

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
      await page.goto(pageURL, { waitUntil: "networkidle2", timeout: 60000 });

      // Captura os dados das vagas na página atual
      const jobsResult = await page.evaluate(() => {
        const jobElements = Array.from(document.querySelectorAll(".job-card-container"));

        return jobElements.map((job) => {
          const title = job.querySelector(".job-card-list__title")?.innerText.trim() || "Título não encontrado";
          const company = job.querySelector(".job-card-container__primary-description")?.innerText.trim() || "Empresa não encontrada";
          const location = job.querySelector(".job-card-container__metadata-item")?.innerText.trim() || "Localização não encontrada";
          const format = job.querySelector(".job-card-container__workplace-type")?.innerText.trim() || "Formato não encontrado";
          const cargahoraria = job.querySelector(".job-card-container__work-schedule")?.innerText.trim() || "Carga horária não encontrada";
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

      console.info(`[INFO] Número de vagas coletadas na página ${currentPage}: ${jobsResult.length}`);

      // Adiciona os resultados ao array geral
      allJobs.push(...jobsResult);
    }

    console.log(`[INFO] Total de vagas coletadas: ${allJobs.length}`);
    return allJobs;
  } catch (error) {
    console.error("[ERROR] Erro ao carregar a página inicial:", error);
    return [];
  }
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  try {
    const searchTerm = "growth marketing";
    const location = "Brasil";
    const li_at = "COLOQUE_SEU_COOKIE_AQUI"; // O valor do cookie `li_at` deve ser passado aqui

    // Usando a função getJobListings
    const jobs = await getJobListings(page, searchTerm, location, li_at);
    console.log(jobs);
  } catch (error) {
    console.error("[ERROR] Ocorreu um erro:", error);
  } finally {
    await browser.close();
  }
})();
