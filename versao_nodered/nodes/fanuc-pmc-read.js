/**
 * Nó Node-RED para Leitura do CLP (PMC) Fanuc (fanuc-pmc-read)
 * Desenvolvido por Vanderlucio Lopes
 */
const { parseAddressString, parseAddressType, parseDataType } = require('../lib/constants');

module.exports = function(RED) {
  function FanucPmcReadNode(n) {
    RED.nodes.createNode(this, n);
    this.connection = n.connection;
    this.connNode = RED.nodes.getNode(this.connection);
    this.name = n.name;
    this.readMode = n.readMode || 'range'; // 'range' ou 'bit'
    this.addressType = n.addressType || 'R';
    this.startAddress = Number(n.startAddress || 1000);
    this.count = Number(n.count || 1);
    this.dataType = n.dataType || 'Byte';
    this.bitIndex = Number(n.bitIndex !== undefined ? n.bitIndex : 0);
    this.formattedAddress = n.formattedAddress || '';
    this.triggerMode = n.triggerMode || 'input'; // 'input' ou 'interval'
    this.interval = Number(n.interval || 1000);
    this.outputFormat = n.outputFormat || 'full'; // 'full' ou 'valueOnly'

    this.pollTimer = null;

    if (this.connNode) {
      this.connNode.registerSubscriber(this);
    } else {
      this.status({ fill: 'red', shape: 'ring', text: 'Sem conexão configurada' });
    }

    const performRead = async (msg = {}, send = null, done = null) => {
      if (!this.connNode || !this.connNode.client) {
        this.status({ fill: 'red', shape: 'ring', text: 'Não configurado' });
        if (done) done(new Error('Nó de conexão Fanuc não encontrado.'));
        return;
      }

      const client = this.connNode.client;

      // Suporte a sobrescrita dinâmica por msg
      let addrType = (msg.addressType || this.addressType || 'R').toUpperCase();
      let startAddr = msg.startAddress !== undefined ? Number(msg.startAddress) : this.startAddress;
      let count = msg.count !== undefined ? Number(msg.count) : this.count;
      let dType = msg.dataType || this.dataType || 'Byte';
      let bitIdx = msg.bitIndex !== undefined ? Number(msg.bitIndex) : this.bitIndex;
      let isBitMode = this.readMode === 'bit';

      // Análise de endereço string (ex: msg.address = "R1000.2" ou "X0.0")
      if (msg.address || (this.formattedAddress && this.formattedAddress.trim() !== '')) {
        const addrStr = msg.address || this.formattedAddress;
        const parsed = parseAddressString(addrStr);
        if (parsed) {
          addrType = parsed.addressType;
          startAddr = parsed.byteAddress;
          if (parsed.isBit) {
            isBitMode = true;
            bitIdx = parsed.bitIndex;
          }
        }
      }

      this.status({ fill: 'yellow', shape: 'dot', text: `Lendo ${addrType}${startAddr}${isBitMode ? '.' + bitIdx : ''}...` });

      try {
        let result;
        if (isBitMode) {
          result = await client.readPmcBit(addrType, startAddr, bitIdx);
        } else {
          result = await client.readPmc(addrType, startAddr, count, dType);
        }

        const outMsg = Object.assign({}, msg);
        outMsg.fanuc = {
          driver: client.driver ? client.driver.name : this.connNode.driver,
          addressType: addrType,
          address: isBitMode ? `${addrType}${startAddr}.${bitIdx}` : `${addrType}${startAddr}`,
          startAddress: startAddr,
          count: isBitMode ? 1 : count,
          dataType: isBitMode ? 'Bit' : dType,
          timestamp: new Date().toISOString()
        };

        if (this.outputFormat === 'valueOnly') {
          if (isBitMode) {
            outMsg.payload = result.bitValue;
          } else {
            outMsg.payload = count === 1 && result.values ? result.values[0] : result.values;
          }
        } else {
          outMsg.payload = result;
        }

        this.status({
          fill: 'green',
          shape: 'dot',
          text: isBitMode
            ? `${addrType}${startAddr}.${bitIdx} = ${result.bitValue}`
            : `${addrType}${startAddr}[${count}] = ${JSON.stringify(result.values ? (count === 1 ? result.values[0] : result.values) : '')}`
        });

        if (send) {
          send(outMsg);
        } else {
          this.send(outMsg);
        }

        if (done) done();
      } catch (err) {
        this.status({ fill: 'red', shape: 'dot', text: `Erro: ${err.message.slice(0, 24)}` });
        this.error(`[fanuc-pmc-read] Erro ao ler PMC: ${err.message}`, msg);
        if (done) done(err);
      }
    };

    // Modo Intervalo (Polling contínuo)
    if (this.triggerMode === 'interval' && this.interval >= 100) {
      this.pollTimer = setInterval(() => {
        performRead();
      }, this.interval);
    }

    // Processamento de mensagens de entrada
    this.on('input', (msg, send, done) => {
      performRead(msg, send, done);
    });

    this.on('close', (removed, done) => {
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
      if (this.connNode) {
        this.connNode.unregisterSubscriber(this);
      }
      if (typeof done === 'function') {
        done();
      }
    });
  }

  RED.nodes.registerType('fanuc-pmc-read', FanucPmcReadNode);
};
