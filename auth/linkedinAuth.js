const puppeteer = require("puppeteer");

class LinkedInAuthManager {
  constructor() {
    this.cookieCache = new Map();
    this.COOKIE_MAX_AGE = 12 * 60 * 60 * 1000;
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

      // Aguarda 5 segundos após o login
      await new Promise(r => setTimeout(r, 5000));

      if (page.url().includes('/login')) {
        throw new Error('Login falhou - verifique suas credenciais');
      }

      if (page.url().includes('/checkpoint')) {
        throw new Error('Login requer verificação adicional');
      }

      const cookies = await page.cookies();
      const li_at = cookies.find(cookie => cookie.name === 'li_at');

      if (!li_at) {
        // Tenta novamente após um curto delay
        await new Promise(r => setTimeout(r, 2000));
        const retryCookies = await page.cookies();
        const retryCookie = retryCookies.find(cookie => cookie.name === 'li_at');
        
        if (!retryCookie) {
          throw new Error('Cookie não encontrado após login');
        }
        
        li_at = retryCookie;
      }

      this.cookieCache.set(username, {
        value: li_at.value,
        timestamp: Date.now()
      });
      
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
      await browser.close();
    }
  }

  // ... resto do código permanece igual
}

module.exports = LinkedInAuthManager;
