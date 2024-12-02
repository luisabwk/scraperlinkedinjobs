// Captura os dados das vagas na página atual
const jobsResult = await page.evaluate(() => {
  const jobElements = Array.from(
    document.querySelectorAll(".job-card-container--clickable")
  );

  return jobElements.map((job) => {
    const title = job
      .querySelector(".job-card-list__title--link")
      ?.innerText.trim()
      .replace(/\n/g, " "); // Remover quebras de linha

    const company = job
      .querySelector(".artdeco-entity-lockup__subtitle")
      ?.innerText.trim();

    const locationData = job
      .querySelector(".job-card-container__metadata-wrapper")
      ?.innerText.trim();

    let location = "";
    let formato = "";

    if (locationData) {
      // Usando expressão regular para extrair a parte entre parênteses como formato
      const formatMatch = locationData.match(/\(([^)]+)\)/);
      if (formatMatch) {
        formato = formatMatch[1].trim(); // Extraímos o que está dentro dos parênteses
      }
      // Remover a parte dos parênteses e definir o restante como localização
      location = locationData.replace(/\(.*?\)/, "").trim();
    }

    const link = job.querySelector("a")?.href;

    const cargahoraria = job
      .querySelector(".job-details-jobs-unified-top-card__job-insight-view-model-secondary")
      ?.innerText.trim();

    const experiencia = job.querySelector(".job-details-jobs-unified-top-card__job-insight-view-model-secondary")?.innerText.trim();

    return {
      vaga: title || "",
      empresa: company || "",
      local: location || "",
      formato: formato || "",
      experiencia: experiencia || "",
      cargahoraria: cargahoraria || "",
      link: link || "",
    };
  });
});
