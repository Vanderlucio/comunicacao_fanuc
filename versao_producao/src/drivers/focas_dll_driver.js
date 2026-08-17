/**
 * Driver Fanuc FOCAS DLL Nativo (Fwlib32.dll / FWLIB64.dll)
 * Executa chamadas nativas oficiais Fanuc em 32-bit via Bridge nativo ultrarrápido ou FFI direto
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const BaseDriver = require('./base_driver');
const {
  PMC_ADDRESS_TYPES,
  PMC_DATA_TYPES,
  parseAddressType,
  getAddressTypeName,
  parseDataType,
  getDataTypeSize,
  getReturnMessage,
  CNC_MODES,
  CNC_RUN_STATUS
} = require('../constants');

class FocasDllDriver extends BaseDriver {
  constructor(config = {}) {
    super(config);
    this.name = 'Fanuc-FOCAS-DLL';
    this.host = config.host || '127.0.0.1';
    this.port = config.focasPort || config.port || 8193;
    this.timeout = Math.floor((config.timeout || 5000) / 1000);
    this.process = null;
    this.rl = null;
    this.pendingCallbacks = [];
    this.flibHandle = 0;
    this._queue = Promise.resolve();
  }

  /**
   * Inicia o processo bridge 32-bit nativo para Fwlib32.dll
   */
  startBridgeProcess() {
    if (this.process) return;

    const candidateBridgePaths = [
      path.resolve(process.cwd(), 'fanuc_bridge32.exe'),
      path.resolve(__dirname, '../../fanuc_bridge32.exe'),
      path.resolve(__dirname, '../../../fanuc_bridge32.exe'),
      path.resolve(__dirname, '../fanuc_bridge32.exe')
    ];

    const bridgePath = candidateBridgePaths.find(p => fs.existsSync(p));
    if (!bridgePath) {
      throw new Error(`Arquivo 'fanuc_bridge32.exe' não encontrado.`);
    }

    const bridgeDir = path.dirname(bridgePath);

    this.process = spawn(bridgePath, [], {
      cwd: bridgeDir,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.rl = readline.createInterface({
      input: this.process.stdout,
      terminal: false
    });

    this.rl.on('line', (line) => {
      line = line.trim();
      if (!line) return;

      try {
        const json = JSON.parse(line);
        if (this.pendingCallbacks.length > 0) {
          const cb = this.pendingCallbacks.shift();
          cb.resolve(json);
        }
      } catch (err) {
        if (this.pendingCallbacks.length > 0) {
          const cb = this.pendingCallbacks.shift();
          cb.reject(new Error(`Erro ao interpretar resposta do bridge Fwlib32: ${err.message}`));
        }
      }
    });

    this.process.stderr.on('data', (data) => {
      console.warn(`[Fwlib32 Bridge] ${data.toString()}`);
    });

    this.process.on('close', () => {
      this.connected = false;
      this.process = null;
      this.rl = null;
      this.emit('disconnected');
    });

    this.process.on('error', (err) => {
      this.connected = false;
      this.emit('error', err);
    });
  }

  /**
   * Envia comando JSON para o processo bridge de forma estritamente sequencial
   */
  async sendBridgeCommand(cmdObj) {
    return new Promise((resolve, reject) => {
      this._queue = this._queue.then(() => {
        return this._executeBridgeCommand(cmdObj)
          .then(resolve)
          .catch(reject);
      }).catch(() => {});
    });
  }

  _executeBridgeCommand(cmdObj) {
    if (!this.process) {
      this.startBridgeProcess();
    }

    return new Promise((resolve, reject) => {
      const timeoutMs = (this.timeout * 1000) + 3000;
      const timer = setTimeout(() => {
        const idx = this.pendingCallbacks.findIndex(cb => cb.resolve === resolve);
        if (idx !== -1) {
          this.pendingCallbacks.splice(idx, 1);
        }
        reject(new Error(`Timeout na chamada Fwlib32.dll (Comando: ${cmdObj.cmd})`));
      }, timeoutMs);

      this.pendingCallbacks.push({
        resolve: (val) => {
          clearTimeout(timer);
          resolve(val);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        }
      });

      try {
        this.process.stdin.write(JSON.stringify(cmdObj) + '\n');
      } catch (err) {
        clearTimeout(timer);
        const idx = this.pendingCallbacks.findIndex(cb => cb.resolve === resolve);
        if (idx !== -1) this.pendingCallbacks.splice(idx, 1);
        reject(err);
      }
    });
  }

  async connect() {
    this.startBridgeProcess();

    const res = await this.sendBridgeCommand({
      cmd: 'connect',
      ip: this.host,
      port: this.port,
      timeout: this.timeout
    });

    if (!res.success) {
      throw new Error(`Falha ao conectar via Fwlib32.dll: ${res.error || getReturnMessage(res.ret)}`);
    }

    this.connected = true;
    this.flibHandle = res.handle || 1;
    this.emit('connected', { host: this.host, port: this.port, handle: this.flibHandle });

    return {
      success: true,
      handle: this.flibHandle,
      message: `Conectado ao CNC Fanuc com sucesso via Fwlib32.dll (Handle: ${this.flibHandle})`
    };
  }

  async disconnect() {
    if (this.connected && this.process) {
      try {
        await this.sendBridgeCommand({ cmd: 'disconnect' });
      } catch (e) {}
    }
    this.connected = false;
    this.flibHandle = 0;
    this.emit('disconnected');
    return { success: true, message: 'Desconectado da Fwlib32.dll' };
  }

  async readPmc(addressType, startAddress, count = 1, dataType = 'Byte') {
    const typeCode = parseAddressType(addressType);
    const typeName = getAddressTypeName(typeCode);
    const dataTypeCode = parseDataType(dataType);

    const res = await this.sendBridgeCommand({
      cmd: 'read_pmc',
      type_a: typeCode,
      type_d: dataTypeCode,
      start: Number(startAddress),
      count: Number(count)
    });

    if (!res.success) {
      throw new Error(`Erro ao ler PMC ${typeName}${startAddress}: ${res.error || getReturnMessage(res.ret)}`);
    }

    return {
      addressType: typeName,
      typeCode,
      startAddress,
      count,
      dataType: Object.keys(PMC_DATA_TYPES).find(k => PMC_DATA_TYPES[k] === dataTypeCode) || 'Byte',
      values: res.values || [],
      rawBuffer: Buffer.from(res.values || [])
    };
  }

  async writePmc(addressType, startAddress, values, dataType = 'Byte') {
    const typeCode = parseAddressType(addressType);
    const typeName = getAddressTypeName(typeCode);
    const dataTypeCode = parseDataType(dataType);

    const valArray = Array.isArray(values) ? values : (Buffer.isBuffer(values) ? Array.from(values) : [values]);

    const res = await this.sendBridgeCommand({
      cmd: 'write_pmc',
      type_a: typeCode,
      type_d: dataTypeCode,
      start: Number(startAddress),
      values: valArray.join(',')
    });

    if (!res.success) {
      throw new Error(`Erro ao escrever no PMC ${typeName}${startAddress}: ${res.error || getReturnMessage(res.ret)}`);
    }

    return {
      success: true,
      addressType: typeName,
      startAddress,
      writtenCount: valArray.length,
      message: `Escrita com sucesso de ${valArray.length} elemento(s) em ${typeName}${startAddress} via Fwlib32.dll`
    };
  }

  async readParameter(paramNumber, axis = 0) {
    const res = await this.sendBridgeCommand({
      cmd: 'read_param',
      number: Number(paramNumber),
      axis: Number(axis)
    });

    if (!res.success) {
      throw new Error(`Erro ao ler parâmetro #${paramNumber}: ${res.error || getReturnMessage(res.ret)}`);
    }

    return {
      paramNumber,
      axis,
      value: res.value,
      type: 'Long'
    };
  }

  async writeParameter(paramNumber, axis = 0, value = 0) {
    const res = await this.sendBridgeCommand({
      cmd: 'write_param',
      number: Number(paramNumber),
      axis: Number(axis),
      value: Number(value)
    });

    if (!res.success) {
      throw new Error(`Erro ao escrever parâmetro #${paramNumber}: ${res.error || getReturnMessage(res.ret)}`);
    }

    return {
      success: true,
      paramNumber,
      axis,
      value,
      message: `Parâmetro #${paramNumber} (Eixo ${axis}) escrito com sucesso via Fwlib32.dll`
    };
  }

  async readStatus() {
    const res = await this.sendBridgeCommand({ cmd: 'read_status' });

    if (!res.success) {
      return {
        connected: this.connected,
        driver: this.name,
        host: this.host,
        port: this.port
      };
    }

    const pos = res.positions || {};
    const absPos = pos.absolute || pos;

    return {
      connected: this.connected,
      driver: this.name,
      mode: CNC_MODES[res.mode] || `MODO_${res.mode}`,
      emergency: res.emergency === true,
      alarm: res.alarm === true,
      feedrate: res.feedrate || 0,
      spindleSpeed: res.spindleSpeed || 0,
      program: res.program || '---',
      partsCount: res.partsCount !== undefined ? res.partsCount : 0,
      totalParts: res.totalParts !== undefined ? res.totalParts : 0,
      positions: {
        X: absPos.X !== undefined ? absPos.X : 0.0,
        Y: absPos.Y !== undefined ? absPos.Y : 0.0,
        Z: absPos.Z !== undefined ? absPos.Z : 0.0,
        A: absPos.A !== undefined ? absPos.A : 0.0,
        absolute: pos.absolute || { X: 0, Y: 0, Z: 0, A: 0 },
        relative: pos.relative || { X: 0, Y: 0, Z: 0, A: 0 },
        machine: pos.machine || { X: 0, Y: 0, Z: 0, A: 0 },
        distance: pos.distance || { X: 0, Y: 0, Z: 0, A: 0 }
      },
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = FocasDllDriver;
