const express = require("express");
const puppeteer = require("puppeteer");
const getJobListings = require("./jobs/scrape-jobs");
const getJobDetails = require("./jobs/job-details");

const app = express();
app.use(express.json());

// Timeout para requisições longas (2 minutos)
const TIMEOUT = 120000;

// Pool de browsers para reutilização
let browserPool = [];
const MAX_POOL_SIZE = 3;

// Função para obter um browser do pool ou criar um novo
async function getBrowser() {
    if (browserPool.length > 0) {
        return browserPool.pop();
    }
    
    return await puppeteer.launch({
        headless: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--disable-software-rasterizer",
            "--max-old-space-size=4096" // Aumenta o limite de memória
        ],
    });
}

// Função para retornar um browser ao pool
function returnBrowser(browser) {
    if (browserPool.length < MAX_POOL_SIZE && browser) {
        browserPool.push(browser);
    } else if (browser) {
        browser.close().catch(console.error);
    }
}

// Middleware para timeout
const timeoutMiddleware = (req, res, next) => {
    res.setTimeout(TIMEOUT, () => {
        res.status(408).send({
            error: "Timeout da requisição atingido"
        });
    });
    next();
};

app.use(timeoutMiddleware);

// Endpoint para obter a lista de vagas
app.post("/scrape-jobs", async (req, res) => {
    const { searchTerm, location, li_at, maxJobs = 50 } = req.body;
    
    if (!li_at || !searchTerm || !location) {
        return res.status(400).send({
            error: "Parâmetros 'li_at', 'searchTerm' e 'location' são obrigatórios."
        });
    }

    let browser;
    try {
        browser = await getBrowser();
        const jobs = await getJobListings(browser, searchTerm, location, li_at, maxJobs);
        
        res.status(200).send({
            message: "Scraping realizado com sucesso!",
            totalVagas: jobs.totalVagas,
            jobs: jobs.vagas
        });
    } catch (error) {
        console.error("[ERROR] Scrape-jobs:", error);
        
        // Tratamento específico de erros
        if (error.message.includes("Navigation timeout")) {
            return res.status(504).send({
                error: "Tempo limite excedido ao carregar a página"
            });
        }
        
        res.status(500).send({
            error: "Erro interno ao processar a requisição",
            details: error.message
        });
    } finally {
        if (browser) {
            returnBrowser(browser);
        }
    }
});

// Endpoint para obter os detalhes de uma vaga individual
app.post("/job-details", async (req, res) => {
    const { jobUrl, li_at } = req.body;
    
    if (!jobUrl || !li_at) {
        return res.status(400).send({
            error: "Parâmetros 'jobUrl' e 'li_at' são obrigatórios."
        });
    }

    let browser;
    try {
        browser = await getBrowser();
        const jobDetails = await getJobDetails(browser, jobUrl, li_at);
        
        res.status(200).send({
            message: "Detalhes da vaga obtidos com sucesso!",
            jobDetails
        });
    } catch (error) {
        console.error("[ERROR] Job-details:", error);
        
        if (error.message.includes("Navigation timeout")) {
            return res.status(504).send({
                error: "Tempo limite excedido ao carregar a página"
            });
        }
        
        res.status(500).send({
            error: "Erro interno ao processar a requisição",
            details: error.message
        });
    } finally {
        if (browser) {
            returnBrowser(browser);
        }
    }
});

// Tratamento para rotas não encontradas
app.use((req, res) => {
    res.status(404).send({
        error: "Endpoint não encontrado"
    });
});

// Gerenciamento de erros global
app.use((error, req, res, next) => {
    console.error("[ERROR] Global:", error);
    res.status(500).send({
        error: "Erro interno do servidor",
        details: error.message
    });
});

// Inicializar o servidor com retry e gerenciamento de processo
function startServer(port, maxRetries = 5) {
    const server = app.listen(port, () => {
        console.log(`Servidor rodando em http://localhost:${port}`);
    });

    server.on("error", (error) => {
        if (error.code === "EADDRINUSE" && maxRetries > 0) {
            console.warn(`[WARN] Porta ${port} em uso. Tentando porta ${port + 1}...`);
            startServer(port + 1, maxRetries - 1);
        } else {
            console.error("[ERROR] Erro fatal ao iniciar servidor:", error);
            process.exit(1);
        }
    });

    // Limpeza adequada ao encerrar
    process.on("SIGTERM", async () => {
        console.log("Recebido sinal SIGTERM, encerrando graciosamente...");
        await Promise.all(browserPool.map(browser => browser.close()));
        server.close(() => {
            console.log("Servidor encerrado");
            process.exit(0);
        });
    });

    return server;
}

startServer(8080);

module.exports = { getJobListings, getJobDetails };
