/**
 * node-red-contrib-fanuc
 * Pacote de Nós Node-RED para Comunicação Industrial com CNCs e CLPs Fanuc
 * Desenvolvido por Vanderlucio Lopes
 */
const FanucClient = require('./lib/fanuc_client');
const constants = require('./lib/constants');
const paramHelper = require('./lib/param_helper');

module.exports = {
  FanucClient,
  constants,
  paramHelper
};
