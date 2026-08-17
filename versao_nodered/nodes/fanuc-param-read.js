/**
 * Nó Node-RED para Leitura de Parâmetros do CNC Fanuc (fanuc-param-read)
 * Desenvolvido por Vanderlucio Lopes
 */
const paramHelper = require('../lib/param_helper');

module.exports = function(RED) {
  function FanucParamReadNode(n) {
    RED.nodes.createNode(this, n);
    this.connection = n.connection;
    this.connNode = RED.nodes.getNode(this.connection);
    this.name = n.name;
    this.paramNumber = Number(n.paramNumber || 5001);
    this.axis = Number(n.axis !== undefined ? n.axis : 0);
    this.triggerMode = n.triggerMode || 'input'; // 'input' ou 'interval'
    this.interval = Number(n.interval || 2000);

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

      const pNum = Number(msg.paramNumber !== undefined ? msg.paramNumber : (msg.param !== undefined ? msg.param : (msg.parameter !== undefined ? msg.parameter : this.paramNumber)));
      const axisNum = Number(msg.axis !== undefined ? msg.axis : this.axis);

      this.status({ fill: 'yellow', shape: 'dot', text: `Lendo Parâmetro #${pNum}...` });

      try {
        const result = await client.readParameter(pNum, axisNum);
        const info = paramHelper.getParameterInfo(pNum);

        const outMsg = Object.assign({}, msg);
        outMsg.payload = {
          paramNumber: pNum,
          axis: axisNum,
          value: result.value,
          name: info.name,
          description: info.description,
          category: info.category,
          timestamp: new Date().toISOString()
        };

        outMsg.fanuc = {
          driver: client.driver ? client.driver.name : this.connNode.driver,
          type: 'parameter',
          paramNumber: pNum,
          axis: axisNum
        };

        this.status({
          fill: 'green',
          shape: 'dot',
          text: `#${pNum}${axisNum > 0 ? ' [Eixo ' + axisNum + ']' : ''} = ${result.value}`
        });

        if (send) {
          send(outMsg);
        } else {
          this.send(outMsg);
        }

        if (done) done();
      } catch (err) {
        this.status({ fill: 'red', shape: 'dot', text: `Erro: ${err.message.slice(0, 24)}` });
        this.error(`[fanuc-param-read] Erro ao ler parâmetro #${pNum}: ${err.message}`, msg);
        if (done) done(err);
      }
    };

    // Modo Intervalo (Polling)
    if (this.triggerMode === 'interval' && this.interval >= 100) {
      this.pollTimer = setInterval(() => {
        performRead();
      }, this.interval);
    }

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

  RED.nodes.registerType('fanuc-param-read', FanucParamReadNode);
};
