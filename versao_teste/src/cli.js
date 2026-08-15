#!/usr/bin/env node
/**
 * Interface de Linha de Comando (CLI) para Comunicação Fanuc FOCAS / CLP (PMC)
 */
const readline = require('readline');
const FanucClient = require('./fanuc_client');
const { PMC_ADDRESS_TYPES, PMC_DATA_TYPES } = require('./constants');

async function main() {
  const client = new FanucClient();

  console.clear();
  console.log('╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║               FANUC FOCAS / CLP (PMC) - CONSOLE JS                     ║');
  console.log('║        Leitura e Escrita de Parâmetros e Registradores do CLP          ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝');
  console.log(`Driver Ativo: [${client.config.connection.driver.toUpperCase()}] | Host: ${client.config.connection.host}:${client.config.connection.port}`);
  console.log(`Digite 'ajuda' ou 'help' para ver os comandos disponíveis.\n`);

  try {
    await client.connect();
    console.log(`[✔] Conectado via driver ${client.driver.name}\n`);
  } catch (err) {
    console.warn(`[!] Aviso de conexão: ${err.message}. Operações tentarão reconectar automaticamente.\n`);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'fanuc> '
  });

  let monitorInterval = null;

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    if (monitorInterval) {
      clearInterval(monitorInterval);
      monitorInterval = null;
      console.log('Monitoramento encerrado.');
      rl.prompt();
      return;
    }

    const parts = input.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    try {
      switch (cmd) {
        case 'help':
        case 'ajuda':
        case '?':
          printHelp();
          break;

        case 'driver':
          if (!args[0]) {
            console.log(`Driver atual: ${client.driver.name}`);
          } else {
            const newDriver = args[0];
            client.config.connection.driver = newDriver;
            client.initDriver(newDriver);
            console.log(`Driver alterado para: ${newDriver}`);
            await client.connect();
            console.log(`Conectado com sucesso via ${client.driver.name}`);
          }
          break;

        case 'status':
          const status = await client.readStatus();
          console.log('\n--- STATUS CNC FANUC ---');
          console.log(`Conectado:    ${status.connected}`);
          console.log(`Driver:       ${status.driver}`);
          console.log(`Modo:         ${status.mode || 'N/A'}`);
          console.log(`Execução:     ${status.runStatus || 'N/A'}`);
          console.log(`Emergência:   ${status.emergency ? 'SIM (Acionada)' : 'NÃO (OK)'}`);
          console.log(`Alarme:       ${status.alarm ? 'ATIVO' : 'NORMAL'}`);
          if (status.positions) {
            console.log(`Posições:     X: ${status.positions.X} | Y: ${status.positions.Y} | Z: ${status.positions.Z}`);
          }
          console.log('------------------------\n');
          break;

        case 'read-pmc':
        case 'ler-pmc':
          // Uso: read-pmc <tipo> <endereco> [quantidade] [tipoDado]
          // Ex: read-pmc R 1000 4 Byte
          if (args.length < 2) {
            console.log('Uso: read-pmc <tipo: R|D|X|Y|K|G|F> <endereco> [quantidade] [tipoDado: Byte|Word|Long|Float]');
            break;
          }
          const [rType, rAddr, rCount, rDataType] = [args[0], Number(args[1]), Number(args[2] || 1), args[3] || 'Byte'];
          const pmcRes = await client.readPmc(rType, rAddr, rCount, rDataType);
          console.log(`\n[LEITURA PMC] ${pmcRes.addressType}${pmcRes.startAddress} (${pmcRes.count}x ${pmcRes.dataType}):`);
          pmcRes.values.forEach((v, idx) => {
            const currentAddr = `${pmcRes.addressType}${pmcRes.startAddress + idx}`;
            if (pmcRes.dataType === 'Byte') {
              const bin = v.toString(2).padStart(8, '0');
              console.log(`  ${currentAddr} = ${v} (0x${v.toString(16).toUpperCase().padStart(2, '0')}) [Binário: ${bin}]`);
            } else {
              console.log(`  ${currentAddr} = ${v}`);
            }
          });
          console.log('');
          break;

        case 'write-pmc':
        case 'escrever-pmc':
          // Uso: write-pmc <tipo> <endereco> <valores_separados_por_virgula> [tipoDado]
          // Ex: write-pmc R 1000 10,20,30 Byte
          // Ex: write-pmc D 500 1250 Word
          if (args.length < 3) {
            console.log('Uso: write-pmc <tipo: R|D|X|Y|K> <endereco> <valores> [tipoDado: Byte|Word|Long|Float]');
            break;
          }
          const [wType, wAddr, wValsRaw, wDataType] = [args[0], Number(args[1]), args[2], args[3] || 'Byte'];
          const valuesToWrite = wValsRaw.split(',').map(v => Number(v.trim()));
          const writeRes = await client.writePmc(wType, wAddr, valuesToWrite, wDataType);
          console.log(`[✔] ${writeRes.message}\n`);
          break;

        case 'read-bit':
        case 'ler-bit':
          // Uso: read-bit <tipo> <enderecoByte> <bit:0-7>
          if (args.length < 3) {
            console.log('Uso: read-bit <tipo: R|X|Y|K> <enderecoByte> <bit: 0 a 7>');
            break;
          }
          const bitRead = await client.readPmcBit(args[0], Number(args[1]), Number(args[2]));
          console.log(`[BIT PMC] ${bitRead.address} = ${bitRead.bitValue} (Byte ${bitRead.addressType}${bitRead.byteAddress} = ${bitRead.byteValue})\n`);
          break;

        case 'write-bit':
        case 'escrever-bit':
          // Uso: write-bit <tipo> <enderecoByte> <bit:0-7> <valor:0|1>
          if (args.length < 4) {
            console.log('Uso: write-bit <tipo: R|Y|K> <enderecoByte> <bit: 0 a 7> <valor: 0 ou 1>');
            break;
          }
          const bitWriteRes = await client.writePmcBit(args[0], Number(args[1]), Number(args[2]), Number(args[3]));
          console.log(`[✔] ${bitWriteRes.message}\n`);
          break;

        case 'read-param':
        case 'ler-param':
          // Uso: read-param <numero> [eixo]
          if (args.length < 1) {
            console.log('Uso: read-param <numeroParametro> [eixo: 0=geral, 1=X, 2=Y, 3=Z]');
            break;
          }
          const paramRes = await client.readParameter(Number(args[0]), Number(args[1] || 0));
          console.log(`[PARÂMETRO CNC] #${paramRes.paramNumber} (Eixo ${paramRes.axis}) = ${paramRes.value} (${paramRes.type})\n`);
          break;

        case 'write-param':
        case 'escrever-param':
          // Uso: write-param <numero> <eixo> <valor>
          if (args.length < 3) {
            console.log('Uso: write-param <numeroParametro> <eixo: 0=geral, 1=X, 2=Y, 3=Z> <valor>');
            break;
          }
          const pWriteRes = await client.writeParameter(Number(args[0]), Number(args[1]), Number(args[2]));
          console.log(`[✔] ${pWriteRes.message}\n`);
          break;

        case 'monitor':
          console.log('Iniciando monitoramento contínuo (Pressione ENTER para parar)...');
          monitorInterval = setInterval(async () => {
            try {
              process.stdout.write('\x1Bc'); // Limpa console
              console.log(`=== MONITORAMENTO EM TEMPO REAL FANUC [Driver: ${client.driver.name}] ===`);
              console.log(`Hora: ${new Date().toLocaleTimeString()}\n`);

              const status = await client.readStatus();
              console.log(`Status: Modo=${status.mode || 'N/A'} | Execução=${status.runStatus || 'N/A'}`);

              for (const tag of (client.config.monitoredPmcTags || [])) {
                const tagRes = await client.readPmc(tag.addressType, tag.address, tag.length || 1, tag.dataType || 'Byte');
                console.log(`Tag [${tag.name}] (${tag.addressType}${tag.address}): [${tagRes.values.join(', ')}]`);
              }
              console.log('\n(Pressione ENTER para voltar ao menu)');
            } catch (e) {
              console.error(`Erro no monitor: ${e.message}`);
            }
          }, 1000);
          return;

        case 'exit':
        case 'sair':
        case 'quit':
          console.log('Encerrando...');
          await client.disconnect();
          rl.close();
          process.exit(0);
          break;

        default:
          console.log(`Comando desconhecido: '${cmd}'. Digite 'help' para ver os comandos.`);
      }
    } catch (err) {
      console.error(`[ERRO] ${err.message}\n`);
    }

    rl.prompt();
  });
}

function printHelp() {
  console.log(`
Comandos Disponíveis:
--------------------------------------------------------------------------------------
  status                                          Exibe status atual do CNC (Modo, Posições, Alarmes)
  driver <opcua|focas_tcp|focas_dll>              Alterna o driver de comunicação ativo (OPC UA / FOCAS)
  
  read-pmc <tipo> <end> [qtd] [tipoDado]          Lê registradores do CLP (ex: read-pmc R 1000 4 Byte)
  write-pmc <tipo> <end> <valores> [tipoDado]     Escreve no CLP (ex: write-pmc D 500 1250 Word)
  
  read-bit <tipo> <endByte> <bit 0-7>             Lê bit individual (ex: read-bit X 0 2)
  write-bit <tipo> <endByte> <bit 0-7> <0|1>      Escreve bit individual (ex: write-bit Y 0 1 1)
  
  read-param <num> [eixo]                         Lê parâmetro do CNC (ex: read-param 5001 1)
  write-param <num> <eixo> <valor>                Escreve parâmetro no CNC (ex: write-param 5001 1 150000)
  
  monitor                                         Monitora tags do CLP configuradas em tempo real
  help / ajuda                                    Exibe esta mensagem de ajuda
  exit / sair                                     Encerra a aplicação
--------------------------------------------------------------------------------------
Tipos de Endereço PMC: R (Relés), D (Tabela Dados), X (Entradas), Y (Saídas), K (Keep Relays), G, F
Tipos de Dados:        Byte (1 byte), Word (2 bytes), Long (4 bytes), Float (4 bytes)
`);
}

if (require.main === module) {
  main();
}
