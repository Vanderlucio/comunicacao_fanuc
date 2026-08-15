/**
 * Constantes e Mapeamentos do Protocolo Fanuc FOCAS / PMC (CLP)
 * Extraído e adaptado de fwlib32.h e fwlib32.cs
 */

const PMC_ADDRESS_TYPES = {
  G: 0,  // Sinal do CLP para o CNC (Signal to CNC)
  F: 1,  // Sinal do CNC para o CLP (Signal from CNC)
  Y: 2,  // Saídas Físicas Digitais (Signal to Machine)
  X: 3,  // Entradas Físicas Digitais (Signal from Machine)
  A: 4,  // Demandas de Mensagem / Alarme
  R: 5,  // Relés Internos do CLP (Internal Relays)
  T: 6,  // Temporizadores Variáveis (Variable Timers)
  K: 7,  // Relés de Retenção (Keep Relays)
  C: 8,  // Contadores (Counters)
  D: 9,  // Tabela de Dados / Registradores Numéricos (Data Table)
  E: 10, // Relés Estendidos (Extended Relays)
  B: 11, // Memória Não-Volátil (Non-volatile Memory)
  N: 12, // Subprogramas
  M: 13, // Mensagens
  L: 14  // Ladder
};

const PMC_ADDRESS_NAMES = Object.fromEntries(
  Object.entries(PMC_ADDRESS_TYPES).map(([k, v]) => [v, k])
);

const PMC_DATA_TYPES = {
  Byte: 0,  // 1 byte (8 bits: 0 a 255)
  Word: 1,  // 2 bytes (16 bits: -32768 a 32767 ou 0 a 65535)
  Long: 2,  // 4 bytes (32 bits: inteiro longo)
  Float: 3  // 4 bytes (ponto flutuante IEEE 754)
};

const PMC_DATA_TYPE_SIZES = {
  0: 1, // Byte
  1: 2, // Word
  2: 4, // Long
  3: 4  // Float
};

const FOCAS_RETURN_CODES = {
  0: { code: 'EW_OK', desc: 'Operação concluída com sucesso' },
  1: { code: 'EW_LENGTH', desc: 'Erro no tamanho do bloco de dados' },
  2: { code: 'EW_NUMBER', desc: 'Número de dado ou endereço fora do intervalo' },
  3: { code: 'EW_ATTRIB', desc: 'Erro de atributo de dado' },
  4: { code: 'EW_DATA', desc: 'Erro de dado fornecido' },
  6: { code: 'EW_NOOPT', desc: 'Opção CNC necessária não habilitada' },
  7: { code: 'EW_PROT', desc: 'Escrita protegida ou bloqueada pelo CNC' },
  [-1]: { code: 'EW_BUSY', desc: 'CNC ocupado executando outra tarefa' },
  [-2]: { code: 'EW_REJECT', desc: 'Comando rejeitado pelo CNC' },
  [-3]: { code: 'EW_RESET', desc: 'Sinal de Reset ou parada ocorreu' },
  [-4]: { code: 'EW_UNEXP', desc: 'Erro inesperado' },
  [-7]: { code: 'EW_VERSION', desc: 'Incompatibilidade de versão do FOCAS' },
  [-8]: { code: 'EW_HANDLE', desc: 'Falha ao obter Handle de conexão' },
  [-10]: { code: 'EW_PARAM', desc: 'Erro de parâmetro CNC' },
  [-15]: { code: 'EW_SOCKET', desc: 'Erro de comunicação via Socket TCP' },
  [-16]: { code: 'EW_NODLL', desc: 'Arquivo DLL FWLIB32/64 não encontrado' }
};

const CNC_MODES = {
  0: 'MDI',
  1: 'MEM (Automático)',
  2: 'EDIT',
  3: 'HND (Manivela Manual)',
  4: 'JOG (Manual)',
  5: 'T-JOG (Teach)',
  6: 'REF (Retorno de Referência Zero)',
  7: 'INC (Incremental)',
  8: 'REMOTE'
};

const CNC_RUN_STATUS = {
  0: 'STOP (Parado)',
  1: 'HOLD (Pausa / Espera)',
  2: 'START (Executando)',
  3: 'MSTR (Movimento Manual)'
};

/**
 * Converte string de tipo de endereço (ex: 'R', 'D', 'X') para código numérico
 */
function parseAddressType(type) {
  if (typeof type === 'number') return type;
  if (typeof type === 'string') {
    const upper = type.trim().toUpperCase();
    if (PMC_ADDRESS_TYPES[upper] !== undefined) {
      return PMC_ADDRESS_TYPES[upper];
    }
  }
  throw new Error(`Tipo de endereço PMC inválido: '${type}'. Tipos suportados: ${Object.keys(PMC_ADDRESS_TYPES).join(', ')}`);
}

/**
 * Converte código numérico de endereço (ex: 5) para nome ('R')
 */
function getAddressTypeName(typeCode) {
  return PMC_ADDRESS_NAMES[typeCode] || `TYPE_${typeCode}`;
}

/**
 * Converte string de tipo de dado (ex: 'Byte', 'Word', 'Long') para código numérico
 */
function parseDataType(type) {
  if (typeof type === 'number') return type;
  if (typeof type === 'string') {
    const key = Object.keys(PMC_DATA_TYPES).find(k => k.toLowerCase() === type.trim().toLowerCase());
    if (key && PMC_DATA_TYPES[key] !== undefined) {
      return PMC_DATA_TYPES[key];
    }
  }
  return PMC_DATA_TYPES.Byte; // Padrão
}

/**
 * Retorna o tamanho em bytes do tipo de dado
 */
function getDataTypeSize(typeCode) {
  return PMC_DATA_TYPE_SIZES[typeCode] || 1;
}

/**
 * Retorna mensagem descritiva do código de retorno FOCAS
 */
function getReturnMessage(retCode) {
  if (FOCAS_RETURN_CODES[retCode]) {
    return `[${FOCAS_RETURN_CODES[retCode].code}] ${FOCAS_RETURN_CODES[retCode].desc}`;
  }
  return `Erro FOCAS desconhecido (Código: ${retCode})`;
}

module.exports = {
  PMC_ADDRESS_TYPES,
  PMC_ADDRESS_NAMES,
  PMC_DATA_TYPES,
  PMC_DATA_TYPE_SIZES,
  FOCAS_RETURN_CODES,
  CNC_MODES,
  CNC_RUN_STATUS,
  parseAddressType,
  getAddressTypeName,
  parseDataType,
  getDataTypeSize,
  getReturnMessage
};
