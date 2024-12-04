const express = require("express");
const puppeteer = require("puppeteer");
const getJobListings = require("./jobs/scrape-jobs");
const getJobDetails = require("./jobs/job-details");

const app = express();
app.use(express.json());

// Configurações
const TIMEOUT = 180000; // 3 minutos
const BROWSER_TIMEOUT = 30000; // 30 segundos para operações do browser

// Middleware para logging de requisições
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    console.log('Body:', JSON.stringify(req.body, null, 2));
    next();
});

async function createBrowser() {
    console.log('[INFO] Iniciando nova instância do browser...');
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--disable-software-rasterizer",
            "--window-size=1920,1080",
            "--disable-web-security",
            "--disable-features=IsolateOrigins,site-per-process"
        ],
        defaultViewport: {
            width: 1920,
            height: 1080
        },
        timeout: BROWSER_TIMEOUT
    });
    console.log('[INFO] Browser iniciado com sucesso');
    return browser;
}

app.post("/scrape-jobs", async (req, res) => {
    console.log('[INFO] Iniciando scrape-jobs...');
    const { searchTerm, location, li_at, maxJobs = 50 } = req.body;

    if (!li_at || !searchTerm || !location) {
        console.log('[ERROR] Parâmetros inválidos');
        return res.status(400).send({
            error: "Parâmetros 'li_at', 'searchTerm' e 'location' são obrigatórios."
        });
    }

    let browser;
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout global da operação')), TIMEOUT)
    );

    try {
        console.log('[INFO] Criando browser...');
        browser = await createBrowser();

        const scrapePromise = getJobListings(browser, searchTerm, location, li_at, maxJobs);
        const jobs = await Promise.race([scrapePromise, timeoutPromise]);

        console.log(`[INFO] Scraping concluído. Total de vagas encontradas: ${jobs?.totalVagas || 0}`);
        res.status(200).send({
            message: "Scraping realizado com sucesso!",
            totalVagas: jobs.totalVagas,
            jobs: jobs.vagas
        });
    } catch (error) {
        console.error('[ERROR] Erro durante o scraping:', error);
        
        let statusCode = 500;
        let errorMessage = error.message;

        if (error.message.includes('Timeout')) {
            statusCode = 504;
            errorMessage = "A operação excedeu o tempo limite";
        } else if (error.message.includes('Protocol error')) {
            statusCode = 502;
            errorMessage = "Erro de comunicação com o LinkedIn";
        }

        res.status(statusCode).send({
            error: errorMessage,
            details: error.stack
        });
    } finally {
        if (browser) {
            console.log('[INFO] Fechando browser...');
            await browser.close().catch(console.error);
        }
    }
});

// Tratamento para rotas não encontradas
app.use((req, res) => {
    console.log(`[WARN] Rota não encontrada: ${req.path}`);
    res.status(404).send({
        error: "Endpoint não encontrado"
    });
});

// Gerenciamento de erros global
app.use((error, req, res, next) => {
    console.error('[ERROR] Erro global:', error);
    res.status(500).send({
        error: "Erro interno do servidor",
        details: error.message,
        stack: error.stack
    });
});

function startServer(port) {
    const server = app.listen(port, () => {
        console.log(`[${new Date().toISOString()}] Servidor rodando em http://localhost:${port}`);
    });

    server.timeout = TIMEOUT;

    server.on("error", (error) => {
        if (error.code === "EADDRINUSE") {
            console.warn(`[WARN] Porta ${port} em uso. Tentando próxima porta...`);
            startServer(port + 1);
        } else {
            console.error("[ERROR] Erro ao iniciar servidor:", error);
            process.exit(1);
        }
    });

    return server;
}

startServer(8080);

module.exports = { getJobListings, getJobDetails };
