/**
 * Testes Unitários e de Integração para node-red-contrib-fanuc
 * Desenvolvido por Vanderlucio Lopes
 */
const assert = require('assert');
const net = require('net');
const FanucClient = require('../lib/fanuc_client');
const {
  PMC_ADDRESS_TYPES,
  parseAddressType,
  parseDataType,
  parseAddressString,
  getAddressTypeName
} = require('../lib/constants');
const paramHelper = require('../lib/param_helper');

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Iniciando Testes de node-red-contrib-fanuc');
  console.log('   Desenvolvido por Vanderlucio Lopes');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ❌ [FAIL] ${name}: ${e.message}`);
      failed++;
    }
  }

  async function testAsync(name, fn) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ❌ [FAIL] ${name}: ${e.message}`);
      failed++;
    }
  }

  // 1. Testes de Constantes e Analisador de Endereços
  test('Mapeamento de tipos de endereço PMC (R, D, X, Y, K, G, F)', () => {
    assert.strictEqual(parseAddressType('R'), 5);
    assert.strictEqual(parseAddressType('D'), 9);
    assert.strictEqual(parseAddressType('X'), 3);
    assert.strictEqual(parseAddressType('Y'), 2);
    assert.strictEqual(parseAddressType('K'), 7);
    assert.strictEqual(getAddressTypeName(5), 'R');
  });

  test('Analisador de string de endereço (parseAddressString)', () => {
    const p1 = parseAddressString('R1000.2');
    assert.strictEqual(p1.addressType, 'R');
    assert.strictEqual(p1.byteAddress, 1000);
    assert.strictEqual(p1.bitIndex, 2);
    assert.strictEqual(p1.isBit, true);

    const p2 = parseAddressString('X0.5');
    assert.strictEqual(p2.addressType, 'X');
    assert.strictEqual(p2.byteAddress, 0);
    assert.strictEqual(p2.bitIndex, 5);

    const p3 = parseAddressString('D500');
    assert.strictEqual(p3.addressType, 'D');
    assert.strictEqual(p3.byteAddress, 500);
    assert.strictEqual(p3.bitIndex, null);
    assert.strictEqual(p3.isBit, false);
  });

  test('Helper de Parâmetros e PMC (paramHelper)', () => {
    const p = paramHelper.getParameterInfo(5001);
    assert.ok(p.name);
    const search = paramHelper.findParameter('feed');
    assert.ok(Array.isArray(search));
    const bitFormat = paramHelper.formatBits(0x05); // 00000101
    assert.strictEqual(bitFormat.binary, '00000101');
    assert.strictEqual(bitFormat.bitArray[0], true);
    assert.strictEqual(bitFormat.bitArray[1], false);
    assert.strictEqual(bitFormat.bitArray[2], true);
  });

  // 2. Servidor Mock TCP FOCAS para teste de integração em rede
  const TEST_PORT = 18193;
  let mockServer;
  const pmcStorage = new Map(); // Simula memória de CLP
  const paramStorage = new Map(); // Simula parâmetros CNC

  await new Promise((resolve) => {
    mockServer = net.createServer((sock) => {
      let buffer = Buffer.alloc(0);
      sock.on('data', (data) => {
        buffer = Buffer.concat([buffer, data]);
        while (buffer.length >= 10) {
          const magic = buffer.readUInt16BE(0);
          const totalLen = buffer.readUInt16BE(2);
          if (buffer.length < totalLen) break;

          const seq = buffer.readUInt16BE(4);
          const cmd = buffer.readUInt16BE(6);
          const payload = buffer.slice(10, totalLen);
          buffer = buffer.slice(totalLen);

          // Resposta FOCAS mock
          if (cmd === 0x8002) {
            // read_pmc
            const typeCode = payload.readUInt16BE(0);
            const dtCode = payload.readUInt16BE(2);
            const startAddr = payload.readUInt32BE(4);
            const endAddr = payload.readUInt32BE(8);
            const totalBytes = payload.readUInt16BE(12);

            const respHeader = Buffer.alloc(10);
            respHeader.writeUInt16BE(0xA0A0, 0);
            respHeader.writeUInt16BE(10 + totalBytes, 2);
            respHeader.writeUInt16BE(seq, 4);
            respHeader.writeUInt16BE(cmd, 6);
            respHeader.writeInt16BE(0, 8); // ret = 0 (OK)

            const dataBuf = Buffer.alloc(totalBytes);
            for (let i = 0; i < totalBytes; i++) {
              const key = `${typeCode}_${startAddr + i}`;
              dataBuf.writeUInt8(pmcStorage.has(key) ? pmcStorage.get(key) : ((startAddr + i) % 256), i);
            }
            sock.write(Buffer.concat([respHeader, dataBuf]));
          } else if (cmd === 0x8003) {
            // write_pmc
            const typeCode = payload.readUInt16BE(0);
            const dtCode = payload.readUInt16BE(2);
            const startAddr = payload.readUInt32BE(4);
            const endAddr = payload.readUInt32BE(8);
            const totalBytes = payload.readUInt16BE(12);

            for (let i = 0; i < totalBytes; i++) {
              const val = payload.readUInt8(14 + i);
              pmcStorage.set(`${typeCode}_${startAddr + i}`, val);
            }

            const respHeader = Buffer.alloc(10);
            respHeader.writeUInt16BE(0xA0A0, 0);
            respHeader.writeUInt16BE(10, 2);
            respHeader.writeUInt16BE(seq, 4);
            respHeader.writeUInt16BE(cmd, 6);
            respHeader.writeInt16BE(0, 8); // ret = 0 (OK)
            sock.write(respHeader);
          } else if (cmd === 0x8010) {
            // read_param
            const pNum = payload.readUInt32BE(0);
            const axis = payload.readUInt16BE(4);
            const val = paramStorage.has(pNum) ? paramStorage.get(pNum) : 12345;

            const respHeader = Buffer.alloc(14);
            respHeader.writeUInt16BE(0xA0A0, 0);
            respHeader.writeUInt16BE(14, 2);
            respHeader.writeUInt16BE(seq, 4);
            respHeader.writeUInt16BE(cmd, 6);
            respHeader.writeInt16BE(0, 8); // ret = 0 (OK)
            respHeader.writeInt32BE(val, 10);
            sock.write(respHeader);
          } else if (cmd === 0x8011) {
            // write_param
            const pNum = payload.readUInt32BE(0);
            const axis = payload.readUInt16BE(4);
            const val = payload.readInt32BE(8);
            paramStorage.set(pNum, val);

            const respHeader = Buffer.alloc(10);
            respHeader.writeUInt16BE(0xA0A0, 0);
            respHeader.writeUInt16BE(10, 2);
            respHeader.writeUInt16BE(seq, 4);
            respHeader.writeUInt16BE(cmd, 6);
            respHeader.writeInt16BE(0, 8); // ret = 0 (OK)
            sock.write(respHeader);
          }
        }
      });
    });

    mockServer.listen(TEST_PORT, '127.0.0.1', () => {
      resolve();
    });
  });

  // 3. Teste do FanucClient com Driver TCP conectado ao Mock Server
  await testAsync('Instanciação e Leitura/Escrita FanucClient (Driver TCP)', async () => {
    const client = new FanucClient({
      driver: 'focas_tcp',
      host: '127.0.0.1',
      focasPort: TEST_PORT,
      timeout: 3000
    });

    await client.connect();
    assert.strictEqual(client.isConnected(), true, 'Cliente conectado');

    // Leitura PMC Bloco
    const pmcRes = await client.readPmc('R', 1000, 5, 'Byte');
    assert.strictEqual(pmcRes.addressType, 'R');
    assert.strictEqual(pmcRes.count, 5);
    assert.ok(Array.isArray(pmcRes.values));

    // Escrita PMC Bloco
    const writeRes = await client.writePmc('R', 1000, [10, 20, 30], 'Byte');
    assert.strictEqual(writeRes.success, true);
    assert.strictEqual(writeRes.writtenCount, 3);

    // Releitura para verificar persistência
    const recheck = await client.readPmc('R', 1000, 3, 'Byte');
    assert.strictEqual(recheck.values[0], 10);
    assert.strictEqual(recheck.values[1], 20);
    assert.strictEqual(recheck.values[2], 30);

    // Leitura e Escrita de Bit PMC
    const bitWrite = await client.writePmcBit('Y', 0, 3, 1);
    assert.strictEqual(bitWrite.success, true);
    assert.strictEqual(bitWrite.bitValue, 1);

    const bitRead = await client.readPmcBit('Y', 0, 3);
    assert.strictEqual(bitRead.addressType, 'Y');
    assert.strictEqual(bitRead.bitIndex, 3);
    assert.strictEqual(bitRead.bitValue, 1);

    // Parâmetro CNC
    const paramWrite = await client.writeParameter(5001, 0, 15000);
    assert.strictEqual(paramWrite.success, true);

    const paramRes = await client.readParameter(5001, 0);
    assert.strictEqual(paramRes.paramNumber, 5001);
    assert.strictEqual(paramRes.value, 15000);

    // Status CNC
    const status = await client.readStatus();
    assert.ok(status);
    assert.ok(status.positions);

    await client.disconnect();
  });

  // Fecha servidor mock
  mockServer.close();

  // 4. Teste de carregamento dos nós Node-RED (mock harness)
  test('Carregamento e Registro dos Nós Node-RED', () => {
    const registeredTypes = {};
    const mockRED = {
      nodes: {
        registerType: (type, constructor, opts) => {
          registeredTypes[type] = { constructor, opts };
        },
        createNode: (instance, config) => {
          instance.id = 'test_node_id';
          instance.name = config.name;
          instance.on = () => {};
          instance.status = () => {};
          instance.log = () => {};
          instance.warn = () => {};
          instance.error = () => {};
        },
        getNode: () => ({
          client: new FanucClient({ driver: 'focas_tcp', host: '127.0.0.1', focasPort: TEST_PORT }),
          driver: 'focas_tcp',
          host: '127.0.0.1',
          registerSubscriber: () => {},
          unregisterSubscriber: () => {}
        })
      }
    };

    // Carrega cada nó
    require('../nodes/fanuc-config')(mockRED);
    require('../nodes/fanuc-pmc-read')(mockRED);
    require('../nodes/fanuc-pmc-write')(mockRED);
    require('../nodes/fanuc-param-read')(mockRED);
    require('../nodes/fanuc-param-write')(mockRED);
    require('../nodes/fanuc-status')(mockRED);
    require('../nodes/fanuc-custom')(mockRED);

    assert.ok(registeredTypes['fanuc-config'], 'fanuc-config registrado');
    assert.ok(registeredTypes['fanuc-pmc-read'], 'fanuc-pmc-read registrado');
    assert.ok(registeredTypes['fanuc-pmc-write'], 'fanuc-pmc-write registrado');
    assert.ok(registeredTypes['fanuc-param-read'], 'fanuc-param-read registrado');
    assert.ok(registeredTypes['fanuc-param-write'], 'fanuc-param-write registrado');
    assert.ok(registeredTypes['fanuc-status'], 'fanuc-status registrado');
    assert.ok(registeredTypes['fanuc-custom'], 'fanuc-custom registrado');
  });

  console.log('\n====================================================');
  console.log(`📊 Resultado dos Testes: ${passed} passaram, ${failed} falharam.`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Erro fatal nos testes:', err);
  process.exit(1);
});
