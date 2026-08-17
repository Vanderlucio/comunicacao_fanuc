/**
 * Nó de Configuração de Conexão Fanuc para Node-RED (fanuc-config)
 * Desenvolvido por Vanderlucio Lopes
 */
const FanucClient = require('../lib/fanuc_client');

module.exports = function(RED) {
  function FanucConfigNode(n) {
    RED.nodes.createNode(this, n);
    this.name = n.name || `${n.driver || 'focas_tcp'}://${n.host || '127.0.0.1'}`;
    this.driver = n.driver || 'focas_tcp';
    this.host = n.host || '127.0.0.1';
    this.focasPort = Number(n.focasPort || 8193);
    this.opcuaPort = Number(n.opcuaPort || 4840);
    this.opcuaEndpoint = n.opcuaEndpoint || `opc.tcp://${this.host}:${this.opcuaPort}`;
    this.timeout = Number(n.timeout || 5000);
    this.autoConnect = n.autoConnect !== false;
    this.reconnectInterval = Number(n.reconnectInterval || 5000);

    // Credenciais (se houver)
    if (this.credentials) {
      this.username = this.credentials.username || 'OpcUaClient';
      this.password = this.credentials.password || 'OpcUaClient';
    } else {
      this.username = n.username || 'OpcUaClient';
      this.password = n.password || 'OpcUaClient';
    }

    const clientConfig = {
      driver: this.driver,
      host: this.host,
      focasPort: this.focasPort,
      opcuaPort: this.opcuaPort,
      opcuaEndpoint: this.opcuaEndpoint,
      timeout: this.timeout,
      username: this.username,
      password: this.password
    };

    this.client = new FanucClient(clientConfig);
    this.subscribers = new Set();
    this.reconnectTimer = null;
    this.isConnecting = false;

    // Gerencia eventos de conexão
    this.client.on('connected', (data) => {
      this.log(`[FanucConfig] Conectado com sucesso via ${this.driver} em ${this.host}`);
      this.notifySubscribers('connected', { fill: 'green', shape: 'dot', text: `Conectado (${this.driver})` });
    });

    this.client.on('disconnected', () => {
      this.warn(`[FanucConfig] Desconectado de ${this.host}`);
      this.notifySubscribers('disconnected', { fill: 'red', shape: 'ring', text: 'Desconectado' });
      this.scheduleReconnect();
    });

    this.client.on('error', (err) => {
      this.error(`[FanucConfig] Erro de comunicação: ${err.message}`);
      this.notifySubscribers('error', { fill: 'red', shape: 'dot', text: `Erro: ${err.message.slice(0, 20)}` });
      this.scheduleReconnect();
    });

    if (this.autoConnect) {
      this.connect();
    }

    this.on('close', async (removed, done) => {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      try {
        if (this.client) {
          await this.client.disconnect();
        }
      } catch (e) {}
      if (typeof done === 'function') {
        done();
      }
    });
  }

  FanucConfigNode.prototype.connect = async function() {
    if (this.isConnecting || (this.client && this.client.isConnected())) {
      return;
    }
    this.isConnecting = true;
    this.notifySubscribers('connecting', { fill: 'yellow', shape: 'ring', text: 'Conectando...' });
    try {
      await this.client.connect();
    } catch (err) {
      this.warn(`[FanucConfig] Falha ao conectar: ${err.message}`);
      this.notifySubscribers('error', { fill: 'red', shape: 'ring', text: 'Falha na conexão' });
      this.scheduleReconnect();
    } finally {
      this.isConnecting = false;
    }
  };

  FanucConfigNode.prototype.scheduleReconnect = function() {
    if (this.reconnectTimer || !this.autoConnect) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (!this.client || !this.client.isConnected()) {
        this.log(`[FanucConfig] Tentando reconectar a ${this.host}...`);
        await this.connect();
      }
    }, this.reconnectInterval);
  };

  FanucConfigNode.prototype.registerSubscriber = function(node) {
    this.subscribers.add(node);
    // Envia o status atual para o nó recém-registrado
    if (this.client && this.client.isConnected()) {
      node.status({ fill: 'green', shape: 'dot', text: `Conectado (${this.driver})` });
    } else {
      node.status({ fill: 'grey', shape: 'ring', text: 'Desconectado' });
    }
  };

  FanucConfigNode.prototype.unregisterSubscriber = function(node) {
    this.subscribers.delete(node);
  };

  FanucConfigNode.prototype.notifySubscribers = function(event, statusObj) {
    for (const node of this.subscribers) {
      try {
        if (typeof node.status === 'function') {
          node.status(statusObj);
        }
      } catch (e) {}
    }
  };

  RED.nodes.registerType('fanuc-config', FanucConfigNode, {
    credentials: {
      username: { type: 'text' },
      password: { type: 'password' }
    }
  });
};
