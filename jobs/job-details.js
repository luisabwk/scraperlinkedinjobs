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

async function waitForNetworkIdle(page, timeout = 10000, maxInflightRequests = 0) {
  try {
    await page.waitForNetworkIdle({ 
      idleTime: 500, 
      timeout: timeout,
      maxInflightRequests: maxInflightRequests 
    });
  } catch (error) {
    console.warn('[WARN] Network idle timeout reached, continuing anyway');
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
      if (resourceType === 'image' || resourceType === 'media' || resourceType === 'font' || resourceType === 'stylesheet') {
        req.abort();
      } else {
        req.continue();
      }
    });

    let maxRetries = 3;
    let currentRetry = 0;
    let success = false;

    while (currentRetry < maxRetries && !success) {
      try {
        console.log(`[INFO] Navigation attempt ${currentRetry + 1} of ${maxRetries}`);
        
        // Set a shorter timeout for individual navigation attempts
        const navigationTimeout = 60000;
        
        await Promise.race([
          page.goto(jobUrl, { 
            waitUntil: "domcontentloaded",
            timeout: navigationTimeout
          }),
          new Promise((resolve, reject) => {
            setTimeout(() => {
              reject(new Error(`Individual navigation timeout of ${navigationTimeout}ms exceeded`));
            }, navigationTimeout);
          })
        ]);

        // Wait for critical selectors with a shorter timeout
        await Promise.race([
          page.waitForSelector(".job-details-jobs-unified-top-card__job-title", { timeout: 30000 }),
          new Promise(resolve => setTimeout(resolve, 30000))
        ]);

        // Check if we're actually on the job details page
        const currentUrl = page.url();
        if (!currentUrl.includes('/jobs/view')) {
          throw new Error('Not on job details page after navigation');
        }

        await waitForNetworkIdle(page, 10000);
        success = true;
        console.log('[INFO] Navigation successful');
      } catch (error) {
        currentRetry++;
        console.warn(`[WARN] Navigation attempt ${currentRetry} failed:`, error.message);
        
        if (currentRetry === maxRetries) {
          throw new Error(`All navigation attempts failed: ${error.message}`);
        }
        
        // Clear memory and wait before retry
        await page.evaluate(() => window.stop());
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    try {
      const seeMoreButtonSelector = ".jobs-description__footer-button";
      await Promise.race([
        page.waitForSelector(seeMoreButtonSelector, { timeout: 10000 }),
        new Promise(resolve => setTimeout(resolve, 10000))
      ]);
      await page.click(seeMoreButtonSelector).catch(() => {
        console.warn("[WARN] 'See more' button not found or not clickable");
      });
    } catch (error) {
      console.warn("[WARN] Error handling 'See more' button:", error.message);
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
      await page.waitForSelector(applyButtonSelector, { timeout: 20000 });
      
      if (await page.$(applyButtonSelector)) {
        await Promise.race([
          page.click(applyButtonSelector),
          new Promise(resolve => setTimeout(resolve, 5000))
        ]);

        const newTarget = await browser.waitForTarget(
          target => target.url() !== page.url(),
          { timeout: 20000 }
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
    if (page) {
      try {
        await page.close();
        console.log("[INFO] Page closed successfully");
      } catch (closeError) {
        console.error("[ERROR] Error closing page:", closeError);
      }
    }
  }
}

module.exports = getJobDetails;
