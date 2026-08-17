/**
 * FanucClient - Cliente Unificado para Comunicação com CNC e CLP (PMC) Fanuc
 */
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

const FocasTcpDriver = require('./drivers/focas_tcp_driver');
const FocasDllDriver = require('./drivers/focas_dll_driver');
const OpcUaDriver = require('./drivers/opcua_driver');

const {
  PMC_ADDRESS_TYPES,
  PMC_ADDRESS_NAMES,
  PMC_DATA_TYPES,
  parseAddressType,
  getAddressTypeName,
  parseDataType
} = require('./constants');

class FanucClient extends EventEmitter {
  constructor(config = null) {
    super();
    // Listener de erro padrão para evitar crash no Node.js caso o driver falhe ao conectar
    this.on('error', (err) => {
      // Evento de erro registrado
    });
    this.config = config || this.loadDefaultConfig();
    this.driver = null;
    this.initDriver();
  }

  /**
   * Carrega configuração do arquivo config.json
   */
  loadDefaultConfig() {
    const candidatePaths = [
      path.resolve(process.cwd(), 'config.json'),
      path.resolve(__dirname, '../config.json'),
      path.resolve(__dirname, '../../config.json')
    ];
    for (const configPath of candidatePaths) {
      if (fs.existsSync(configPath)) {
        try {
          const raw = fs.readFileSync(configPath, 'utf8');
          return JSON.parse(raw);
        } catch (e) {
          console.warn(`[FanucClient] Aviso: Não foi possível ler ${configPath}: ${e.message}.`);
        }
      }
    }
    return {
      connection: {
        driver: 'focas_dll',
        host: '169.254.214.5',
        port: 8193,
        focasPort: 8193,
        focasDllPath: 'Fwlib32.dll'
      }
    };
  }

  /**
   * Inicializa o driver de comunicação baseado na configuração
   */
  initDriver(driverType = null) {
    const type = (driverType || (this.config.connection && this.config.connection.driver) || 'opcua').toLowerCase();
    const connConfig = this.config.connection || {};

    if (this.driver && this.driver.isConnected()) {
      this.driver.disconnect();
    }

    switch (type) {
      case 'opcua':
      case 'opc':
      case 'opc_ua':
        this.driver = new OpcUaDriver(connConfig);
        break;

      case 'focas_tcp':
      case 'tcp':
      case 'ethernet':
        this.driver = new FocasTcpDriver(connConfig);
        break;

      case 'focas_dll':
      case 'dll':
      case 'fwlib':
        this.driver = new FocasDllDriver(connConfig);
        break;

      default:
        console.warn(`[FanucClient] Driver '${type}' desconhecido. Utilizando driver OPC UA (porta 4840).`);
        this.driver = new OpcUaDriver(connConfig);
    }

    // Repassa eventos do driver
    this.driver.on('connected', (data) => this.emit('connected', data));
    this.driver.on('disconnected', () => this.emit('disconnected'));
    this.driver.on('error', (err) => this.emit('error', err));
    this.driver.on('pmcWritten', (data) => this.emit('pmcWritten', data));
    this.driver.on('paramWritten', (data) => this.emit('paramWritten', data));

    return this.driver;
  }

  /**
   * Conecta ao CNC / CLP
   */
  async connect() {
    if (!this.driver) {
      this.initDriver();
    }
    return await this.driver.connect();
  }

  /**
   * Desconecta
   */
  async disconnect() {
    if (this.driver) {
      return await this.driver.disconnect();
    }
    return { success: true };
  }

  /**
   * Verifica se está conectado
   */
  isConnected() {
    return this.driver ? this.driver.isConnected() : false;
  }

  /**
   * Lê registradores do CLP (PMC)
   * @param {string|number} addressType Tipo de endereço (ex: 'R', 'D', 'X', 'Y', 'K', 'G', 'F')
   * @param {number} startAddress Endereço numérico inicial (ex: 1000)
   * @param {number} count Quantidade de elementos a ler
   * @param {string} dataType Tipo do dado ('Byte', 'Word', 'Long', 'Float')
   */
  async readPmc(addressType, startAddress, count = 1, dataType = 'Byte') {
    if (!this.isConnected()) {
      await this.connect();
    }

    const res = await this.driver.readPmc(addressType, Number(startAddress), Number(count), dataType);

    // Enriquece o resultado com decodificação binária se for Byte
    if (res.dataType === 'Byte' && res.values) {
      res.bits = res.values.map((byteVal, idx) => ({
        address: `${res.addressType}${res.startAddress + idx}`,
        byteValue: byteVal,
        binaryString: byteVal.toString(2).padStart(8, '0'),
        bits: this.decodeBits(byteVal)
      }));
    }

    return res;
  }

  /**
   * Escreve registradores no CLP (PMC)
   * @param {string|number} addressType Tipo de endereço (ex: 'R', 'D', 'X', 'Y', 'K')
   * @param {number} startAddress Endereço inicial
   * @param {number[]|number} values Valores a escrever
   * @param {string} dataType Tipo do dado ('Byte', 'Word', 'Long', 'Float')
   */
  async writePmc(addressType, startAddress, values, dataType = 'Byte') {
    if (!this.isConnected()) {
      await this.connect();
    }

    return await this.driver.writePmc(addressType, Number(startAddress), values, dataType);
  }

  /**
   * Lê um bit específico de um endereço de CLP (PMC)
   * @param {string} addressType Tipo de endereço (ex: 'R', 'X', 'Y')
   * @param {number} byteAddress Endereço do byte (ex: 0 para X0)
   * @param {number} bitIndex Índice do bit (0 a 7)
   */
  async readPmcBit(addressType, byteAddress, bitIndex) {
    if (bitIndex < 0 || bitIndex > 7) {
      throw new Error(`Índice de bit inválido: ${bitIndex}. Deve estar entre 0 e 7.`);
    }

    const res = await this.readPmc(addressType, byteAddress, 1, 'Byte');
    const byteVal = res.values[0] || 0;
    const bitValue = (byteVal & (1 << bitIndex)) !== 0 ? 1 : 0;

    return {
      address: `${res.addressType}${byteAddress}.${bitIndex}`,
      addressType: res.addressType,
      byteAddress,
      bitIndex,
      bitValue,
      byteValue: byteVal
    };
  }

  /**
   * Escreve um bit específico (0 ou 1) em um endereço do CLP (PMC)
   * @param {string} addressType Tipo de endereço (ex: 'R', 'Y', 'K')
   * @param {number} byteAddress Endereço do byte (ex: 0 para Y0)
   * @param {number} bitIndex Índice do bit (0 a 7)
   * @param {number|boolean} value 1 / true (Ligar) ou 0 / false (Desligar)
   */
  async writePmcBit(addressType, byteAddress, bitIndex, value) {
    if (bitIndex < 0 || bitIndex > 7) {
      throw new Error(`Índice de bit inválido: ${bitIndex}. Deve estar entre 0 e 7.`);
    }

    // Lê o byte atual para preservar os outros 7 bits
    const current = await this.readPmc(addressType, byteAddress, 1, 'Byte');
    let byteVal = current.values[0] || 0;

    const boolVal = (value === 1 || value === true || value === '1');
    if (boolVal) {
      byteVal |= (1 << bitIndex); // Seta o bit
    } else {
      byteVal &= ~(1 << bitIndex); // Limpa o bit
    }

    const writeRes = await this.writePmc(addressType, byteAddress, [byteVal], 'Byte');

    return {
      success: writeRes.success,
      address: `${current.addressType}${byteAddress}.${bitIndex}`,
      bitIndex,
      bitValue: boolVal ? 1 : 0,
      newByteValue: byteVal,
      message: `Bit ${current.addressType}${byteAddress}.${bitIndex} alterado para ${boolVal ? 1 : 0}`
    };
  }

  /**
   * Lê parâmetro do CNC
   * @param {number} paramNumber Número do parâmetro (ex: 5001)
   * @param {number} axis Eixo (0 para geral, 1 para X, 2 para Y, etc.)
   */
  async readParameter(paramNumber, axis = 0) {
    if (!this.isConnected()) {
      await this.connect();
    }
    return await this.driver.readParameter(Number(paramNumber), Number(axis));
  }

  /**
   * Escreve parâmetro no CNC
   * @param {number} paramNumber Número do parâmetro
   * @param {number} axis Eixo (0 para geral)
   * @param {any} value Novo valor
   */
  async writeParameter(paramNumber, axis = 0, value = 0) {
    if (!this.isConnected()) {
      await this.connect();
    }
    return await this.driver.writeParameter(Number(paramNumber), Number(axis), Number(value));
  }

  /**
   * Lê o status atual do CNC
   */
  async readStatus() {
    if (!this.driver) {
      this.initDriver();
    }
    if (!this.isConnected()) {
      try {
        await this.connect();
      } catch (e) {
        return {
          connected: false,
          driver: this.driver ? this.driver.name : 'OFFLINE',
          mode: 'OFFLINE',
          runStatus: 'DESCONECTADO',
          error: e.message,
          feedrate: '---',
          spindleSpeed: '---',
          positions: { X: '---', Y: '---', Z: '---', A: '---' },
          timestamp: new Date().toISOString()
        };
      }
    }
    try {
      return await this.driver.readStatus();
    } catch (e) {
      return {
        connected: false,
        driver: this.driver ? this.driver.name : 'OFFLINE',
        mode: 'OFFLINE',
        runStatus: 'DESCONECTADO',
        error: e.message,
        feedrate: '---',
        spindleSpeed: '---',
        positions: { X: '---', Y: '---', Z: '---', A: '---' },
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Decodifica um byte nos seus 8 bits individuais (0 a 7)
   */
  decodeBits(byteVal) {
    const bits = {};
    for (let i = 0; i < 8; i++) {
      bits[`bit${i}`] = (byteVal & (1 << i)) !== 0 ? 1 : 0;
    }
    return bits;
  }
}

module.exports = FanucClient;
