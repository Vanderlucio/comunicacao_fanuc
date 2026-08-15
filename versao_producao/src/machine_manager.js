/**
 * MachineManager - Gerenciador de Múltiplas Instâncias de Máquinas Fanuc
 * Controla um pool de instâncias FanucClient independentes conectadas ao SQLite
 */
const EventEmitter = require('events');
const FanucClient = require('./fanuc_client');

class MachineManager extends EventEmitter {
  constructor(db) {
    super();
    this.db = db;
    this.clients = new Map(); // machineId -> FanucClient
    this.telemetryData = new Map(); // machineId -> Telemetry Object
    this.pollingInterval = null;
    this.isPolling = false;
  }

  async init() {
    await this.db.init();
    await this.loadAndSyncClients();
    this.startPolling(1000);
    return this;
  }

  /**
   * Carrega todas as máquinas do SQLite e sincroniza instâncias ativas
   */
  async loadAndSyncClients() {
    const machines = await this.db.getAllMachines();
    const currentIds = new Set(machines.map(m => m.id));

    // Remove instâncias de máquinas que foram excluídas
    for (const [id, client] of this.clients.entries()) {
      if (!currentIds.has(id)) {
        try { await client.disconnect(); } catch (e) {}
        this.clients.delete(id);
        this.telemetryData.delete(id);
      }
    }

    // Inicializa ou atualiza instâncias
    for (const m of machines) {
      if (!this.clients.has(m.id)) {
        const client = this.createClientForMachine(m);
        this.clients.set(m.id, client);
      } else {
        // Atualiza configuração da instância
        const client = this.clients.get(m.id);
        this.applyMachineConfigToClient(client, m);
      }
    }
  }

  createClientForMachine(m) {
    const customConfig = {
      connection: {
        driver: m.driver || 'focas_dll',
        host: m.host || '192.168.1.100',
        port: m.opcua_port || 4840,
        focasPort: m.focas_port || 8193,
        opcuaEndpoint: m.opcua_endpoint || `opc.tcp://${m.host || '127.0.0.1'}:${m.opcua_port || 4840}`,
        username: m.username || 'OpcUaClient',
        password: m.password || 'OpcUaClient',
        timeout: m.timeout || 5000,
        autoReconnect: true,
        reconnectInterval: 3000
      },
      pmcDefaults: {
        defaultAddressType: 'R',
        defaultDataType: 'Byte'
      }
    };

    const client = new FanucClient(customConfig);
    client.machineId = m.id;
    client.machineName = m.name;

    client.on('error', (err) => {
      // Log seguro sem derrubar processo
      // console.log(`[Machine ${m.id} - ${m.name}] ${err.message}`);
    });

    // Se habilitada, tenta conectar
    if (m.enabled) {
      client.connect().catch(() => {});
    }

    return client;
  }

  applyMachineConfigToClient(client, m) {
    client.config.connection.driver = m.driver;
    client.config.connection.host = m.host;
    client.config.connection.port = m.opcua_port || 4840;
    client.config.connection.focasPort = m.focas_port || 8193;
    client.config.connection.opcuaEndpoint = m.opcua_endpoint || `opc.tcp://${m.host}:${m.opcua_port || 4840}`;
    client.config.connection.username = m.username;
    client.config.connection.password = m.password;
    client.config.connection.timeout = m.timeout;
    client.machineName = m.name;
  }

  getClient(machineId) {
    const id = Number(machineId);
    return this.clients.get(id) || null;
  }

  async connectMachine(machineId) {
    const client = this.getClient(machineId);
    if (!client) throw new Error(`Máquina ID ${machineId} não encontrada`);
    const res = await client.connect();
    await this.updateTelemetryForMachine(Number(machineId));
    return res;
  }

  async disconnectMachine(machineId) {
    const client = this.getClient(machineId);
    if (!client) throw new Error(`Máquina ID ${machineId} não encontrada`);
    const res = await client.disconnect();
    await this.updateTelemetryForMachine(Number(machineId));
    return res;
  }

  async readPmc(machineId, addressType, startAddress, count = 1, dataType = 'Byte') {
    const client = this.getClient(machineId);
    if (!client) throw new Error(`Máquina ID ${machineId} não encontrada`);
    return await client.readPmc(addressType, startAddress, count, dataType);
  }

  async writePmc(machineId, addressType, startAddress, values, dataType = 'Byte') {
    const client = this.getClient(machineId);
    if (!client) throw new Error(`Máquina ID ${machineId} não encontrada`);
    return await client.writePmc(addressType, startAddress, values, dataType);
  }

  async readParameter(machineId, paramNumber, axis = 0) {
    const client = this.getClient(machineId);
    if (!client) throw new Error(`Máquina ID ${machineId} não encontrada`);
    return await client.readParameter(paramNumber, axis);
  }

  async writeParameter(machineId, paramNumber, axis = 0, value = 0) {
    const client = this.getClient(machineId);
    if (!client) throw new Error(`Máquina ID ${machineId} não encontrada`);
    return await client.writeParameter(paramNumber, axis, value);
  }

  // ==================== TELEMETRIA ====================

  async updateTelemetryForMachine(machineId) {
    const id = Number(machineId);
    const client = this.clients.get(id);
    const machine = await this.db.getMachineById(id);
    if (!machine) return null;

    let status = {
      connected: false,
      driver: machine.driver,
      mode: 'OFFLINE',
      runStatus: 'DESCONECTADO',
      feedrate: '---',
      spindleSpeed: '---',
      program: '---',
      partsCount: '---',
      alarm: false,
      alarmText: 'Desconectado',
      positions: { X: '---', Y: '---', Z: '---', A: '---' },
      timestamp: new Date().toISOString()
    };

    if (client) {
      try {
        status = await client.readStatus();
      } catch (e) {
        status.error = e.message;
      }
    }

    // Lê tags de PMC associadas a esta máquina no banco de dados
    const tags = await this.db.getPmcTagsByMachine(id);
    const monitoredTags = [];

    if (status.connected && client) {
      for (const tag of tags) {
        try {
          const data = await client.readPmc(tag.address_type, tag.address, tag.length || 1, tag.data_type || 'Byte');
          monitoredTags.push({ tag, data });
        } catch (err) {
          monitoredTags.push({ tag, error: err.message });
        }
      }
    }

    const payload = {
      machineId: id,
      name: machine.name,
      model: machine.model,
      driver: machine.driver,
      host: machine.host,
      focasPort: machine.focas_port,
      opcuaPort: machine.opcua_port,
      status,
      monitoredTags,
      timestamp: new Date().toISOString()
    };

    this.telemetryData.set(id, payload);
    return payload;
  }

  async getAllFleetTelemetry() {
    const machines = await this.db.getAllMachines();
    const list = [];
    for (const m of machines) {
      const data = this.telemetryData.get(m.id) || {
        machineId: m.id,
        name: m.name,
        model: m.model,
        driver: m.driver,
        host: m.host,
        status: {
          connected: false,
          mode: 'OFFLINE',
          runStatus: 'DESCONECTADO',
          positions: { X: '---', Y: '---', Z: '---', A: '---' }
        },
        monitoredTags: []
      };
      list.push(data);
    }
    return list;
  }

  startPolling(intervalMs = 1000) {
    if (this.pollingInterval) clearInterval(this.pollingInterval);

    this.pollingInterval = setInterval(async () => {
      if (this.isPolling) return;
      this.isPolling = true;

      try {
        const machines = await this.db.getAllMachines();
        for (const m of machines) {
          await this.updateTelemetryForMachine(m.id).catch(() => {});
        }

        const fleet = await this.getAllFleetTelemetry();
        this.emit('fleet_telemetry', fleet);
      } catch (e) {
      } finally {
        this.isPolling = false;
      }
    }, intervalMs);
  }

  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }
}

module.exports = MachineManager;
