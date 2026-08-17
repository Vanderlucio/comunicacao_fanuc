/**
 * Nó Node-RED para Escrita de Parâmetros do CNC Fanuc (fanuc-param-write)
 * Desenvolvido por Vanderlucio Lopes
 */
const paramHelper = require('../lib/param_helper');

module.exports = function(RED) {
  function FanucParamWriteNode(n) {
    RED.nodes.createNode(this, n);
    this.connection = n.connection;
    this.connNode = RED.nodes.getNode(this.connection);
    this.name = n.name;
    this.paramNumber = Number(n.paramNumber || 5001);
    this.axis = Number(n.axis !== undefined ? n.axis : 0);
    this.valueSource = n.valueSource || 'msg'; // 'msg' ou 'config'
    this.staticValue = Number(n.staticValue || 0);

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

      const pNum = Number(msg.paramNumber !== undefined ? msg.paramNumber : (msg.param !== undefined ? msg.param : (msg.parameter !== undefined ? msg.parameter : this.paramNumber)));
      const axisNum = Number(msg.axis !== undefined ? msg.axis : this.axis);

      let valToWrite;
      if (this.valueSource === 'config') {
        valToWrite = this.staticValue;
      } else {
        valToWrite = msg.payload !== undefined ? msg.payload : (msg.value !== undefined ? msg.value : 0);
      }

      this.status({ fill: 'yellow', shape: 'dot', text: `Gravando #${pNum}...` });

      try {
        const result = await client.writeParameter(pNum, axisNum, valToWrite);
        const info = paramHelper.getParameterInfo(pNum);

        const outMsg = Object.assign({}, msg);
        outMsg.payload = {
          success: true,
          paramNumber: pNum,
          axis: axisNum,
          valueWritten: valToWrite,
          name: info.name,
          description: info.description,
          message: result.message || `Parâmetro #${pNum} gravado com sucesso.`,
          timestamp: new Date().toISOString()
        };

        this.status({
          fill: 'green',
          shape: 'dot',
          text: `#${pNum}${axisNum > 0 ? ' [Eixo ' + axisNum + ']' : ''} := ${valToWrite}`
        });

        if (send) {
          send(outMsg);
        } else {
          this.send(outMsg);
        }

        if (done) done();
      } catch (err) {
        this.status({ fill: 'red', shape: 'dot', text: `Erro: ${err.message.slice(0, 24)}` });
        this.error(`[fanuc-param-write] Erro ao escrever parâmetro #${pNum}: ${err.message}`, msg);
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

  RED.nodes.registerType('fanuc-param-write', FanucParamWriteNode);
};
