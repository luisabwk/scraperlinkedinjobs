const puppeteer = require("puppeteer");
require('dotenv').config();

async function getJobDetails(browser, jobUrl, li_at) {
  console.log(`[INFO] Accessing job details: ${jobUrl}`);
  let page = null;
  let jobDetails = {};

  try {
    page = await browser.newPage();
    
    // Configurar proxy rotativo do IPRoyal
    const proxyUsername = process.env.PROXY_USERNAME;
    const proxyPassword = process.env.PROXY_PASSWORD;
    
    if (proxyUsername && proxyPassword) {
      console.log("[INFO] Configurando proxy rotativo do IPRoyal...");
      await page.authenticate({
        username: proxyUsername,
        password: proxyPassword
      });
    } else {
      console.warn("[WARN] Credenciais de proxy não encontradas nas variáveis de ambiente.");
    }
    
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
    );

    const cookies = [{ name: "li_at", value: li_at, domain: ".linkedin.com" }];
    await page.setCookie(...cookies);

    // Intercept window.open
    await page.evaluateOnNewDocument(() => {
      const originalOpen = window.open;
      window.open = function (...args) {
        window.__NEW_TAB_URL__ = args[0];
        return originalOpen.apply(window, args);
      };
    });

    await page.goto(jobUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    console.log("[INFO] Job page loaded successfully.");

    const seeMoreButtonSelector = ".jobs-description__footer-button";
    const applyButtonSelector = ".jobs-apply-button--top-card";

    // Expand full job description
    try {
      await page.waitForSelector(seeMoreButtonSelector, { timeout: 5000 });
      await page.click(seeMoreButtonSelector);
      console.log("[INFO] 'See more' button clicked.");
    } catch {
      console.warn("[WARN] 'See more' button not found or clickable.");
    }

    // Extract main job details
    jobDetails = await page.evaluate(() => {
      const title = document.querySelector(".job-details-jobs-unified-top-card__job-title")?.innerText.trim() || "";
      const company = document.querySelector(".job-details-jobs-unified-top-card__company-name")?.innerText.trim() || "";
      const locationData = document.querySelector(".job-details-jobs-unified-top-card__primary-description-container")?.innerText.trim() || "";
      const description = document.querySelector("#job-details")?.innerText.trim() || "";

      return {
        title,
        company,
        location: locationData.split(" ·")[0].trim() || "",
        description,
        applyUrl: null
      };
    });

    console.log("[INFO] Checking application URL...");

    // Handle the apply button
    try {
      const applyButton = await page.$(applyButtonSelector);
      if (applyButton) {
        const buttonText = await page.evaluate(button => button.textContent.trim(), applyButton);

        if (buttonText.includes("Candidatura simplificada")) {
          console.log("[INFO] 'Candidatura simplificada' detected. Using jobUrl as applyUrl.");
          jobDetails.applyUrl = jobUrl;
        } else if (buttonText.includes("Candidatar-se")) {
          console.log("[INFO] 'Candidatar-se' detected. Clicking apply button...");
          await applyButton.click();

          // Wait for potential redirection or new tab
          await new Promise(resolve => setTimeout(resolve, 3000));

          const possibleNewTabUrl = await page.evaluate(() => window.__NEW_TAB_URL__);
          if (possibleNewTabUrl) {
            jobDetails.applyUrl = possibleNewTabUrl;
            console.log("[INFO] Application URL detected via window.open:", possibleNewTabUrl);
          } else {
            console.log("[INFO] No valid URL detected via window.open. Checking new tab...");
            const newPagePromise = new Promise(resolve => browser.once('targetcreated', target => resolve(target.page())));
            const newPage = await newPagePromise;

            if (newPage) {
              const applyUrl = newPage.url();
              jobDetails.applyUrl = applyUrl;
              console.log("[INFO] Application URL detected in new tab:", applyUrl);
              await newPage.close();
            } else {
              console.log("[WARN] No valid application URL detected. Using jobUrl as fallback.");
              jobDetails.applyUrl = jobUrl;
            }
          }
        } else {
          console.log("[INFO] External application detected. Using jobUrl as fallback.");
          jobDetails.applyUrl = jobUrl;
        }
      } else {
        console.warn("[WARN] Apply button not found.");
        jobDetails.applyUrl = jobUrl;
      }
    } catch (error) {
      console.error("[ERROR] Error while processing application URL:", error.message);
      jobDetails.applyUrl = jobUrl;
    }

    return jobDetails;
  } catch (error) {
    console.error("[ERROR] Failed to get job details:", error.message);
    throw new Error(`Error getting job details: ${error.message}`);
  } finally {
    if (page) {
      await page.close();
      console.log("[INFO] Page closed successfully.");
    }
  }
}

module.exports = getJobDetails;