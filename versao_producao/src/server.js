/**
 * Servidor Web e API REST / WebSocket para o Dashboard Fanuc FOCAS / CLP
 */
const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const FanucClient = require('./fanuc_client');
const { PMC_ADDRESS_TYPES, PMC_DATA_TYPES } = require('./constants');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const client = new FanucClient();
const PORT = client.config.dashboard ? client.config.dashboard.port || 3000 : 3000;

// Proteção contra erros não tratados
client.on('error', (err) => {
  console.log(`[FanucClient Erro] ${err.message}`);
});

process.on('uncaughtException', (err) => {
  console.error(`[Processo Erro Não Tratado] ${err.message}`);
});

process.on('unhandledRejection', (reason) => {
  console.error(`[Processo Rejeição Não Tratada]`, reason);
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Inicializa conexão
client.connect().catch(err => {
  console.log(`[Dashboard] Inicialização: ${err.message}`);
});

// REST API Endpoints

// Obter configuração atual e status
app.get('/api/status', async (req, res) => {
  try {
    const status = await client.readStatus();
    res.json({
      success: true,
      config: client.config,
      status
    });
  } catch (err) {
    res.json({
      success: true,
      config: client.config,
      status: {
        connected: client.isConnected(),
        driver: client.driver ? client.driver.name : 'Desconectado',
        error: err.message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Trocar driver / atualizar conexão
app.post('/api/connection', async (req, res) => {
  try {
    const { driver, host, port, focasPort, opcuaEndpoint } = req.body;
    if (driver) client.config.connection.driver = driver;
    if (host) client.config.connection.host = host;
    if (port) client.config.connection.port = Number(port);
    if (focasPort) client.config.connection.focasPort = Number(focasPort);
    if (opcuaEndpoint) client.config.connection.opcuaEndpoint = opcuaEndpoint;

    client.initDriver(client.config.connection.driver);
    const connResult = await client.connect();

    res.json({
      success: true,
      message: connResult.message,
      config: client.config
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Desconectar
app.post('/api/disconnect', async (req, res) => {
  try {
    await client.disconnect();
    res.json({ success: true, message: 'Desconectado com sucesso' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Ler PMC
app.get('/api/pmc/read', async (req, res) => {
  try {
    const { type = 'R', address = 1000, count = 1, dataType = 'Byte' } = req.query;
    const result = await client.readPmc(type, Number(address), Number(count), dataType);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Escrever PMC
app.post('/api/pmc/write', async (req, res) => {
  try {
    const { type = 'R', address = 1000, values, dataType = 'Byte' } = req.body;
    const result = await client.writePmc(type, Number(address), values, dataType);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Ler Bit PMC
app.get('/api/pmc/bit/read', async (req, res) => {
  try {
    const { type = 'R', address = 1000, bit = 0 } = req.query;
    const result = await client.readPmcBit(type, Number(address), Number(bit));
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Escrever Bit PMC
app.post('/api/pmc/bit/write', async (req, res) => {
  try {
    const { type = 'R', address = 1000, bit = 0, value = 1 } = req.body;
    const result = await client.writePmcBit(type, Number(address), Number(bit), Number(value));
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Ler Parâmetro CNC
app.get('/api/parameter/read', async (req, res) => {
  try {
    const { paramNumber = 5001, axis = 0 } = req.query;
    const result = await client.readParameter(Number(paramNumber), Number(axis));
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Escrever Parâmetro CNC
app.post('/api/parameter/write', async (req, res) => {
  try {
    const { paramNumber = 5001, axis = 0, value = 0 } = req.body;
    const result = await client.writeParameter(Number(paramNumber), Number(axis), Number(value));
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// WebSocket para telemetria em tempo real
wss.on('connection', (ws) => {
  const sendUpdate = async () => {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        const status = await client.readStatus();
        const monitoredTags = [];

        for (const tag of (client.config.monitoredPmcTags || [])) {
          try {
            const data = await client.readPmc(tag.addressType, tag.address, tag.length || 1, tag.dataType || 'Byte');
            monitoredTags.push({
              tag,
              data
            });
          } catch (e) {
            monitoredTags.push({ tag, error: e.message });
          }
        }

        ws.send(JSON.stringify({
          type: 'telemetry',
          status,
          monitoredTags,
          timestamp: new Date().toISOString()
        }));
      }
    } catch (e) {}
  };

  const interval = setInterval(sendUpdate, 800);
  sendUpdate();

  ws.on('close', () => {
    clearInterval(interval);
  });
});

server.listen(PORT, () => {
  console.log(`\n=============================================================`);
  console.log(`  FANUC FOCAS / CLP DASHBOARD WEB PRONTO!                   `);
  console.log(`  Acesse no seu navegador: http://localhost:${PORT}          `);
  console.log(`=============================================================\n`);
});

module.exports = { app, server };
