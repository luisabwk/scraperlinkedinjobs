const puppeteer = require("puppeteer");

function normalizeCompanyName(name) {
  return name.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function isValidApplyUrl(url, companyName) {
  try {
    const urlLower = url.toLowerCase();
    const normalizedCompany = normalizeCompanyName(companyName);
    
    const platforms = [
      'gupy.io',
      'kenoby.com',
      'lever.co',
      'greenhouse.io',
      'abler.com.br',
      'workday.com',
      'breezy.hr',
      'pandape.com',
      'betterplace.com.br',
      'netvagas.com.br',
      'indeed.com'
    ];

    return urlLower.includes(normalizedCompany) || platforms.some(platform => urlLower.includes(platform));
  } catch (error) {
    return false;
  }
}

async function getJobDetails(browser, jobUrl, li_at) {
  console.log(`[INFO] Accessing job details: ${jobUrl}`);
  let page = null;
  let jobDetails = {};

  try {
    page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
    );

    const cookies = [{ name: "li_at", value: li_at, domain: ".linkedin.com" }];
    await page.setCookie(...cookies);

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (resourceType === 'image' || resourceType === 'media' || resourceType === 'font') {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.goto(jobUrl, { 
      waitUntil: "networkidle0",
      timeout: 30000 
    });

    try {
      const seeMoreButtonSelector = ".jobs-description__footer-button";
      await page.waitForSelector(seeMoreButtonSelector, { timeout: 5000 });
      await page.click(seeMoreButtonSelector);
    } catch (error) {
      console.warn("[WARN] 'See more' button not found or not clickable");
    }

    jobDetails = await page.evaluate(() => {
      const title = document.querySelector(".job-details-jobs-unified-top-card__job-title")?.innerText.trim() || "";
      const company = document.querySelector(".job-details-jobs-unified-top-card__company-name")?.innerText.trim() || "";
      const locationData = document.querySelector(".job-details-jobs-unified-top-card__primary-description-container")?.innerText.trim() || "";
      const description = document.querySelector("#job-details")?.innerText.trim() || "";
      
      const formatElement = document.querySelector(".job-details-jobs-unified-top-card__job-insight")?.innerText.trim() || "";
      const modalidades = formatElement.match(/(Remoto|Híbrido|Presencial)/i);
      const format = modalidades ? modalidades[0] : "";

      const locationMatch = locationData.match(/^(.*?)(?= ·|$)/);
      const location = locationMatch ? locationMatch[0].trim() : "";

      return {
        title,
        company,
        location,
        description,
        format,
        applyUrl: null
      };
    });

    try {
      console.log("[INFO] Checking application type...");
      const applyButtonSelector = '.jobs-apply-button--top-card';
      await page.waitForSelector(applyButtonSelector, { timeout: 10000 });
      
      if (await page.$(applyButtonSelector)) {
        await Promise.race([
          page.click(applyButtonSelector),
          new Promise(resolve => setTimeout(resolve, 5000))
        ]);

        const newTarget = await browser.waitForTarget(
          target => target.url() !== page.url(),
          { timeout: 5000 }
        );

        if (newTarget) {
          const applyUrl = newTarget.url();
          if (isValidApplyUrl(applyUrl, jobDetails.company)) {
            jobDetails.applyUrl = applyUrl;
          }
        }
      }
    } catch (error) {
      console.warn("[WARN] Could not get application URL:", error.message);
    }

    return jobDetails;

  } catch (error) {
    console.error("[ERROR] Failed to get job details:", error);
    throw new Error(`Error getting job details: ${error.message}`);
  } finally {
    if (page) await page.close();
  }
}

module.exports = getJobDetails;
