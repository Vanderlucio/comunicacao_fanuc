/**
 * Nó Node-RED para Execução Dinâmica / Customizada Fanuc (fanuc-custom)
 * Desenvolvido por Vanderlucio Lopes
 */
const { parseAddressString } = require('../lib/constants');

module.exports = function(RED) {
  function FanucCustomNode(n) {
    RED.nodes.createNode(this, n);
    this.connection = n.connection;
    this.connNode = RED.nodes.getNode(this.connection);
    this.name = n.name;
    this.defaultAction = n.defaultAction || 'readPmc';

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
      const action = (msg.action || msg.topic || this.defaultAction || 'readPmc').toLowerCase();

      this.status({ fill: 'yellow', shape: 'dot', text: `Executando ${action}...` });

      try {
        let result;
        const outMsg = Object.assign({}, msg);

        switch (action) {
          case 'readpmc':
          case 'read_pmc': {
            const addr = msg.address || 'R1000';
            const parsed = parseAddressString(addr);
            const addrType = (msg.addressType || (parsed ? parsed.addressType : 'R')).toUpperCase();
            const startAddr = msg.startAddress !== undefined ? Number(msg.startAddress) : (parsed ? parsed.byteAddress : 1000);
            const count = Number(msg.count || 1);
            const dType = msg.dataType || 'Byte';

            if (parsed && parsed.isBit) {
              result = await client.readPmcBit(addrType, startAddr, parsed.bitIndex);
            } else {
              result = await client.readPmc(addrType, startAddr, count, dType);
            }
            break;
          }

          case 'writepmc':
          case 'write_pmc': {
            const addr = msg.address || 'R1000';
            const parsed = parseAddressString(addr);
            const addrType = (msg.addressType || (parsed ? parsed.addressType : 'R')).toUpperCase();
            const startAddr = msg.startAddress !== undefined ? Number(msg.startAddress) : (parsed ? parsed.byteAddress : 1000);
            const dType = msg.dataType || 'Byte';
            const val = msg.payload !== undefined ? msg.payload : (msg.value !== undefined ? msg.value : msg.values);

            if (parsed && parsed.isBit) {
              const bitVal = (val === 1 || val === true || val === '1' || val === 'true');
              result = await client.writePmcBit(addrType, startAddr, parsed.bitIndex, bitVal ? 1 : 0);
            } else {
              const valuesArray = Array.isArray(val) ? val : [Number(val)];
              result = await client.writePmc(addrType, startAddr, valuesArray, dType);
            }
            break;
          }

          case 'readbit':
          case 'read_bit':
          case 'readpmcbit': {
            const addrType = (msg.addressType || 'R').toUpperCase();
            const byteAddr = Number(msg.byteAddress !== undefined ? msg.byteAddress : (msg.startAddress || 1000));
            const bitIdx = Number(msg.bitIndex !== undefined ? msg.bitIndex : 0);
            result = await client.readPmcBit(addrType, byteAddr, bitIdx);
            break;
          }

          case 'writebit':
          case 'write_bit':
          case 'writepmcbit': {
            const addrType = (msg.addressType || 'R').toUpperCase();
            const byteAddr = Number(msg.byteAddress !== undefined ? msg.byteAddress : (msg.startAddress || 1000));
            const bitIdx = Number(msg.bitIndex !== undefined ? msg.bitIndex : 0);
            const val = msg.payload !== undefined ? msg.payload : (msg.value !== undefined ? msg.value : 1);
            result = await client.writePmcBit(addrType, byteAddr, bitIdx, val);
            break;
          }

          case 'readparam':
          case 'read_param':
          case 'readparameter': {
            const pNum = Number(msg.paramNumber !== undefined ? msg.paramNumber : (msg.param || 5001));
            const axis = Number(msg.axis || 0);
            result = await client.readParameter(pNum, axis);
            break;
          }

          case 'writeparam':
          case 'write_param':
          case 'writeparameter': {
            const pNum = Number(msg.paramNumber !== undefined ? msg.paramNumber : (msg.param || 5001));
            const axis = Number(msg.axis || 0);
            const val = Number(msg.payload !== undefined ? msg.payload : (msg.value !== undefined ? msg.value : 0));
            result = await client.writeParameter(pNum, axis, val);
            break;
          }

          case 'readstatus':
          case 'read_status':
          case 'status': {
            result = await client.readStatus();
            break;
          }

          case 'connect': {
            result = await client.connect();
            break;
          }

          case 'disconnect': {
            result = await client.disconnect();
            break;
          }

          default:
            throw new Error(`Ação '${action}' desconhecida. Ações suportadas: readPmc, writePmc, readBit, writeBit, readParam, writeParam, readStatus, connect, disconnect.`);
        }

        outMsg.payload = result;
        outMsg.fanuc = {
          action,
          driver: client.driver ? client.driver.name : this.connNode.driver,
          timestamp: new Date().toISOString()
        };

        this.status({ fill: 'green', shape: 'dot', text: `${action} OK` });

        if (send) {
          send(outMsg);
        } else {
          this.send(outMsg);
        }

        if (done) done();
      } catch (err) {
        this.status({ fill: 'red', shape: 'dot', text: `Erro: ${err.message.slice(0, 24)}` });
        this.error(`[fanuc-custom] Erro na execução de '${action}': ${err.message}`, msg);
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

  RED.nodes.registerType('fanuc-custom', FanucCustomNode);
};
