/**
 * Nó Node-RED para Escrita no CLP (PMC) Fanuc (fanuc-pmc-write)
 * Desenvolvido por Vanderlucio Lopes
 */
const { parseAddressString, parseAddressType, parseDataType } = require('../lib/constants');

module.exports = function(RED) {
  function FanucPmcWriteNode(n) {
    RED.nodes.createNode(this, n);
    this.connection = n.connection;
    this.connNode = RED.nodes.getNode(this.connection);
    this.name = n.name;
    this.writeMode = n.writeMode || 'range'; // 'range' ou 'bit'
    this.addressType = n.addressType || 'R';
    this.startAddress = Number(n.startAddress || 1000);
    this.dataType = n.dataType || 'Byte';
    this.bitIndex = Number(n.bitIndex !== undefined ? n.bitIndex : 0);
    this.valueSource = n.valueSource || 'msg'; // 'msg' ou 'config'
    this.staticValue = n.staticValue || '0';

    if (this.connNode) {
      this.connNode.registerSubscriber(this);
    } else {
      this.status({ fill: 'red', shape: 'ring', text: 'Sem conexão configurada' });
    }

    this.on('input', async (msg, send, done) => {
      if (!this.connNode || !this.connNode.client) {
        this.status({ fill: 'red', shape: 'ring', text: 'Não configurado' });
        if (done) done(new Error('Nó de conexão Fanuc não configurado.'));
        return;
      }

      const client = this.connNode.client;

      // Resolução de parâmetros
      let addrType = (msg.addressType || this.addressType || 'R').toUpperCase();
      let startAddr = msg.startAddress !== undefined ? Number(msg.startAddress) : this.startAddress;
      let dType = msg.dataType || this.dataType || 'Byte';
      let bitIdx = msg.bitIndex !== undefined ? Number(msg.bitIndex) : this.bitIndex;
      let isBitMode = this.writeMode === 'bit';

      // Análise de endereço dinâmico (ex: msg.address = "Y0.2" ou "R1000")
      if (msg.address) {
        const parsed = parseAddressString(msg.address);
        if (parsed) {
          addrType = parsed.addressType;
          startAddr = parsed.byteAddress;
          if (parsed.isBit) {
            isBitMode = true;
            bitIdx = parsed.bitIndex;
          }
        }
      }

      // Determinação do valor a ser escrito
      let valToWrite;
      if (this.valueSource === 'config') {
        valToWrite = this.staticValue;
      } else {
        valToWrite = msg.payload !== undefined ? msg.payload : (msg.value !== undefined ? msg.value : msg.values);
      }

      this.status({ fill: 'yellow', shape: 'dot', text: `Gravando ${addrType}${startAddr}...` });

      try {
        let result;
        if (isBitMode) {
          const bitVal = (valToWrite === 1 || valToWrite === true || valToWrite === '1' || valToWrite === 'true');
          result = await client.writePmcBit(addrType, startAddr, bitIdx, bitVal ? 1 : 0);
        } else {
          let valuesArray;
          if (Array.isArray(valToWrite)) {
            valuesArray = valToWrite.map(Number);
          } else if (typeof valToWrite === 'string' && valToWrite.includes(',')) {
            valuesArray = valToWrite.split(',').map(s => Number(s.trim()));
          } else {
            valuesArray = [Number(valToWrite)];
          }
          result = await client.writePmc(addrType, startAddr, valuesArray, dType);
        }

        const outMsg = Object.assign({}, msg);
        outMsg.payload = result;
        outMsg.fanuc = {
          driver: client.driver ? client.driver.name : this.connNode.driver,
          addressType: addrType,
          address: isBitMode ? `${addrType}${startAddr}.${bitIdx}` : `${addrType}${startAddr}`,
          isBitMode,
          valueWritten: valToWrite,
          timestamp: new Date().toISOString()
        };

        this.status({
          fill: 'green',
          shape: 'dot',
          text: isBitMode
            ? `${addrType}${startAddr}.${bitIdx} := ${valToWrite ? 1 : 0}`
            : `${addrType}${startAddr} := ${JSON.stringify(valToWrite)}`
        });

        if (send) {
          send(outMsg);
        } else {
          this.send(outMsg);
        }

        if (done) done();
      } catch (err) {
        this.status({ fill: 'red', shape: 'dot', text: `Erro: ${err.message.slice(0, 24)}` });
        this.error(`[fanuc-pmc-write] Erro ao escrever PMC: ${err.message}`, msg);
        if (done) done(err);
      }
    });

    this.on('close', (removed, done) => {
      if (this.connNode) {
        this.connNode.unregisterSubscriber(this);
      }
      if (typeof done === 'function') {
        done();
      }
    });
  }

  RED.nodes.registerType('fanuc-pmc-write', FanucPmcWriteNode);
};
