/**
 * Servidor Web e API REST / WebSocket Multi-Máquinas Fanuc FOCAS & CLP
 * Persistência completa em SQLite com instâncias independentes por máquina
 */
const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const DatabaseManager = require('./database/db');
const MachineManager = require('./machine_manager');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const db = new DatabaseManager();
const machineManager = new MachineManager(db);

const PORT = process.env.PORT || 3000;

process.on('uncaughtException', (err) => {
  console.error(`[Processo Erro Não Tratado] ${err.message}`);
});

process.on('unhandledRejection', (reason) => {
  console.error(`[Processo Rejeição Não Tratada]`, reason);
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ==================== REST API: MÁQUINAS ====================

// Listar todas as máquinas com telemetria
app.get('/api/machines', async (req, res) => {
  try {
    const machines = await db.getAllMachines();
    const fleet = await machineManager.getAllFleetTelemetry();
    
    const result = machines.map(m => {
      const live = fleet.find(f => f.machineId === m.id);
      return {
        ...m,
        liveStatus: live ? live.status : { connected: false },
        monitoredTags: live ? live.monitoredTags : []
      };
    });

    res.json({ success: true, count: result.length, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Obter detalhes de uma máquina específica
app.get('/api/machines/:id', async (req, res) => {
  try {
    const machine = await db.getMachineById(req.params.id);
    if (!machine) return res.status(404).json({ success: false, error: 'Máquina não encontrada' });
    
    const tags = await db.getPmcTagsByMachine(machine.id);
    const params = await db.getParametersByMachine(machine.id);
    const telemetry = await machineManager.updateTelemetryForMachine(machine.id);

    res.json({
      success: true,
      data: {
        ...machine,
        tags,
        params,
        telemetry
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cadastrar nova máquina no SQLite
app.post('/api/machines', async (req, res) => {
  try {
    const { name, model, driver, host, focas_port, opcua_port, opcua_endpoint, username, password, timeout } = req.body;
    if (!name || !host) {
      return res.status(400).json({ success: false, error: 'Nome e Host (IP) são obrigatórios.' });
    }

    const newMachine = await db.addMachine({
      name,
      model: model || 'Fanuc Series 0i',
      driver: driver || 'focas_dll',
      host,
      focas_port: focas_port || 8193,
      opcua_port: opcua_port || 4840,
      opcua_endpoint: opcua_endpoint || `opc.tcp://${host}:${opcua_port || 4840}`,
      username: username || '',
      password: password || '',
      timeout: timeout || 5000,
      enabled: 1
    });

    const mId = newMachine.id;
    // Tags padrão de leitura
    await db.addPmcTag(mId, { name: 'Status_Geral', direction: 'READ', address_type: 'R', address: 1000, length: 4, data_type: 'Byte', description: 'Relés internos R1000' });
    await db.addPmcTag(mId, { name: 'Entradas_Painel', direction: 'READ', address_type: 'X', address: 0, length: 2, data_type: 'Byte', description: 'Entradas físicas X0' });
    await db.addPmcTag(mId, { name: 'Saidas_Monitoradas', direction: 'READ', address_type: 'Y', address: 0, length: 2, data_type: 'Byte', description: 'Saídas físicas Y0' });
    await db.addPmcTag(mId, { name: 'Keep_Relays', direction: 'READ', address_type: 'K', address: 0, length: 4, data_type: 'Byte', description: 'Keep Relays K0' });

    // Tags padrão de escrita
    await db.addPmcTag(mId, { name: 'Comando_Soltura_Placa', direction: 'WRITE', address_type: 'Y', address: 0, length: 1, data_type: 'Byte', write_value: '1', description: 'Ativa soltura de placa' });

    await machineManager.loadAndSyncClients();

    res.json({ success: true, message: `Máquina '${newMachine.name}' adicionada com sucesso!`, data: newMachine });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Atualizar configuração de máquina no SQLite
app.put('/api/machines/:id', async (req, res) => {
  try {
    const updated = await db.updateMachine(req.params.id, req.body);
    await machineManager.loadAndSyncClients();
    res.json({ success: true, message: 'Configurações da máquina atualizadas no banco de dados SQLite.', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Excluir máquina do SQLite
app.delete('/api/machines/:id', async (req, res) => {
  try {
    await db.deleteMachine(req.params.id);
    await machineManager.loadAndSyncClients();
    res.json({ success: true, message: `Máquina ID ${req.params.id} removida com sucesso.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Conectar máquina
app.post('/api/machines/:id/connect', async (req, res) => {
  try {
    const result = await machineManager.connectMachine(req.params.id);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Desconectar máquina
app.post('/api/machines/:id/disconnect', async (req, res) => {
  try {
    const result = await machineManager.disconnectMachine(req.params.id);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== OPERAÇÕES DE PMC / CLP POR MÁQUINA ====================

// Ler registradores pontuais do CLP da máquina
app.get('/api/machines/:id/pmc/read', async (req, res) => {
  try {
    const { addressType = 'R', startAddress = 1000, count = 1, dataType = 'Byte' } = req.query;
    const data = await machineManager.readPmc(req.params.id, addressType, Number(startAddress), Number(count), dataType);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Escrever registradores pontuais no CLP da máquina
app.post('/api/machines/:id/pmc/write', async (req, res) => {
  try {
    const { addressType = 'R', startAddress = 1000, values = [0], dataType = 'Byte' } = req.body;
    const result = await machineManager.writePmc(req.params.id, addressType, Number(startAddress), values, dataType);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Listar tags de PMC salvas no SQLite para a máquina (com filtro opcional por direção)
app.get('/api/machines/:id/pmc/tags', async (req, res) => {
  try {
    const direction = req.query.direction || null;
    const tags = await db.getPmcTagsByMachine(req.params.id, direction);
    res.json({ success: true, data: tags });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Adicionar/Persistir nova tag de PMC (Leitura ou Escrita) para a máquina
app.post('/api/machines/:id/pmc/tags', async (req, res) => {
  try {
    const newTag = await db.addPmcTag(req.params.id, req.body);
    await machineManager.updateTelemetryForMachine(req.params.id);
    res.json({ success: true, message: 'Tag de PMC salva com sucesso!', data: newTag });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Atualizar tag de PMC
app.put('/api/machines/:id/pmc/tags/:tagId', async (req, res) => {
  try {
    await db.updatePmcTag(req.params.tagId, req.body);
    await machineManager.updateTelemetryForMachine(req.params.id);
    res.json({ success: true, message: 'Tag atualizada com sucesso!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Executar escrita rápida da tag de escrita cadastrada
app.post('/api/machines/:id/pmc/tags/:tagId/write', async (req, res) => {
  try {
    const customValue = req.body.value !== undefined ? req.body.value : null;
    const result = await machineManager.executeTagWrite(req.params.id, req.params.tagId, customValue);
    res.json({ success: true, message: 'Escrita da tag executada no CLP!', data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Excluir tag de PMC
app.delete('/api/machines/:id/pmc/tags/:tagId', async (req, res) => {
  try {
    await db.deletePmcTag(req.params.tagId);
    await machineManager.updateTelemetryForMachine(req.params.id);
    res.json({ success: true, message: 'Tag excluída com sucesso!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== PARÂMETROS CNC POR MÁQUINA ====================

// Ler parâmetro CNC
app.get('/api/machines/:id/parameter/read', async (req, res) => {
  try {
    const { paramNumber = 5001, axis = 0 } = req.query;
    const data = await machineManager.readParameter(req.params.id, Number(paramNumber), Number(axis));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Escrever parâmetro CNC
app.post('/api/machines/:id/parameter/write', async (req, res) => {
  try {
    const { paramNumber = 5001, axis = 0, value = 0 } = req.body;
    const result = await machineManager.writeParameter(req.params.id, Number(paramNumber), Number(axis), Number(value));
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Listar parâmetros salvos para a máquina
app.get('/api/machines/:id/parameters', async (req, res) => {
  try {
    const params = await db.getParametersByMachine(req.params.id);
    res.json({ success: true, data: params });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Adicionar parâmetro monitorado para a máquina
app.post('/api/machines/:id/parameters', async (req, res) => {
  try {
    const newParam = await db.addParameter(req.params.id, req.body);
    res.json({ success: true, message: 'Parâmetro cadastrado com sucesso!', data: newParam });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Excluir parâmetro
app.delete('/api/machines/:id/parameters/:paramId', async (req, res) => {
  try {
    await db.deleteParameter(req.params.paramId);
    res.json({ success: true, message: 'Parâmetro removido com sucesso!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== WEBSOCKET MULTI-MÁQUINAS ====================

wss.on('connection', async (ws) => {
  try {
    const fleet = await machineManager.getAllFleetTelemetry();
    ws.send(JSON.stringify({
      type: 'fleet_telemetry',
      fleet,
      timestamp: new Date().toISOString()
    }));
  } catch (e) {}
});

// Transmissão broadcast contínua de telemetria da frota de máquinas
machineManager.on('fleet_telemetry', (fleet) => {
  const msg = JSON.stringify({
    type: 'fleet_telemetry',
    fleet,
    timestamp: new Date().toISOString()
  });

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(msg);
      } catch (e) {}
    }
  }
});

// Inicialização
async function start() {
  await machineManager.init();

  server.listen(PORT, () => {
    console.log(`\n=============================================================`);
    console.log(`  FANUC FOCAS / CLP MULTI-MÁQUINAS (SQLITE) PRONTO!         `);
    console.log(`  Acesse no seu navegador: http://localhost:${PORT}          `);
    console.log(`=============================================================\n`);
  });
}

start().catch(err => {
  console.error('[Servidor Fatal]', err);
});

module.exports = { app, server, machineManager, db };
