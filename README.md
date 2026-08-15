# 🤖 Fanuc FOCAS & CLP (PMC) - Aplicação de Comunicação Industrial

Aplicação em JavaScript (Node.js) e C# para comunicação, telemetria, leitura e escrita de registradores do CLP (PMC) e parâmetros em máquinas CNC Fanuc através de múltiplos drivers industriais (FOCAS Nativo com DLLs oficiais `Fwlib32.dll`, FOCAS TCP Socket direto e OPC UA).

---

## 📁 Estrutura das Versões do Projeto

| Pasta | Descrição | Casos de Uso |
|---|---|---|
| **[`versao_teste/`](./versao_teste/)** | Versão completa de testes, homologação e simulação | Testes em bancada, simulação com CNCnetPDM, desenvolvimento de novas telas e validação de parâmetros. |
| **[`versao_producao/`](./versao_producao/)** | Versão otimizada para fábrica 24/7 | Conexão direta com a máquina CNC real via `Fwlib32.dll` (FOCAS), configuração para PM2 / Windows Service e auto-reconexão robusta. |
| **[`versao_nodered/`](./versao_nodered/)** | Integração Industrial Node-RED & MQTT | Fluxos prontos para Node-RED com dashboard gráfico (`/ui`), publicação MQTT para sistemas MES/ERP e Indústria 4.0. |

---

## 🚀 Como Executar Cada Versão

### 1. Versão de Testes
```bash
cd versao_teste
npm start
```
Acesse no navegador: **`http://localhost:3000`**

### 2. Versão de Produção
```bash
cd versao_producao
start_service.bat
```
*(Ou com PM2: `pm2 start pm2.config.js`)*

### 3. Versão Node-RED
```bash
cd versao_nodered
start_nodered.bat
```
Acesse o Dashboard: **`http://localhost:1880/ui`**
Acesse o Editor: **`http://localhost:1880`**
