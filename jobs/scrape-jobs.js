const scrapeJobs = async (browser, searchTerm, location, li_at, maxJobs = 50) => {
  try {
    console.log("[DEBUG] Iniciando o processo de getJobListings...");
    const page = await browser.newPage();

    // Configurar o cookie 'li_at'
    await page.setCookie({ name: "li_at", value: li_at, domain: ".linkedin.com" });
    console.log("[INFO] Cookie 'li_at' configurado com sucesso.");

    // URL inicial para buscar vagas
    const searchUrl = `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(searchTerm)}&location=${encodeURIComponent(location)}&geoId=106057199&f_TPR=r86400`;
    console.log(`[INFO] Acessando a URL inicial: ${searchUrl}`);

    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 60000 });

    let jobs = [];
    let attempts = 0;

    // Navegar e capturar listagem de vagas
    while (jobs.length < maxJobs && attempts < 3) {
      try {
        console.log(`[INFO] Navegando e capturando vagas na tentativa ${attempts + 1}`);
        const newJobs = await page.evaluate(() => {
          return Array.from(document.querySelectorAll(".job-card-container")).map((job) => ({
            title: job.querySelector(".job-card-list__title")?.textContent?.trim(),
            company: job.querySelector(".job-card-container__company-name")?.textContent?.trim(),
            location: job.querySelector(".job-card-container__metadata-item")?.textContent?.trim(),
            link: job.querySelector("a.job-card-container__link")?.href,
          }));
        });

        jobs = [...jobs, ...newJobs];
        if (jobs.length >= maxJobs) break;

        // Ir para a próxima página
        const nextButton = await page.$(".artdeco-pagination__button--next");
        if (nextButton) {
          await nextButton.click();
          await page.waitForTimeout(5000); // Aguarda o carregamento da próxima página
        } else {
          console.log("[INFO] Não há mais páginas disponíveis.");
          break;
        }
      } catch (error) {
        console.warn(`[WARN] Falha na tentativa ${attempts + 1}: ${error.message}`);
        attempts++;
        if (attempts >= 3) throw new Error("Navegação falhou após 3 tentativas.");
      }
    }

    console.log(`[INFO] Captura de vagas concluída. Total de vagas: ${jobs.length}`);
    await page.close();
    return jobs.slice(0, maxJobs);
  } catch (error) {
    console.error("[ERROR] Erro ao realizar scraping:", error);
    throw new Error(`Erro durante o scraping: ${error.message}`);
  }
};

module.exports = scrapeJobs;
