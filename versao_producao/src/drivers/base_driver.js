/**
 * Classe Base Abstrata para Drivers de Comunicação Fanuc
 */
const EventEmitter = require('events');

class BaseDriver extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = config;
    this.connected = false;
    this.name = 'BaseDriver';
  }

  /**
   * Conecta ao CNC / CLP
   */
  async connect() {
    throw new Error('Método connect() não implementado pelo driver');
  }

  /**
   * Desconecta
   */
  async disconnect() {
    throw new Error('Método disconnect() não implementado pelo driver');
  }

  /**
   * Lê uma faixa de dados da memória do PMC (CLP)
   * @param {string|number} addressType Tipo de endereço (ex: 'R', 'D', 'X', 'Y', 'K' ou código)
   * @param {number} startAddress Endereço inicial (ex: 1000)
   * @param {number} count Quantidade de elementos
   * @param {string|number} dataType Tipo do dado ('Byte', 'Word', 'Long', 'Float')
   * @returns {Promise<{addressType: string, startAddress: number, count: number, dataType: string, values: number[], rawBuffer: Buffer}>}
   */
  async readPmc(addressType, startAddress, count, dataType) {
    throw new Error('Método readPmc() não implementado pelo driver');
  }

  /**
   * Escreve dados na memória do PMC (CLP)
   * @param {string|number} addressType Tipo de endereço (ex: 'R', 'D', 'X', 'Y', 'K' ou código)
   * @param {number} startAddress Endereço inicial
   * @param {number[]|Buffer|number} values Valores a serem escritos
   * @param {string|number} dataType Tipo do dado ('Byte', 'Word', 'Long', 'Float')
   * @returns {Promise<{success: boolean, writtenCount: number, message: string}>}
   */
  async writePmc(addressType, startAddress, values, dataType) {
    throw new Error('Método writePmc() não implementado pelo driver');
  }

  /**
   * Lê um parâmetro do CNC
   * @param {number} paramNumber Número do parâmetro (ex: 5001)
   * @param {number} axis Número do eixo (0 para geral/todos, 1 para X, 2 para Y, etc.)
   * @returns {Promise<{paramNumber: number, axis: number, value: any, type: string}>}
   */
  async readParameter(paramNumber, axis = 0) {
    throw new Error('Método readParameter() não implementado pelo driver');
  }

  /**
   * Escreve um parâmetro do CNC
   * @param {number} paramNumber Número do parâmetro
   * @param {number} axis Número do eixo (0 para geral)
   * @param {any} value Valor a escrever
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async writeParameter(paramNumber, axis = 0, value) {
    throw new Error('Método writeParameter() não implementado pelo driver');
  }

  /**
   * Lê o status atual do CNC (Modo de operação, execução, posições, alarmes)
   * @returns {Promise<{connected: boolean, mode: string, runStatus: string, alarms: Array, positions: Object}>}
   */
  async readStatus() {
    throw new Error('Método readStatus() não implementado pelo driver');
  }

  /**
   * Retorna se o driver está conectado
   */
  isConnected() {
    return this.connected;
  }
}

module.exports = BaseDriver;
