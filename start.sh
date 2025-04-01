#!/bin/bash

# Verificar se o Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "Node.js não está instalado. Instalando..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Verificar se o PM2 está instalado
if ! command -v pm2 &> /dev/null; then
    echo "PM2 não está instalado. Instalando..."
    sudo npm install -g pm2
fi

# Verificar se o Chromium está instalado
if ! command -v chromium-browser &> /dev/null; then
    echo "Chromium não está instalado. Instalando..."
    sudo apt-get install -y chromium-browser fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1
fi

# Verificar e criar diretório se não existir
if [ ! -d "/apps/jobsscraper" ]; then
    echo "Criando diretório /apps/jobsscraper..."
    sudo mkdir -p /apps/jobsscraper
    sudo chown -R $USER:$USER /apps/jobsscraper
fi

# Navegar para o diretório da aplicação
cd /apps/jobsscraper

# Instalar dependências
if [ ! -d "node_modules" ]; then
    echo "Instalando dependências..."
    npm install
fi

# Iniciar a aplicação com PM2
echo "Iniciando a aplicação..."
pm2 start app.js --name "linkedin-scraper"

# Configurar PM2 para iniciar com o sistema
echo "Configurando PM2 para iniciar automaticamente após reboot..."
pm2 save
pm2 startup

echo "Aplicação iniciada com sucesso! Verifique o status com 'pm2 status'"
