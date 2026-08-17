/**
 * Driver Fanuc FOCAS DLL Nativo (Fwlib32.dll / FWLIB64.dll)
 * Executa chamadas nativas oficiais Fanuc em 32-bit via Bridge nativo ultrarrápido
 * Módulo para Node-RED (node-red-contrib-fanuc)
 * Desenvolvido por Vanderlucio Lopes
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
    this.port = Number(config.focasPort || config.port || 8193);
    this.timeout = Math.floor((config.timeout || 5000) / 1000);
    this.process = null;
    this.rl = null;
    this.pendingCallbacks = [];
    this.flibHandle = 0;
  }

  /**
   * Localiza o caminho do executável do bridge
   */
  findBridgeExecutable() {
    const candidatePaths = [
      path.resolve(__dirname, '..', '..', 'fanuc_bridge32.exe'),
      path.resolve(process.cwd(), 'fanuc_bridge32.exe'),
      path.resolve(process.cwd(), 'versao_nodered', 'fanuc_bridge32.exe'),
      path.resolve(__dirname, '..', '..', '..', 'fanuc_bridge32.exe')
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    return candidatePaths[0];
  }

  /**
   * Inicia o processo bridge 32-bit nativo para Fwlib32.dll
   */
  startBridgeProcess() {
    if (this.process) return;

    const bridgePath = this.findBridgeExecutable();
    const bridgeDir = path.dirname(bridgePath);

    if (!fs.existsSync(bridgePath)) {
      throw new Error(`Arquivo 'fanuc_bridge32.exe' não encontrado em ${bridgePath}`);
    }

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
   * Envia comando JSON para o processo bridge e aguarda resposta
   */
  async sendBridgeCommand(cmdObj) {
    if (!this.process) {
      this.startBridgeProcess();
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.pendingCallbacks.findIndex(cb => cb.resolve === resolve);
        if (idx !== -1) {
          this.pendingCallbacks.splice(idx, 1);
        }
        reject(new Error(`Timeout (${(this.timeout + 2) * 1000}ms) aguardando resposta da DLL Fwlib32 (Cmd: ${cmdObj.cmd})`));
      }, (this.timeout + 2) * 1000);

      this.pendingCallbacks.push({
        resolve: (data) => {
          clearTimeout(timer);
          resolve(data);
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
        reject(err);
      }
    });
  }

  async connect() {
    try {
      this.startBridgeProcess();

      const res = await this.sendBridgeCommand({
        cmd: 'connect',
        ip: this.host,
        port: this.port,
        timeout: this.timeout
      });

      if (res.status === 'ok') {
        this.connected = true;
        this.flibHandle = res.flibHndl || 1;
        this.emit('connected', { host: this.host, port: this.port, handle: this.flibHandle });
        return { success: true, handle: this.flibHandle, message: `Conectado via Fwlib32 DLL a ${this.host}:${this.port}` };
      } else {
        this.connected = false;
        throw new Error(res.message || `Erro FOCAS: ${res.ret}`);
      }
    } catch (err) {
      this.connected = false;
      throw new Error(`Falha ao conectar via Fwlib32 DLL em ${this.host}:${this.port}: ${err.message}`);
    }
  }

  async disconnect() {
    if (this.process && this.connected) {
      try {
        await this.sendBridgeCommand({ cmd: 'disconnect' });
      } catch (e) {}
    }

    if (this.process) {
      try {
        this.process.kill();
      } catch (e) {}
      this.process = null;
      this.rl = null;
    }

    this.connected = false;
    this.flibHandle = 0;
    this.emit('disconnected');
    return { success: true, message: 'Desconectado da DLL' };
  }

  /**
   * Lê registradores do PMC via DLL Fwlib32
   */
  async readPmc(addressType, startAddress, count = 1, dataType = 'Byte') {
    const typeCode = parseAddressType(addressType);
    const typeName = getAddressTypeName(typeCode);
    const dtCode = parseDataType(dataType);

    if (!this.connected) {
      await this.connect();
    }

    const res = await this.sendBridgeCommand({
      cmd: 'read_pmc',
      address_type: typeCode,
      data_type: dtCode,
      start: Number(startAddress),
      end: Number(startAddress) + Number(count) - 1
    });

    if (res.status === 'ok') {
      return {
        addressType: typeName,
        typeCode,
        startAddress: Number(startAddress),
        endAddress: Number(startAddress) + Number(count) - 1,
        count: Number(count),
        dataType: Object.keys(PMC_DATA_TYPES).find(k => PMC_DATA_TYPES[k] === dtCode) || 'Byte',
        values: res.values || [],
        rawBuffer: Buffer.from(res.values || []),
        timestamp: new Date().toISOString()
      };
    } else {
      throw new Error(`Erro Fwlib32 ao ler PMC (${typeName}${startAddress}): ${res.message || res.ret}`);
    }
  }

  /**
   * Escreve registradores no PMC via DLL Fwlib32
   */
  async writePmc(addressType, startAddress, values, dataType = 'Byte') {
    const typeCode = parseAddressType(addressType);
    const typeName = getAddressTypeName(typeCode);
    const dtCode = parseDataType(dataType);
    const valArr = Array.isArray(values) ? values : [values];

    if (!this.connected) {
      await this.connect();
    }

    const res = await this.sendBridgeCommand({
      cmd: 'write_pmc',
      address_type: typeCode,
      data_type: dtCode,
      start: Number(startAddress),
      values: valArr
    });

    if (res.status === 'ok') {
      this.emit('pmcWritten', { addressType: typeName, startAddress, count: valArr.length, values: valArr });
      return {
        success: true,
        addressType: typeName,
        startAddress,
        writtenCount: valArr.length,
        values: valArr,
        message: `Sucesso: ${valArr.length} elemento(s) gravado(s) em ${typeName}${startAddress} via Fwlib32`,
        timestamp: new Date().toISOString()
      };
    } else {
      throw new Error(`Erro Fwlib32 ao escrever PMC (${typeName}${startAddress}): ${res.message || res.ret}`);
    }
  }

  /**
   * Lê parâmetro do CNC via DLL Fwlib32
   */
  async readParameter(paramNumber, axis = 0) {
    if (!this.connected) {
      await this.connect();
    }

    const res = await this.sendBridgeCommand({
      cmd: 'read_param',
      param_num: Number(paramNumber),
      axis: Number(axis)
    });

    if (res.status === 'ok') {
      return {
        paramNumber: Number(paramNumber),
        axis: Number(axis),
        value: res.value,
        type: res.data_type || 'Long',
        timestamp: new Date().toISOString()
      };
    } else {
      throw new Error(`Erro Fwlib32 ao ler parâmetro #${paramNumber}: ${res.message || res.ret}`);
    }
  }

  /**
   * Escreve parâmetro no CNC via DLL Fwlib32
   */
  async writeParameter(paramNumber, axis = 0, value = 0) {
    if (!this.connected) {
      await this.connect();
    }

    const res = await this.sendBridgeCommand({
      cmd: 'write_param',
      param_num: Number(paramNumber),
      axis: Number(axis),
      value: Number(value)
    });

    if (res.status === 'ok') {
      this.emit('paramWritten', { paramNumber, axis, value });
      return {
        success: true,
        paramNumber,
        axis,
        value,
        message: `Parâmetro #${paramNumber} (Eixo ${axis}) gravado via Fwlib32 com valor ${value}`,
        timestamp: new Date().toISOString()
      };
    } else {
      throw new Error(`Erro Fwlib32 ao escrever parâmetro #${paramNumber}: ${res.message || res.ret}`);
    }
  }

  /**
   * Lê status completo do CNC via DLL Fwlib32
   */
  async readStatus() {
    if (!this.connected) {
      await this.connect();
    }

    const res = await this.sendBridgeCommand({ cmd: 'read_status' });

    if (res.status === 'ok') {
      return {
        connected: true,
        driver: this.name,
        host: this.host,
        port: this.port,
        mode: CNC_MODES[res.aut] || `Modo ${res.aut}`,
        runStatus: CNC_RUN_STATUS[res.run] || `Status ${res.run}`,
        motion: res.motion === 1 ? 'Em Movimento' : 'Parado',
        emergency: res.emergency === 1 ? 'EMERGÊNCIA ATIVA' : 'Normal',
        alarm: res.alarm === 1 ? 'ALARME ATIVO' : 'Sem Alarme',
        feedrate: res.actf || 0,
        spindleSpeed: res.acts || 0,
        positions: res.positions || { X: 0, Y: 0, Z: 0, A: 0 },
        timestamp: new Date().toISOString()
      };
    } else {
      throw new Error(`Erro Fwlib32 ao ler status: ${res.message || res.ret}`);
    }
  }
}

module.exports = FocasDllDriver;
