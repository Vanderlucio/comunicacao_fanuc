/**
 * Script de Teste e Diagnóstico de Comunicação Fanuc FOCAS / CLP (PMC)
 * Executa testes de leitura e escrita e exibe relatório de integridade
 */
const FanucClient = require('./fanuc_client');
const { getAddressTypeName } = require('./constants');

async function runTests() {
  console.log('================================================================');
  console.log('       TESTE DE COMUNICAÇÃO FANUC FOCAS / CLP (PMC) JS          ');
  console.log('================================================================\n');

  const client = new FanucClient();
  const config = client.config;

  console.log(`[Configuração Ativa]`);
  console.log(`  Driver Selecionado:  ${config.connection.driver.toUpperCase()}`);
  console.log(`  Host / Endereço:    ${config.connection.host}`);
  console.log(`  Porta:              ${config.connection.port}`);
  console.log(`  Porta FOCAS TCP:    ${config.connection.focasPort || 8193}`);
  console.log(`  Endpoint OPC UA:    ${config.connection.opcuaEndpoint || `opc.tcp://${config.connection.host}:${config.connection.port}`}`);
  console.log('----------------------------------------------------------------\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(title, condition, extraInfo = '') {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  [✔ SUCESSO] ${title} ${extraInfo ? `-> ${extraInfo}` : ''}`);
    } else {
      console.error(`  [✖ FALHA]   ${title} ${extraInfo ? `-> ${extraInfo}` : ''}`);
    }
  }

  try {
    // 1. Teste de Conexão
    console.log('1. Testando Conexão com o CNC/Servidor...');
    const connResult = await client.connect();
    assert('Conexão estabelecida', client.isConnected(), connResult.message);
    console.log('');

    // 2. Teste de Leitura de Status
    console.log('2. Testando Leitura de Status do CNC...');
    try {
      const status = await client.readStatus();
      assert('Leitura de Status do CNC', status !== null, `Modo: ${status.mode || 'N/A'}, Execução: ${status.runStatus || 'N/A'}`);
      if (status.positions) {
        console.log(`     Posições dos Eixos: X=${status.positions.X}, Y=${status.positions.Y}, Z=${status.positions.Z}`);
      }
    } catch (e) {
      assert('Leitura de Status', false, e.message);
    }
    console.log('');

    // 3. Teste de Leitura de PMC (Faixa de Bytes)
    console.log('3. Testando Leitura de Faixa de PMC (Relés R1000 a R1003)...');
    try {
      const pmcRead = await client.readPmc('R', 1000, 4, 'Byte');
      assert('Leitura PMC R1000-R1003', pmcRead.values && pmcRead.values.length === 4, `Valores: [${pmcRead.values.join(', ')}]`);
      if (pmcRead.bits && pmcRead.bits[0]) {
        console.log(`     R1000 Binário: ${pmcRead.bits[0].binaryString}`);
      }
    } catch (e) {
      assert('Leitura PMC R1000-R1003', false, e.message);
    }
    console.log('');

    // 4. Teste de Escrita e Releitura de PMC (Word / Inteiro)
    console.log('4. Testando Escrita e Validação no PMC (Tabela de Dados D500 - Word)...');
    try {
      const testVal1 = 4321;
      const testVal2 = 8765;
      await client.writePmc('D', 500, [testVal1, testVal2], 'Word');
      
      const verifyD = await client.readPmc('D', 500, 2, 'Word');
      const match = verifyD.values[0] === testVal1 && verifyD.values[1] === testVal2;
      assert('Escrita e Releitura D500/D502', match, `Escrito: [${testVal1}, ${testVal2}] | Lido: [${verifyD.values.join(', ')}]`);
    } catch (e) {
      assert('Escrita/Leitura D500', false, e.message);
    }
    console.log('');

    // 5. Teste de Leitura e Escrita de Bit Individual no PMC
    console.log('5. Testando Manipulação de Bit Individual no PMC (R1005.3)...');
    try {
      // Escreve bit 1
      await client.writePmcBit('R', 1005, 3, 1);
      let bitRead = await client.readPmcBit('R', 1005, 3);
      assert('Escrita e Leitura de Bit = 1', bitRead.bitValue === 1, `Bit ${bitRead.address} = ${bitRead.bitValue}`);

      // Escreve bit 0
      await client.writePmcBit('R', 1005, 3, 0);
      bitRead = await client.readPmcBit('R', 1005, 3);
      assert('Escrita e Leitura de Bit = 0', bitRead.bitValue === 0, `Bit ${bitRead.address} = ${bitRead.bitValue}`);
    } catch (e) {
      assert('Manipulação de Bit PMC', false, e.message);
    }
    console.log('');

    // 6. Teste de Leitura de Parâmetros do CNC
    console.log('6. Testando Leitura de Parâmetro CNC (#5001 - Posição do Eixo X)...');
    try {
      const param = await client.readParameter(5001, 1);
      assert('Leitura de Parâmetro #5001 Eixo 1', param.value !== undefined, `Valor: ${param.value} (${param.type || 'Long'})`);
    } catch (e) {
      assert('Leitura de Parâmetro CNC', false, e.message);
    }
    console.log('');

    // 7. Teste de Escrita e Validação de Parâmetro do CNC
    console.log('7. Testando Escrita e Validação de Parâmetro CNC (#5001 - Eixo 2)...');
    try {
      const testParamVal = 987654;
      await client.writeParameter(5001, 2, testParamVal);
      const paramRead = await client.readParameter(5001, 2);
      assert('Escrita e Releitura de Parâmetro CNC', paramRead.value === testParamVal, `Escrito: ${testParamVal} | Lido: ${paramRead.value}`);
    } catch (e) {
      assert('Escrita de Parâmetro CNC', false, e.message);
    }
    console.log('');

    // Desconexão
    await client.disconnect();
    console.log('----------------------------------------------------------------');
    console.log(`RESULTADO DOS TESTES: ${passedTests}/${totalTests} PASSARAM (${Math.round((passedTests / totalTests) * 100)}%)`);
    console.log('================================================================\n');

  } catch (err) {
    console.error(`\n[ERRO CRÍTICO NO TESTE] ${err.message}\n`);
  }
}

if (require.main === module) {
  runTests();
}

module.exports = runTests;
