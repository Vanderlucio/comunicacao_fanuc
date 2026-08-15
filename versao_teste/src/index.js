/**
 * Exportação Principal do Módulo Fanuc FOCAS / CLP (PMC) JS
 */
const FanucClient = require('./fanuc_client');
const constants = require('./constants');
const BaseDriver = require('./drivers/base_driver');
const FocasTcpDriver = require('./drivers/focas_tcp_driver');
const FocasDllDriver = require('./drivers/focas_dll_driver');
const OpcUaDriver = require('./drivers/opcua_driver');

module.exports = {
  FanucClient,
  constants,
  BaseDriver,
  FocasTcpDriver,
  FocasDllDriver,
  OpcUaDriver
};
