const scrapeJobDetails = async (browser, jobUrl, li_at) => {
  try {
    console.log(`[INFO] Accessing job details: ${jobUrl}`);
    const page = await browser.newPage();

    // Configurar o cookie 'li_at'
    await page.setCookie({ name: "li_at", value: li_at, domain: ".linkedin.com" });

    // Acessar a página de detalhes da vaga
    await page.goto(jobUrl, { waitUntil: "networkidle2", timeout: 60000 });

    // Capturar detalhes da vaga
    const jobDetails = await page.evaluate(() => {
      const jobTitle = document.querySelector(".topcard__title")?.textContent?.trim();
      const companyName = document.querySelector(".topcard__org-name-link")?.textContent?.trim();
      const jobLocation = document.querySelector(".topcard__flavor")?.textContent?.trim();
      const description = document.querySelector(".description__text")?.textContent?.trim();

      return {
        title: jobTitle,
        company: companyName,
        location: jobLocation,
        description,
      };
    });

    console.log("[INFO] Job details captured successfully.");
    await page.close();
    return jobDetails;
  } catch (error) {
    console.error("[ERROR] Failed to get job details:", error.message);
    throw new Error(`Error getting job details: ${error.message}`);
  }
};

module.exports = scrapeJobDetails;
