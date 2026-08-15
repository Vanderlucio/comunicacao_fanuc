/**
 * Módulo de Banco de Dados SQLite para Persistência de Máquinas, Tags e Parâmetros
 * Suporta sqlite3 nativo com persistência assíncrona automática
 */
const path = require('path');
const fs = require('fs');

class DatabaseManager {
  constructor(dbPath) {
    this.dbPath = dbPath || path.resolve(__dirname, '../../data/machines.sqlite');
    this.ensureDir();
    this.sqlite = null;
    this.db = null;
    this.isNativeSqlite = false;
    this.fallbackStorePath = path.resolve(__dirname, '../../data/machines_store.json');
    this.fallbackData = {
      machines: [],
      machine_pmc_tags: [],
      machine_parameters: []
    };
  }

  ensureDir() {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  async init() {
    this.ensureDir();

    try {
      const sqlite3 = require('sqlite3').verbose();
      this.db = await new Promise((resolve, reject) => {
        const dbInstance = new sqlite3.Database(this.dbPath, (err) => {
          if (err) reject(err);
          else resolve(dbInstance);
        });
      });
      this.isNativeSqlite = true;
      console.log(`[Database] SQLite nativo conectado em: ${this.dbPath}`);
      await this.createTablesSqlite();
    } catch (err) {
      console.warn(`[Database] Usando storage persistente JSON/SQLite: ${err.message}`);
      this.isNativeSqlite = false;
      this.loadFallbackData();
    }

    await this.seedDefaultData();
    return this;
  }

  async createTablesSqlite() {
    const sql = `
      CREATE TABLE IF NOT EXISTS machines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        model TEXT,
        driver TEXT NOT NULL DEFAULT 'focas_dll',
        host TEXT NOT NULL DEFAULT '192.168.1.100',
        focas_port INTEGER DEFAULT 8193,
        opcua_port INTEGER DEFAULT 4840,
        opcua_endpoint TEXT,
        username TEXT,
        password TEXT,
        timeout INTEGER DEFAULT 5000,
        enabled INTEGER DEFAULT 1,
        created_at TEXT,
        updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS machine_pmc_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        machine_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        address_type TEXT NOT NULL,
        address INTEGER NOT NULL,
        length INTEGER NOT NULL DEFAULT 1,
        data_type TEXT NOT NULL DEFAULT 'Byte',
        description TEXT,
        created_at TEXT,
        FOREIGN KEY (machine_id) REFERENCES machines(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS machine_parameters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        machine_id INTEGER NOT NULL,
        param_number INTEGER NOT NULL,
        axis INTEGER NOT NULL DEFAULT 0,
        name TEXT,
        description TEXT,
        created_at TEXT,
        FOREIGN KEY (machine_id) REFERENCES machines(id) ON DELETE CASCADE
      );
    `;

    return new Promise((resolve, reject) => {
      this.db.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  loadFallbackData() {
    if (fs.existsSync(this.fallbackStorePath)) {
      try {
        const raw = fs.readFileSync(this.fallbackStorePath, 'utf8');
        this.fallbackData = JSON.parse(raw);
      } catch (e) {
        this.fallbackData = { machines: [], machine_pmc_tags: [], machine_parameters: [] };
      }
    } else {
      this.saveFallbackData();
    }
  }

  saveFallbackData() {
    fs.writeFileSync(this.fallbackStorePath, JSON.stringify(this.fallbackData, null, 2), 'utf8');
  }

  async seedDefaultData() {
    const machines = await this.getAllMachines();
    if (machines.length === 0) {
      console.log('[Database] Populando máquina inicial padrão (CNCnetPDM / Fanuc FOCAS)...');
      const defaultMachine = await this.addMachine({
        name: 'CNC Fanuc 01 (Principal)',
        model: 'Fanuc Series 0i-TF',
        driver: 'opcua',
        host: '127.0.0.1',
        focas_port: 8193,
        opcua_port: 4840,
        opcua_endpoint: 'opc.tcp://127.0.0.1:4840',
        username: 'OpcUaClient',
        password: 'OpcUaClient',
        timeout: 5000,
        enabled: 1
      });

      const mId = defaultMachine.id;

      // Tags de PMC padrão
      await this.addPmcTag(mId, { name: 'Status_Geral', address_type: 'R', address: 1000, length: 4, data_type: 'Byte', description: 'Relés internos de status' });
      await this.addPmcTag(mId, { name: 'Entradas_Painel', address_type: 'X', address: 0, length: 2, data_type: 'Byte', description: 'Entradas físicas digitais' });
      await this.addPmcTag(mId, { name: 'Saidas_Valvulas', address_type: 'Y', address: 0, length: 2, data_type: 'Byte', description: 'Saídas físicas digitais' });
      await this.addPmcTag(mId, { name: 'Keep_Relays', address_type: 'K', address: 0, length: 4, data_type: 'Byte', description: 'Parâmetros retentivos' });
      await this.addPmcTag(mId, { name: 'Tabela_D500', address_type: 'D', address: 500, length: 2, data_type: 'Word', description: 'Registradores numéricos D500' });

      // Parâmetros CNC padrão
      await this.addParameter(mId, { param_number: 4000, axis: 0, name: 'Param_Sistema', description: 'Configuração geral CNC' });
      await this.addParameter(mId, { param_number: 5001, axis: 1, name: 'Posicao_G54_X', description: 'Origem G54 Eixo X' });
      await this.addParameter(mId, { param_number: 5001, axis: 2, name: 'Posicao_G54_Y', description: 'Origem G54 Eixo Y' });
      await this.addParameter(mId, { param_number: 5001, axis: 3, name: 'Posicao_G54_Z', description: 'Origem G54 Eixo Z' });
    }
  }

  // ==================== MÁQUINAS (CRUD) ====================

  async getAllMachines() {
    if (this.isNativeSqlite) {
      return new Promise((resolve, reject) => {
        this.db.all('SELECT * FROM machines ORDER BY id ASC', [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
    } else {
      return this.fallbackData.machines;
    }
  }

  async getMachineById(id) {
    id = Number(id);
    if (this.isNativeSqlite) {
      return new Promise((resolve, reject) => {
        this.db.get('SELECT * FROM machines WHERE id = ?', [id], (err, row) => {
          if (err) reject(err);
          else resolve(row || null);
        });
      });
    } else {
      return this.fallbackData.machines.find(m => m.id === id) || null;
    }
  }

  async addMachine(data) {
    const now = new Date().toISOString();
    if (this.isNativeSqlite) {
      return new Promise((resolve, reject) => {
        const sql = `
          INSERT INTO machines (name, model, driver, host, focas_port, opcua_port, opcua_endpoint, username, password, timeout, enabled, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const params = [
          data.name || 'Nova Máquina Fanuc',
          data.model || 'Fanuc Series 0i',
          data.driver || 'focas_dll',
          data.host || '192.168.1.100',
          Number(data.focas_port || data.focasPort || 8193),
          Number(data.opcua_port || data.opcuaPort || 4840),
          data.opcua_endpoint || data.opcuaEndpoint || `opc.tcp://${data.host || '127.0.0.1'}:4840`,
          data.username || '',
          data.password || '',
          Number(data.timeout || 5000),
          data.enabled !== undefined ? Number(data.enabled) : 1,
          now,
          now
        ];

        this.db.run(sql, params, function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID, ...data, created_at: now, updated_at: now });
        });
      });
    } else {
      const nextId = this.fallbackData.machines.length > 0 ? Math.max(...this.fallbackData.machines.map(m => m.id)) + 1 : 1;
      const newMachine = {
        id: nextId,
        name: data.name || 'Nova Máquina Fanuc',
        model: data.model || 'Fanuc Series 0i',
        driver: data.driver || 'focas_dll',
        host: data.host || '192.168.1.100',
        focas_port: Number(data.focas_port || data.focasPort || 8193),
        opcua_port: Number(data.opcua_port || data.opcuaPort || 4840),
        opcua_endpoint: data.opcua_endpoint || data.opcuaEndpoint || `opc.tcp://${data.host || '127.0.0.1'}:4840`,
        username: data.username || '',
        password: data.password || '',
        timeout: Number(data.timeout || 5000),
        enabled: data.enabled !== undefined ? Number(data.enabled) : 1,
        created_at: now,
        updated_at: now
      };
      this.fallbackData.machines.push(newMachine);
      this.saveFallbackData();
      return newMachine;
    }
  }

  async updateMachine(id, data) {
    id = Number(id);
    const now = new Date().toISOString();
    if (this.isNativeSqlite) {
      return new Promise((resolve, reject) => {
        const sql = `
          UPDATE machines SET
            name = COALESCE(?, name),
            model = COALESCE(?, model),
            driver = COALESCE(?, driver),
            host = COALESCE(?, host),
            focas_port = COALESCE(?, focas_port),
            opcua_port = COALESCE(?, opcua_port),
            opcua_endpoint = COALESCE(?, opcua_endpoint),
            username = COALESCE(?, username),
            password = COALESCE(?, password),
            timeout = COALESCE(?, timeout),
            enabled = COALESCE(?, enabled),
            updated_at = ?
          WHERE id = ?
        `;
        const params = [
          data.name,
          data.model,
          data.driver,
          data.host,
          data.focas_port !== undefined ? Number(data.focas_port) : (data.focasPort !== undefined ? Number(data.focasPort) : undefined),
          data.opcua_port !== undefined ? Number(data.opcua_port) : (data.opcuaPort !== undefined ? Number(data.opcuaPort) : undefined),
          data.opcua_endpoint || data.opcuaEndpoint,
          data.username,
          data.password,
          data.timeout !== undefined ? Number(data.timeout) : undefined,
          data.enabled !== undefined ? Number(data.enabled) : undefined,
          now,
          id
        ];

        this.db.run(sql, params, function(err) {
          if (err) reject(err);
          else resolve({ success: this.changes > 0, id });
        });
      });
    } else {
      const idx = this.fallbackData.machines.findIndex(m => m.id === id);
      if (idx === -1) return { success: false, error: 'Máquina não encontrada' };
      this.fallbackData.machines[idx] = {
        ...this.fallbackData.machines[idx],
        ...data,
        updated_at: now
      };
      this.saveFallbackData();
      return { success: true, machine: this.fallbackData.machines[idx] };
    }
  }

  async deleteMachine(id) {
    id = Number(id);
    if (this.isNativeSqlite) {
      return new Promise((resolve, reject) => {
        this.db.run('DELETE FROM machines WHERE id = ?', [id], function(err) {
          if (err) reject(err);
          else resolve({ success: this.changes > 0 });
        });
      });
    } else {
      this.fallbackData.machines = this.fallbackData.machines.filter(m => m.id !== id);
      this.fallbackData.machine_pmc_tags = this.fallbackData.machine_pmc_tags.filter(t => t.machine_id !== id);
      this.fallbackData.machine_parameters = this.fallbackData.machine_parameters.filter(p => p.machine_id !== id);
      this.saveFallbackData();
      return { success: true };
    }
  }

  // ==================== PMC TAGS (CRUD) ====================

  async getPmcTagsByMachine(machineId) {
    machineId = Number(machineId);
    if (this.isNativeSqlite) {
      return new Promise((resolve, reject) => {
        this.db.all('SELECT * FROM machine_pmc_tags WHERE machine_id = ? ORDER BY id ASC', [machineId], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
    } else {
      return this.fallbackData.machine_pmc_tags.filter(t => t.machine_id === machineId);
    }
  }

  async addPmcTag(machineId, data) {
    machineId = Number(machineId);
    const now = new Date().toISOString();
    if (this.isNativeSqlite) {
      return new Promise((resolve, reject) => {
        const sql = `
          INSERT INTO machine_pmc_tags (machine_id, name, address_type, address, length, data_type, description, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const params = [
          machineId,
          data.name || 'Nova Tag',
          data.address_type || data.addressType || 'R',
          Number(data.address !== undefined ? data.address : 1000),
          Number(data.length || 1),
          data.data_type || data.dataType || 'Byte',
          data.description || '',
          now
        ];

        this.db.run(sql, params, function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID, machine_id: machineId, ...data, created_at: now });
        });
      });
    } else {
      const nextId = this.fallbackData.machine_pmc_tags.length > 0 ? Math.max(...this.fallbackData.machine_pmc_tags.map(t => t.id)) + 1 : 1;
      const newTag = {
        id: nextId,
        machine_id: machineId,
        name: data.name || 'Nova Tag',
        address_type: data.address_type || data.addressType || 'R',
        address: Number(data.address !== undefined ? data.address : 1000),
        length: Number(data.length || 1),
        data_type: data.data_type || data.dataType || 'Byte',
        description: data.description || '',
        created_at: now
      };
      this.fallbackData.machine_pmc_tags.push(newTag);
      this.saveFallbackData();
      return newTag;
    }
  }

  async deletePmcTag(tagId) {
    tagId = Number(tagId);
    if (this.isNativeSqlite) {
      return new Promise((resolve, reject) => {
        this.db.run('DELETE FROM machine_pmc_tags WHERE id = ?', [tagId], function(err) {
          if (err) reject(err);
          else resolve({ success: this.changes > 0 });
        });
      });
    } else {
      this.fallbackData.machine_pmc_tags = this.fallbackData.machine_pmc_tags.filter(t => t.id !== tagId);
      this.saveFallbackData();
      return { success: true };
    }
  }

  // ==================== PARAMETERS (CRUD) ====================

  async getParametersByMachine(machineId) {
    machineId = Number(machineId);
    if (this.isNativeSqlite) {
      return new Promise((resolve, reject) => {
        this.db.all('SELECT * FROM machine_parameters WHERE machine_id = ? ORDER BY id ASC', [machineId], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
    } else {
      return this.fallbackData.machine_parameters.filter(p => p.machine_id === machineId);
    }
  }

  async addParameter(machineId, data) {
    machineId = Number(machineId);
    const now = new Date().toISOString();
    if (this.isNativeSqlite) {
      return new Promise((resolve, reject) => {
        const sql = `
          INSERT INTO machine_parameters (machine_id, param_number, axis, name, description, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `;
        const params = [
          machineId,
          Number(data.param_number || data.paramNumber || 5001),
          Number(data.axis !== undefined ? data.axis : 0),
          data.name || 'Parâmetro',
          data.description || '',
          now
        ];

        this.db.run(sql, params, function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID, machine_id: machineId, ...data, created_at: now });
        });
      });
    } else {
      const nextId = this.fallbackData.machine_parameters.length > 0 ? Math.max(...this.fallbackData.machine_parameters.map(p => p.id)) + 1 : 1;
      const newParam = {
        id: nextId,
        machine_id: machineId,
        param_number: Number(data.param_number || data.paramNumber || 5001),
        axis: Number(data.axis !== undefined ? data.axis : 0),
        name: data.name || 'Parâmetro',
        description: data.description || '',
        created_at: now
      };
      this.fallbackData.machine_parameters.push(newParam);
      this.saveFallbackData();
      return newParam;
    }
  }

  async deleteParameter(paramId) {
    paramId = Number(paramId);
    if (this.isNativeSqlite) {
      return new Promise((resolve, reject) => {
        this.db.run('DELETE FROM machine_parameters WHERE id = ?', [paramId], function(err) {
          if (err) reject(err);
          else resolve({ success: this.changes > 0 });
        });
      });
    } else {
      this.fallbackData.machine_parameters = this.fallbackData.machine_parameters.filter(p => p.id !== paramId);
      this.saveFallbackData();
      return { success: true };
    }
  }
}

module.exports = DatabaseManager;
