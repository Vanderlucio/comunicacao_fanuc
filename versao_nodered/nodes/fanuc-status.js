/**
 * Nó Node-RED para Leitura do Status e Telemetria do CNC Fanuc (fanuc-status)
 * Desenvolvido por Vanderlucio Lopes
 */
module.exports = function(RED) {
  function FanucStatusNode(n) {
    RED.nodes.createNode(this, n);
    this.connection = n.connection;
    this.connNode = RED.nodes.getNode(this.connection);
    this.name = n.name;
    this.triggerMode = n.triggerMode || 'interval'; // 'interval' ou 'input'
    this.interval = Number(n.interval || 1000);

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

      try {
        const statusData = await client.readStatus();

        const outMsg = Object.assign({}, msg);
        outMsg.payload = statusData;
        outMsg.fanuc = {
          driver: client.driver ? client.driver.name : this.connNode.driver,
          host: this.connNode.host,
          timestamp: new Date().toISOString()
        };

        const isRunning = statusData.runStatus && (statusData.runStatus.includes('START') || statusData.runStatus.includes('Executando'));
        this.status({
          fill: isRunning ? 'green' : 'blue',
          shape: 'dot',
          text: `${statusData.mode || '---'} | ${statusData.runStatus || '---'}`
        });

        if (send) {
          send(outMsg);
        } else {
          this.send(outMsg);
        }

        if (done) done();
      } catch (err) {
        this.status({ fill: 'red', shape: 'dot', text: `Erro: ${err.message.slice(0, 24)}` });
        this.error(`[fanuc-status] Erro ao ler status: ${err.message}`, msg);
        if (done) done(err);
      }
    };

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

  RED.nodes.registerType('fanuc-status', FanucStatusNode);
};
