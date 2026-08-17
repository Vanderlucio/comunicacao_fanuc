/**
 * Utilitário Auxiliar de Parâmetros e PMC Fanuc para Node-RED
 * Desenvolvido por Vanderlucio Lopes
 */
const fs = require('fs');
const path = require('path');

let paramsData = { categories: [], parameters: [] };
let pmcData = { pmcAddressTypes: [] };

try {
  const pPath = path.join(__dirname, 'fanuc_parameters.json');
  if (fs.existsSync(pPath)) {
    paramsData = JSON.parse(fs.readFileSync(pPath, 'utf8'));
  }
} catch (e) {
  console.warn('[FanucParamHelper] Aviso: Não foi possível carregar fanuc_parameters.json:', e.message);
}

try {
  const pmcPath = path.join(__dirname, 'pmc_registers.json');
  if (fs.existsSync(pmcPath)) {
    pmcData = JSON.parse(fs.readFileSync(pmcPath, 'utf8'));
  }
} catch (e) {
  console.warn('[FanucParamHelper] Aviso: Não foi possível carregar pmc_registers.json:', e.message);
}

/**
 * Busca parâmetro CNC por número ou termo na descrição
 * @param {string|number} query Número (ex: 5001) ou texto (ex: "G54", "spindle", "feed")
 */
function findParameter(query) {
  const qStr = String(query).toLowerCase().trim();
  const qNum = Number(query);

  return (paramsData.parameters || []).filter(p => {
    if (!isNaN(qNum) && p.number === qNum) return true;
    if (p.name && p.name.toLowerCase().includes(qStr)) return true;
    if (p.description && p.description.toLowerCase().includes(qStr)) return true;
    if (p.category && p.category.toLowerCase().includes(qStr)) return true;
    return false;
  });
}

/**
 * Obtém informações detalhadas de um parâmetro específico
 * @param {number} paramNumber Número do parâmetro
 */
function getParameterInfo(paramNumber) {
  const num = Number(paramNumber);
  return (paramsData.parameters || []).find(p => p.number === num) || {
    number: num,
    name: `Parâmetro #${num}`,
    description: `Parâmetro CNC Fanuc #${num}`,
    dataType: 'Desconhecido',
    range: 'Variável',
    category: 'Geral'
  };
}

/**
 * Obtém informações detalhadas de um tipo de registrador do PMC (R, D, X, Y, K, G, F, A, T, C)
 * @param {string} type Tipo de endereço (ex: 'R', 'D', 'X', 'Y', 'K')
 */
function getPmcInfo(type) {
  const t = String(type).toUpperCase().trim();
  return (pmcData.pmcAddressTypes || []).find(item => item.type === t) || null;
}

/**
 * Lista todos os parâmetros cadastrados por categoria
 */
function listParametersByCategory(category) {
  if (!category) return paramsData.parameters || [];
  const catLower = category.toLowerCase().trim();
  return (paramsData.parameters || []).filter(p => p.category && p.category.toLowerCase().includes(catLower));
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
  getParameterInfo,
  getPmcInfo,
  listParametersByCategory,
  validateValue,
  formatBits,
  categories: paramsData.categories || [],
  parameters: paramsData.parameters || [],
  pmcAddressTypes: pmcData.pmcAddressTypes || []
};
