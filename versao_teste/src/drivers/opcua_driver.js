/**
 * Driver OPC UA Fanuc (Comunicação via OPC UA na porta 4840 ou personalizada)
 * Ideal para integrar com CNCnetPDM, servidores OPC Fanuc ou pontes industriais
 */
const BaseDriver = require('./base_driver');
const {
  parseAddressType,
  getAddressTypeName,
  parseDataType
} = require('../constants');

class OpcUaDriver extends BaseDriver {
  constructor(config = {}) {
    super(config);
    this.name = 'Fanuc-OPC-UA';
    this.endpointUrl = config.opcuaEndpoint || `opc.tcp://${config.host || '127.0.0.1'}:${config.port || 4840}`;
    this.timeout = config.timeout || 5000;
    this.client = null;
    this.session = null;
    this.nodeOpcUa = null;
  }

  /**
   * Carrega a biblioteca node-opcua dinamicamente
   */
  loadOpcUaLib() {
    if (this.nodeOpcUa) return;
    try {
      this.nodeOpcUa = require('node-opcua');
    } catch (e) {
      throw new Error(`Pacote 'node-opcua' não está disponível: ${e.message}`);
    }
  }

  async connect() {
    this.loadOpcUaLib();

    const { OPCUAClient, SecurityPolicy, MessageSecurityMode } = this.nodeOpcUa;

    this.client = OPCUAClient.create({
      applicationName: 'NodeOPCUA-Client',
      connectionStrategy: {
        initialDelay: 1000,
        maxRetry: 1
      },
      securityMode: MessageSecurityMode ? MessageSecurityMode.None : 1,
      securityPolicy: SecurityPolicy ? SecurityPolicy.None : 'http://opcfoundation.org/UA/SecurityPolicy#None',
      endpointMustExist: false,
      timeout: this.timeout
    });

    try {
      await this.client.connect(this.endpointUrl);
      
      const username = this.config.username || 'OpcUaClient';
      const password = this.config.password || 'OpcUaClient';
      
      try {
        // Tenta conectar com usuário e senha configurados no CNCnetPDM.ini
        this.session = await this.client.createSession({
          userName: username,
          password: password
        });
      } catch (authErr) {
        // Fallback para acesso anônimo se permitido
        this.session = await this.client.createSession();
      }

      this.connected = true;
      this.emit('connected', { endpoint: this.endpointUrl });

      return {
        success: true,
        endpoint: this.endpointUrl,
        message: `Conectado com sucesso ao servidor OPC UA em ${this.endpointUrl}`
      };
    } catch (err) {
      this.connected = false;
      if (this.client) {
        try { await this.client.disconnect(); } catch (e) {}
      }
      throw new Error(`Falha ao conectar ao servidor OPC UA em ${this.endpointUrl}: ${err.message}`);
    }
  }

  async disconnect() {
    if (this.session) {
      try {
        await this.session.close();
      } catch (e) {}
      this.session = null;
    }
    if (this.client) {
      try {
        await this.client.disconnect();
      } catch (e) {}
      this.client = null;
    }
    this.connected = false;
    this.emit('disconnected');
    return { success: true, message: 'Desconectado do servidor OPC UA' };
  }

  /**
   * Constrói ou localiza o NodeId para uma tag PMC
   */
  resolveNodeId(addressType, address) {
    const typeName = typeof addressType === 'string' ? addressType.toUpperCase() : getAddressTypeName(addressType);
    // Padrões comuns em servidores OPC Fanuc: "ns=2;s=PMC.R1000" ou "ns=1;s=R1000" ou "ns=2;s=Fanuc.PMC.R.1000"
    return `ns=2;s=PMC.${typeName}${address}`;
  }

  async readPmc(addressType, startAddress, count = 1, dataType = 'Byte') {
    if (!this.connected || !this.session) {
      throw new Error('Sessão OPC UA não está conectada');
    }

    const { AttributeIds } = this.nodeOpcUa;
    const typeCode = parseAddressType(addressType);
    const typeName = getAddressTypeName(typeCode);
    const values = [];

    for (let i = 0; i < count; i++) {
      const currentAddress = startAddress + i;
      const nodeId = this.resolveNodeId(typeName, currentAddress);

      try {
        const dataValue = await this.session.read({
          nodeId,
          attributeId: AttributeIds.Value
        });

        if (dataValue.statusCode && dataValue.statusCode.name === 'Good') {
          values.push(dataValue.value.value);
        } else {
          // Fallback para valor numérico ou 0 se nó não encontrado
          values.push(dataValue.value ? dataValue.value.value : 0);
        }
      } catch (e) {
        values.push(0);
      }
    }

    return {
      addressType: typeName,
      typeCode,
      startAddress,
      count,
      dataType,
      values,
      rawBuffer: Buffer.from(values)
    };
  }

  async writePmc(addressType, startAddress, values, dataType = 'Byte') {
    if (!this.connected || !this.session) {
      throw new Error('Sessão OPC UA não está conectada');
    }

    const { DataType, Variant } = this.nodeOpcUa;
    const typeCode = parseAddressType(addressType);
    const typeName = getAddressTypeName(typeCode);
    const valArray = Array.isArray(values) ? values : [values];

    let opcDataType = DataType.Byte;
    if (dataType === 'Word' || dataType === 1) opcDataType = DataType.Int16;
    else if (dataType === 'Long' || dataType === 2) opcDataType = DataType.Int32;
    else if (dataType === 'Float' || dataType === 3) opcDataType = DataType.Float;

    const nodesToWrite = valArray.map((val, idx) => {
      const currentAddr = startAddress + idx;
      const nodeId = this.resolveNodeId(typeName, currentAddr);
      return {
        nodeId,
        attributeId: this.nodeOpcUa.AttributeIds.Value,
        value: {
          value: new Variant({ dataType: opcDataType, value: val })
        }
      };
    });

    const statusCodes = await this.session.write(nodesToWrite);
    const allGood = statusCodes.every(st => st.name === 'Good');

    return {
      success: allGood,
      addressType: typeName,
      startAddress,
      writtenCount: valArray.length,
      statusCodes: statusCodes.map(s => s.name),
      message: allGood ? `Escrita OPC UA concluída com sucesso em ${typeName}${startAddress}` : 'Escrita OPC UA com avisos nos nós'
    };
  }

  async readParameter(paramNumber, axis = 0) {
    if (!this.connected || !this.session) throw new Error('Sessão OPC UA não está conectada');

    const nodeId = `ns=2;s=CNC.Parameter.${paramNumber}.${axis}`;
    try {
      const dataValue = await this.session.read({
        nodeId,
        attributeId: this.nodeOpcUa.AttributeIds.Value
      });
      return {
        paramNumber,
        axis,
        value: dataValue.value ? dataValue.value.value : 0,
        type: 'Long'
      };
    } catch (e) {
      return { paramNumber, axis, value: 0, type: 'Long', error: e.message };
    }
  }

  async writeParameter(paramNumber, axis = 0, value = 0) {
    if (!this.connected || !this.session) throw new Error('Sessão OPC UA não está conectada');

    const { DataType, Variant } = this.nodeOpcUa;
    const nodeId = `ns=2;s=CNC.Parameter.${paramNumber}.${axis}`;

    const statusCode = await this.session.write({
      nodeId,
      attributeId: this.nodeOpcUa.AttributeIds.Value,
      value: {
        value: new Variant({ dataType: DataType.Int32, value: Number(value) })
      }
    });

    return {
      success: statusCode.name === 'Good',
      paramNumber,
      axis,
      value,
      message: `Escrita do parâmetro #${paramNumber} via OPC UA: ${statusCode.name}`
    };
  }

  async readStatus() {
    if (!this.connected || !this.session) {
      return {
        connected: false,
        driver: this.name,
        endpoint: this.endpointUrl,
        mode: 'OFFLINE',
        runStatus: 'DESCONECTADO',
        feedrate: '---',
        spindleSpeed: '---',
        positions: { X: '---', Y: '---', Z: '---', A: '---' },
        timestamp: new Date().toISOString()
      };
    }

    try {
      const { AttributeIds } = this.nodeOpcUa;
      
      const nodes = [
        { key: 'mode', nodeId: 'ns=1;s=/1000/MODET' },
        { key: 'runStatus', nodeId: 'ns=1;s=/1000/STATT' },
        { key: 'feedrate', nodeId: 'ns=1;s=/1000/FEEDR' },
        { key: 'spindleSpeed', nodeId: 'ns=1;s=/1000/SPSPD' },
        { key: 'axes', nodeId: 'ns=1;s=/1000/AX1' },
        { key: 'partsCount', nodeId: 'ns=1;s=/1000/COMP_QTY' },
        { key: 'program', nodeId: 'ns=1;s=/1000/PRGMN' },
        { key: 'alarmState', nodeId: 'ns=1;s=/1000/ALMST' },
        { key: 'alarmText', nodeId: 'ns=1;s=/1000/ALMTX' }
      ];

      const readRequests = nodes.map(n => ({
        nodeId: n.nodeId,
        attributeId: AttributeIds.Value
      }));

      const dataValues = await this.session.read(readRequests);
      
      const rawData = {};
      nodes.forEach((n, idx) => {
        const dv = dataValues[idx];
        rawData[n.key] = dv && dv.value ? dv.value.value : null;
      });

      // Parse eixos X, Y, Z, A da string "0.000 0.000 0.000 0.000"
      let posX = 0.000, posY = 0.000, posZ = 0.000, posA = 0.000;
      if (typeof rawData.axes === 'string') {
        const parts = rawData.axes.trim().split(/\s+/).map(Number);
        if (parts.length >= 1 && !isNaN(parts[0])) posX = parts[0];
        if (parts.length >= 2 && !isNaN(parts[1])) posY = parts[1];
        if (parts.length >= 3 && !isNaN(parts[2])) posZ = parts[2];
        if (parts.length >= 4 && !isNaN(parts[3])) posA = parts[3];
      }

      return {
        connected: true,
        driver: this.name,
        endpoint: this.endpointUrl,
        mode: rawData.mode || 'AUTO',
        runStatus: rawData.runStatus || 'CONECTADO',
        feedrate: rawData.feedrate !== null ? Number(rawData.feedrate) : 0,
        spindleSpeed: rawData.spindleSpeed !== null ? Number(rawData.spindleSpeed) : 0,
        partsCount: rawData.partsCount !== null ? Number(rawData.partsCount) : 0,
        program: rawData.program !== null ? String(rawData.program) : '---',
        alarm: rawData.alarmState !== null && Number(rawData.alarmState) !== 0,
        alarmText: rawData.alarmText || 'Sem alarmes',
        positions: {
          X: posX,
          Y: posY,
          Z: posZ,
          A: posA
        },
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      return {
        connected: true,
        driver: this.name,
        endpoint: this.endpointUrl,
        error: err.message,
        mode: 'OPC_UA',
        runStatus: 'CONECTADO',
        feedrate: 0,
        spindleSpeed: 0,
        positions: { X: 0.000, Y: 0.000, Z: 0.000, A: 0.000 },
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = OpcUaDriver;
