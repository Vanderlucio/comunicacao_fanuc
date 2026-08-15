/**
 * Utilitário Auxiliar de Parâmetros e PMC Fanuc
 * Permite buscar parâmetros por nome ou número, validar faixas e tipos de dados.
 */
const fs = require('fs');
const path = require('path');

const paramsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'fanuc_parameters.json'), 'utf8'));
const pmcData = JSON.parse(fs.readFileSync(path.join(__dirname, 'pmc_registers.json'), 'utf8'));

/**
 * Busca parâmetro CNC por número ou termo na descrição
 * @param {string|number} query Número (ex: 5001) ou texto (ex: "G54", "spindle", "feed")
 */
function findParameter(query) {
  const qStr = String(query).toLowerCase().trim();
  const qNum = Number(query);

  return paramsData.parameters.filter(p => {
    if (!isNaN(qNum) && p.number === qNum) return true;
    if (p.name.toLowerCase().includes(qStr)) return true;
    if (p.description.toLowerCase().includes(qStr)) return true;
    if (p.category.toLowerCase().includes(qStr)) return true;
    return false;
  });
}

/**
 * Obtém informações detalhadas de um tipo de registrador do PMC (R, D, X, Y, K, G, F, A, T, C)
 * @param {string} type Tipo de endereço (ex: 'R', 'D', 'X', 'Y', 'K')
 */
function getPmcInfo(type) {
  const t = String(type).toUpperCase().trim();
  return pmcData.pmcAddressTypes.find(item => item.type === t) || null;
}

/**
 * Lista todos os parâmetros cadastrados por categoria
 */
function listParametersByCategory(category) {
  if (!category) return paramsData.parameters;
  const catLower = category.toLowerCase().trim();
  return paramsData.parameters.filter(p => p.category.toLowerCase().includes(catLower));
}

/**
 * Valida se um valor está dentro do intervalo seguro para o tipo de dado Fanuc
 */
function validateValue(value, dataType) {
  const num = Number(value);
  if (isNaN(num)) return { valid: false, error: 'O valor deve ser numérico.' };

  const type = String(dataType).toLowerCase();
  if (type === 'byte' || type === '0') {
    if (num < 0 || num > 255) return { valid: false, error: 'Valor Byte deve estar entre 0 e 255 (0x00 a 0xFF).' };
  } else if (type === 'word' || type === '1') {
    if (num < -32768 || num > 32767) return { valid: false, error: 'Valor Word (16-bit com sinal) deve estar entre -32768 e 32767.' };
  } else if (type === 'long' || type === '2') {
    if (num < -2147483648 || num > 2147483647) return { valid: false, error: 'Valor Long (32-bit com sinal) deve estar entre -2.147.483.648 e 2.147.483.647.' };
  }

  return { valid: true };
}

/**
 * Decodifica um byte de bits do PMC para um formato legível
 */
function formatBits(byteValue) {
  const val = Number(byteValue) & 0xFF;
  const bits = [];
  for (let i = 7; i >= 0; i--) {
    bits.push((val & (1 << i)) ? '1' : '0');
  }
  return {
    byte: val,
    hex: '0x' + val.toString(16).toUpperCase().padStart(2, '0'),
    binary: bits.join(''),
    bitArray: bits.reverse().map(b => b === '1') // índice 0 = bit 0, índice 7 = bit 7
  };
}

module.exports = {
  findParameter,
  getPmcInfo,
  listParametersByCategory,
  validateValue,
  formatBits,
  categories: paramsData.categories,
  parameters: paramsData.parameters,
  pmcAddressTypes: pmcData.pmcAddressTypes
};
