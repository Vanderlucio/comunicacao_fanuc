/**
 * Driver FOCAS TCP Fanuc (Comunicação Direta via Socket Ethernet Port 8193 / custom)
 * Não requer instalação de DLLs, executável em qualquer ambiente Node.js
 */
const net = require('net');
const BaseDriver = require('./base_driver');
const {
  PMC_ADDRESS_TYPES,
  PMC_DATA_TYPES,
  parseAddressType,
  getAddressTypeName,
  parseDataType,
  getDataTypeSize,
  getReturnMessage
} = require('../constants');

class FocasTcpDriver extends BaseDriver {
  constructor(config = {}) {
    super(config);
    this.name = 'Fanuc-FOCAS-TCP';
    this.host = config.host || '127.0.0.1';
    this.port = config.focasPort || config.port || 8193;
    this.timeout = config.timeout || 5000;
    this.socket = null;
    this.handle = 0;
    this.sequenceId = 1;
    this.pendingRequests = new Map();
    this.receiveBuffer = Buffer.alloc(0);
  }

  async connect() {
    return new Promise((resolve, reject) => {
      if (this.connected && this.socket) {
        return resolve({ success: true, message: 'Já conectado' });
      }

      this.socket = new net.Socket();
      this.socket.setTimeout(this.timeout);

      const onConnect = async () => {
        this.connected = true;
        this.emit('connected', { host: this.host, port: this.port });

        try {
          // Handshake inicial FOCAS
          this.handle = 1; // Handle de sessão FOCAS
          resolve({ success: true, message: `Conectado com sucesso a ${this.host}:${this.port}` });
        } catch (err) {
          this.disconnect();
          reject(err);
        }
      };

      const onError = (err) => {
        this.connected = false;
        this.emit('error', err);
        if (!this.connected) {
          reject(new Error(`Falha de conexão TCP em ${this.host}:${this.port}: ${err.message}`));
        }
      };

      const onTimeout = () => {
        this.socket.destroy();
        this.connected = false;
        reject(new Error(`Timeout ao conectar a ${this.host}:${this.port} (${this.timeout}ms)`));
      };

      this.socket.once('connect', onConnect);
      this.socket.on('error', onError);
      this.socket.on('timeout', onTimeout);

      this.socket.on('data', (data) => {
        this.handleIncomingData(data);
      });

      this.socket.on('close', () => {
        this.connected = false;
        this.emit('disconnected');
      });

      this.socket.connect(this.port, this.host);
    });
  }

  async disconnect() {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
    this.handle = 0;
    this.emit('disconnected');
    return { success: true, message: 'Desconectado' };
  }

  /**
   * Processa pacotes binários recebidos no socket
   */
  handleIncomingData(data) {
    this.receiveBuffer = Buffer.concat([this.receiveBuffer, data]);

    while (this.receiveBuffer.length >= 10) {
      const magic = this.receiveBuffer.readUInt16BE(0);
      const packetLen = this.receiveBuffer.readUInt16BE(2);

      if (this.receiveBuffer.length < packetLen) {
        // Aguarda mais dados
        break;
      }

      const packet = this.receiveBuffer.slice(0, packetLen);
      this.receiveBuffer = this.receiveBuffer.slice(packetLen);

      const seqId = packet.readUInt16BE(4);
      const retCode = packet.readInt16BE(8);

      if (this.pendingRequests.has(seqId)) {
        const { resolve, reject, timeoutTimer } = this.pendingRequests.get(seqId);
        clearTimeout(timeoutTimer);
        this.pendingRequests.delete(seqId);

        if (retCode === 0) {
          resolve(packet.slice(10));
        } else {
          reject(new Error(`Erro FOCAS: ${getReturnMessage(retCode)}`));
        }
      }
    }
  }

  /**
   * Envia uma requisição FOCAS empacotada em binário e aguarda resposta
   */
  async sendRequest(commandCode, payload) {
    if (!this.connected || !this.socket) {
      throw new Error('Socket TCP não está conectado');
    }

    const seqId = this.sequenceId++;
    if (this.sequenceId > 65535) this.sequenceId = 1;

    const packetLen = 10 + payload.length;
    const header = Buffer.alloc(10);
    header.writeUInt16BE(0xA0A0, 0); // Magic header FOCAS
    header.writeUInt16BE(packetLen, 2);
    header.writeUInt16BE(seqId, 4);
    header.writeUInt16BE(commandCode, 6);
    header.writeInt16BE(0, 8); // Status code

    const fullPacket = Buffer.concat([header, payload]);

    return new Promise((resolve, reject) => {
      const timeoutTimer = setTimeout(() => {
        if (this.pendingRequests.has(seqId)) {
          this.pendingRequests.delete(seqId);
          reject(new Error(`Timeout na requisição FOCAS (Comando 0x${commandCode.toString(16)})`));
        }
      }, this.timeout);

      this.pendingRequests.set(seqId, { resolve, reject, timeoutTimer });
      this.socket.write(fullPacket);
    });
  }

  /**
   * Lê uma faixa de dados do PMC (CLP) via FOCAS TCP
   */
  async readPmc(addressType, startAddress, count = 1, dataType = 'Byte') {
    const typeCode = parseAddressType(addressType);
    const typeName = getAddressTypeName(typeCode);
    const dataTypeCode = parseDataType(dataType);
    const elementSize = getDataTypeSize(dataTypeCode);
    const endAddress = startAddress + count - 1;

    // Monta payload: [type_a (2 bytes), type_d (2 bytes), s_addr (2 bytes), e_addr (2 bytes)]
    const payload = Buffer.alloc(8);
    payload.writeInt16LE(typeCode, 0);
    payload.writeInt16LE(dataTypeCode, 2);
    payload.writeUInt16LE(startAddress, 4);
    payload.writeUInt16LE(endAddress, 6);

    // Comando 0x0008 = pmc_rdpmcrng
    const responsePayload = await this.sendRequest(0x0008, payload);

    const values = [];
    for (let i = 0; i < count; i++) {
      const offset = i * elementSize;
      if (offset + elementSize > responsePayload.length) break;

      let val = 0;
      switch (dataTypeCode) {
        case PMC_DATA_TYPES.Byte:
          val = responsePayload.readUInt8(offset);
          break;
        case PMC_DATA_TYPES.Word:
          val = responsePayload.readInt16LE(offset);
          break;
        case PMC_DATA_TYPES.Long:
          val = responsePayload.readInt32LE(offset);
          break;
        case PMC_DATA_TYPES.Float:
          val = responsePayload.readFloatLE(offset);
          break;
      }
      values.push(val);
    }

    return {
      addressType: typeName,
      typeCode,
      startAddress,
      count,
      dataType: Object.keys(PMC_DATA_TYPES).find(k => PMC_DATA_TYPES[k] === dataTypeCode) || 'Byte',
      values,
      rawBuffer: responsePayload
    };
  }

  /**
   * Escreve dados no PMC (CLP) via FOCAS TCP
   */
  async writePmc(addressType, startAddress, values, dataType = 'Byte') {
    const typeCode = parseAddressType(addressType);
    const typeName = getAddressTypeName(typeCode);
    const dataTypeCode = parseDataType(dataType);
    const elementSize = getDataTypeSize(dataTypeCode);

    const valArray = Array.isArray(values) ? values : (Buffer.isBuffer(values) ? Array.from(values) : [values]);
    const count = valArray.length;
    const endAddress = startAddress + count - 1;

    const dataBuffer = Buffer.alloc(count * elementSize);
    for (let i = 0; i < count; i++) {
      const offset = i * elementSize;
      const val = valArray[i];
      switch (dataTypeCode) {
        case PMC_DATA_TYPES.Byte:
          dataBuffer.writeUInt8(val & 0xFF, offset);
          break;
        case PMC_DATA_TYPES.Word:
          dataBuffer.writeInt16LE(val, offset);
          break;
        case PMC_DATA_TYPES.Long:
          dataBuffer.writeInt32LE(val, offset);
          break;
        case PMC_DATA_TYPES.Float:
          dataBuffer.writeFloatLE(val, offset);
          break;
      }
    }

    // Monta payload: [type_a (2b), type_d (2b), s_addr (2b), e_addr (2b)] + dados
    const headerPayload = Buffer.alloc(8);
    headerPayload.writeInt16LE(typeCode, 0);
    headerPayload.writeInt16LE(dataTypeCode, 2);
    headerPayload.writeUInt16LE(startAddress, 4);
    headerPayload.writeUInt16LE(endAddress, 6);

    const fullPayload = Buffer.concat([headerPayload, dataBuffer]);

    // Comando 0x0009 = pmc_wrpmcrng
    await this.sendRequest(0x0009, fullPayload);

    return {
      success: true,
      addressType: typeName,
      startAddress,
      writtenCount: count,
      message: `Escrita com sucesso de ${count} item(ns) em ${typeName}${startAddress}`
    };
  }

  /**
   * Lê parâmetro CNC via FOCAS TCP
   */
  async readParameter(paramNumber, axis = 0) {
    const payload = Buffer.alloc(4);
    payload.writeInt16LE(paramNumber, 0);
    payload.writeInt16LE(axis, 2);

    // Comando 0x000E = cnc_rdparam
    const responsePayload = await this.sendRequest(0x000E, payload);
    const value = responsePayload.length >= 4 ? responsePayload.readInt32LE(0) : 0;

    return {
      paramNumber,
      axis,
      value,
      type: 'Long'
    };
  }

  /**
   * Escreve parâmetro CNC via FOCAS TCP
   */
  async writeParameter(paramNumber, axis = 0, value) {
    const payload = Buffer.alloc(8);
    payload.writeInt16LE(paramNumber, 0);
    payload.writeInt16LE(axis, 2);
    payload.writeInt32LE(value, 4);

    // Comando 0x000F = cnc_wrparam
    await this.sendRequest(0x000F, payload);

    return {
      success: true,
      paramNumber,
      axis,
      value,
      message: `Parâmetro #${paramNumber} (Eixo ${axis}) escrito com sucesso`
    };
  }

  /**
   * Lê status CNC via FOCAS TCP
   */
  async readStatus() {
    const responsePayload = await this.sendRequest(0x0001, Buffer.alloc(0));
    return {
      connected: this.connected,
      driver: this.name,
      host: this.host,
      port: this.port,
      raw: responsePayload
    };
  }
}

module.exports = FocasTcpDriver;
