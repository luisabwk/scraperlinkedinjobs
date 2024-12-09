const puppeteer = require("puppeteer");

class LinkedInAuthManager {
  constructor() {
    this.cookieCache = new Map();
    this.COOKIE_MAX_AGE = 12 * 60 * 60 * 1000;
  }

  async getCookie(username, password) {
    const cached = this.cookieCache.get(username);
    if (cached && Date.now() - cached.timestamp < this.COOKIE_MAX_AGE) {
      return cached.value;
    }
    return this.refreshCookie(username, password);
  }

  async refreshCookie(username, password, retryCount = 0) {
    const maxRetries = 3;
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
      ]
    });

    const page = await browser.newPage();

    try {
      console.log("[AUTH] Iniciando login no LinkedIn");
      await page.goto('https://www.linkedin.com/login', { 
        waitUntil: 'networkidle0',
        timeout: 60000 
      });
      
      await page.type('#username', username);
      await page.type('#password', password);
      
      await Promise.all([
        page.waitForNavigation({ 
          waitUntil: 'networkidle0',
          timeout: 60000 
        }),
        page.click('[type="submit"]')
      ]);

      await new Promise(r => setTimeout(r, 5000));

      let li_at = null;
      const cookies = await page.cookies();
      li_at = cookies.find(cookie => cookie.name === 'li_at');

      if (!li_at) {
        await new Promise(r => setTimeout(r, 2000));
        const retryCookies = await page.cookies();
        li_at = retryCookies.find(cookie => cookie.name === 'li_at');
        
        if (!li_at) {
          throw new Error('Cookie não encontrado após login');
        }
      }

      this.cookieCache.set(username, {
        value: li_at.value,
        timestamp: Date.now()
      });
      
      console.log("[AUTH] Login realizado com sucesso");
      return li_at.value;

    } catch (error) {
      console.error(`[AUTH] Erro no login: ${error.message}`);
      
      if (retryCount < maxRetries) {
        const delay = Math.pow(2, retryCount) * 1000;
        console.log(`[AUTH] Tentando novamente em ${delay/1000} segundos...`);
        await new Promise(r => setTimeout(r, delay));
        return this.refreshCookie(username, password, retryCount + 1);
      }
      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  async validateCookie(browser, li_at) {
    if (!browser || !li_at) return false;

    const page = await browser.newPage();
    try {
      await page.setCookie({
        name: 'li_at',
        value: li_at,
        domain: '.linkedin.com'
      });

      const response = await page.goto('https://www.linkedin.com/feed/');
      return !response.url().includes('linkedin.com/login');
    } catch (error) {
      console.error("[AUTH] Erro ao validar cookie:", error.message);
      return false;
    } finally {
      if (page) {
        await page.close();
      }
    }
  }
}

module.exports = LinkedInAuthManager;
