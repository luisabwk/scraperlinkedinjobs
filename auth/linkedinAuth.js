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
      
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');

      await page.goto('https://www.linkedin.com/login', { 
        waitUntil: 'networkidle0',
        timeout: 60000 
      });

      await page.waitForSelector('#username', { timeout: 10000 });
      await page.waitForSelector('#password', { timeout: 10000 });
      
      await page.type('#username', username, { delay: 100 });
      await page.type('#password', password, { delay: 100 });
      
      await Promise.all([
        page.waitForNavigation({ 
          waitUntil: 'networkidle0',
          timeout: 60000 
        }),
        page.click('[type="submit"]')
      ]);

      // Aguardar mais tempo após o login
      await new Promise(r => setTimeout(r, 10000));

      // Verificar se estamos realmente logados
      const isLoggedIn = await page.evaluate(() => {
        const feed = document.querySelector('#global-nav');
        const loginForm = document.querySelector('.login__form');
        const verificationScreen = document.querySelector('#verification-code-input');
        
        if (verificationScreen) {
          return 'verification';
        }
        return feed ? 'logged_in' : (loginForm ? 'login_page' : 'unknown');
      });

      if (isLoggedIn === 'login_page') {
        throw new Error('Login falhou - credenciais inválidas');
      }

      let li_at = null;
      for (let i = 0; i < 3; i++) {
        const cookies = await page.cookies();
        li_at = cookies.find(cookie => cookie.name === 'li_at');
        if (li_at) break;
        await new Promise(r => setTimeout(r, 2000));
      }

      if (!li_at) {
        throw new Error('Cookie não encontrado após login');
      }

      const isValid = await this.validateCookie(browser, li_at.value);
      if (!isValid) {
        throw new Error('Cookie obtido é inválido');
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
      if (page) await page.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
    }
  }

  async validateCookie(browser, li_at) {
    if (!browser || !li_at) return false;

    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');
      
      await page.setCookie({
        name: 'li_at',
        value: li_at,
        domain: '.linkedin.com'
      });

      await page.goto('https://www.linkedin.com/feed/', {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      const isLoggedIn = await page.evaluate(() => {
        return !!document.querySelector('#global-nav');
      });

      return isLoggedIn;
    } catch (error) {
      console.error("[AUTH] Erro ao validar cookie:", error.message);
      return false;
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }
}

module.exports = LinkedInAuthManager;
