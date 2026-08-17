# 🔴 node-red-contrib-fanuc

> **Nós do Node-RED para Comunicação Industrial, Telemetria, Leitura e Escrita de Parâmetros e CLP (PMC) com Máquinas CNC e Controladores Fanuc.**  
> **Desenvolvido por Vanderlucio Lopes**

[![Node-RED](https://img.shields.io/badge/Node--RED-v2.0+-red.svg)](https://nodered.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Protocol: FOCAS 1/2](https://img.shields.io/badge/Protocol-FOCAS%201%2F2-blue.svg)]()
[![Protocol: OPC UA](https://img.shields.io/badge/Protocol-OPC%20UA-green.svg)]()

---

## 📋 Sumário
- [Visão Geral](#-visão-geral)
- [Protocolos e Drivers Suportados](#-protocolos-e-drivers-suportados)
- [Instalação no Node-RED](#-instalação-no-node-red)
- [Catálogo de Nós](#-catálogo-de-nós)
  - [fanuc-config](#1-fanuc-config-nó-de-configuração)
  - [fanuc-pmc-read](#2-fanuc-pmc-read-leitura-do-clp)
  - [fanuc-pmc-write](#3-fanuc-pmc-write-escrita-no-clp)
  - [fanuc-param-read](#4-fanuc-param-read-leitura-de-parâmetros-cnc)
  - [fanuc-param-write](#5-fanuc-param-write-escrita-de-parâmetros-cnc)
  - [fanuc-status](#6-fanuc-status-telemetria-em-tempo-real)
  - [fanuc-custom](#7-fanuc-custom-execução-dinâmica)
- [Tabela de Tipos de Endereço do PMC (CLP)](#-tabela-de-tipos-de-endereço-do-pmc-clp)
- [Parâmetros CNC Populares](#-parâmetros-cnc-populares)
- [Exemplos Prontos para Importação](#-exemplos-prontos-para-importação)
- [Créditos e Licença](#-créditos-e-licença)

---

## 🌟 Visão Geral

O pacote **`node-red-contrib-fanuc`** foi desenvolvido por **Vanderlucio Lopes** para permitir a integração completa, robusta e bidirecional de tornos mecânicos, centros de usinagem e robôs industriais equipados com comandos **Fanuc** (Series 0i-TF, 0i-MF, 30i, 31i, 32i, 16i, 18i, 21i, Power Mate, etc.) em arquiteturas de **Indústria 4.0**, **SCADA**, **IIoT** e dashboards de fábrica no Node-RED.

---

## 🔌 Protocolos e Drivers Suportados

O nó de conexão **`fanuc-config`** unifica três modos de conexão industrial:

| Driver | Porta Padrão | Descrição | Compatibilidade |
| :--- | :---: | :--- | :--- |
| **`focas_tcp`** | `8193` | Comunicação direta via Socket TCP Ethernet. Não requer DLLs da Fanuc. | Linux, Docker, Raspberry Pi, Windows, macOS |
| **`focas_dll`** | `8193` | Chamadas oficiais Fanuc FOCAS 1/2 através da `Fwlib32.dll` via bridge nativo x86 (`fanuc_bridge32.exe`). | Windows x86/x64 |
| **`opcua`** | `4840` | Comunicação padrão OPC UA através de gateways industriais ou servidores como CNCnetPDM. | Multiplataforma |

---

## 📦 Instalação no Node-RED

### Método 1: Instalação a partir do diretório local
Acesse a pasta de dados do seu Node-RED (geralmente `~/.node-red` ou `%USERPROFILE%\.node-red` no Windows) e execute:

```bash
cd ~/.node-red
npm install /caminho/para/comunicacao_fanuc/versao_nodered
```

No Windows (PowerShell):
```powershell
cd $HOME\.node-red
npm install C:\comunicacao_fanuc\versao_nodered
```

### Método 2: Instalação via `npm link` para desenvolvimento
```bash
cd C:\comunicacao_fanuc\versao_nodered
npm link

cd ~/.node-red
npm link node-red-contrib-fanuc
```

Após a instalação, reinicie o Node-RED (`node-red-start` ou `node-red`). Os novos nós aparecerão na categoria **Fanuc CNC** da paleta lateral.

---

## 🛠️ Catálogo de Nós

### 1. `fanuc-config` (Nó de Configuração)
Centraliza a conexão com o CNC e gerencia reconexões automáticas e múltiplos nós conectados simultaneamente.

- **Propriedades:**
  - **Driver:** `FOCAS TCP`, `FOCAS DLL Nativa`, `OPC UA`.
  - **Endereço IP:** IP do controlador Fanuc (ex: `192.168.1.100`).
  - **Porta FOCAS:** `8193`.
  - **Porta OPC UA / Endpoint:** `4840` ou `opc.tcp://192.168.1.100:4840`.
  - **Timeout:** Tempo limite de resposta (padrão: `5000ms`).
  - **Reconexão:** Intervalo de tentativa de reconexão (padrão: `5000ms`).
  - **Conectar Auto:** Conecta automaticamente na inicialização do fluxo.

---

### 2. `fanuc-pmc-read` (Leitura do CLP)
Lê áreas de memória do PMC (CLP interno da máquina).

- **Modos de Leitura:**
  - **Bloco / Faixa:** Lê uma sequência contínua de registradores (`Byte`, `Word`, `Long`, `Float`).
  - **Bit Individual:** Lê o valor booleano (`0` ou `1`) de um bit específico (ex: `R1000.2`, `X0.0`, `Y0.5`, `K0.3`).
- **Disparo:** Por mensagem de entrada (`msg`) ou por intervalo cíclico (*polling* em ms).
- **Entrada Dinâmica:** Aceita sobrescrita via `msg.address` (`"R1000.2"`, `"X0.0"`), `msg.addressType`, `msg.startAddress`, `msg.count`, `msg.dataType`.
- **Saída:**
  - `msg.payload`: Valor ou objeto estruturado com decodificação binária e hexadecimal de cada bit.
  - `msg.fanuc`: Metadados da leitura.

---

### 3. `fanuc-pmc-write` (Escrita no CLP)
Escreve valores ou altera o estado de bits específicos no CLP Fanuc.

- **Modos de Escrita:**
  - **Valores em Bloco:** Escreve um valor numérico ou array (`[10, 20, 30]`).
  - **Bit Individual:** Altera apenas o bit selecionado (`0` ou `1`), preservando os outros 7 bits do byte no PMC.
- **Entradas:**
  - `msg.payload`: Dado a ser gravado (`1`/`0`, número ou array).
  - `msg.address`: Endereço de destino (ex: `"Y0.2"`, `"R1000"`).

---

### 4. `fanuc-param-read` (Leitura de Parâmetros CNC)
Consulta parâmetros internos de usinagem e configuração do comando CNC (#0020, #5001, #3105, #1420, etc.).

- **Propriedades:**
  - **Nº Parâmetro:** Número do parâmetro (ex: `5001`).
  - **Eixo:** `0` (Geral/Todos), `1` (Eixo X), `2` (Eixo Y), `3` (Eixo Z), `4` (4º Eixo).
- **Saída Enriquecida:** Retorna o valor atual juntamente com o **Nome Descritivo**, **Explicação Técnica de Engenharia** e **Categoria**.

---

### 5. `fanuc-param-write` (Escrita de Parâmetros CNC)
Altera o valor de parâmetros do comando numérico com segurança.

- **Entradas:**
  - `msg.payload` ou `msg.value`: Novo valor do parâmetro.
  - `msg.paramNumber` / `msg.param`: (Opcional) Número do parâmetro.
  - `msg.axis`: (Opcional) Eixo alvo.

---

### 6. `fanuc-status` (Telemetria em Tempo Real)
Coleta a telemetria operacional completa da máquina em tempo real.

- **Dados Fornecidos em `msg.payload`:**
  - `mode`: Modo de operação (`MDI`, `MEM` Automático, `EDIT`, `JOG`, `REF`, `HND`).
  - `runStatus`: Estado de execução (`START`, `STOP`, `HOLD`).
  - `feedrate`: Avanço real atual da ferramenta (mm/min).
  - `spindleSpeed`: Rotação real da placa/árvore (RPM).
  - `positions`: Coordenadas dos eixos (`X`, `Y`, `Z`, `A`).
  - `alarms`: Lista de alarmes e mensagens ativas.

---

### 7. `fanuc-custom` (Execução Dinâmica)
Nó curinga universal para fluxos avançados. A ação executada é definida por `msg.action` ou `msg.topic`:

```javascript
// Exemplo de mensagem para o fanuc-custom:
msg.action = "writeBit";
msg.addressType = "Y";
msg.byteAddress = 0;
msg.bitIndex = 0;
msg.payload = 1; // Liga saída Y0.0
return msg;
```

Ações suportadas: `readPmc`, `writePmc`, `readBit`, `writeBit`, `readParam`, `writeParam`, `readStatus`, `connect`, `disconnect`.

---

## 📑 Tabela de Tipos de Endereço do PMC (CLP)

| Tipo | Código FOCAS | Nome / Descrição | Direção / Uso Principal |
| :---: | :---: | :--- | :--- |
| **`R`** | `5` | **Relés Internos** | Variáveis internas e flags lógicas do ladder do CLP. |
| **`D`** | `9` | **Tabela de Dados** | Contadores, tempos, receitas e dados numéricos. |
| **`X`** | `3` | **Entradas Digitais Físicas** | Sensores, fins de curso, botoeiras, pressostatos. |
| **`Y`** | `2` | **Saídas Digitais Físicas** | Válvulas solenoides, contatores, lâmpadas de torre. |
| **`K`** | `7` | **Keep Relays (Retenção)** | Parâmetros e opções do fabricante da máquina. |
| **`G`** | `0` | **CLP para CNC** | Comandos enviados do ladder para o comando CNC. |
| **`F`** | `1` | **CNC para CLP** | Sinais de status enviados do CNC para o ladder. |
| **`A`** | `4` | **Mensagens e Alarmes** | Bits de disparo de alarmes e mensagens do operador. |
| **`T`** | `6` | **Temporizadores** | Valores atuais e presets de temporizadores do PMC. |
| **`C`** | `8` | **Contadores** | Valores de contagem do PMC. |
| **`E`** | `10` | **Relés Estendidos** | Expansão de relés internos. |

---

## ⚙️ Parâmetros CNC Populares

| Parâmetro | Nome | Descrição |
| :---: | :--- | :--- |
| **`#0020`** | Canal de I/O | Seleciona o canal de comunicação ativo (`0`=RS232 Canal 1, `1`=RS232 Canal 2, `4`=Cartão de Memória, `6`=Ethernet / FOCAS). |
| **`#5001`** | Correção de Ferramenta | Valor de compensação de geometria/desgaste de ferramenta no eixo X. |
| **`#5002`** | Correção de Ferramenta | Valor de compensação de ferramenta no eixo Y / Z. |
| **`#3105`** | Bloqueio de Edição | Proteção e travamento de edição de programas O8000-O8999 e O9000-O9999. |
| **`#1420`** | Avanço Rápido (G00) | Velocidade máxima em movimento rápido por eixo (mm/min). |
| **`#1421`** | F0 de Avanço Rápido | Velocidade do override F0 (baixa velocidade de segurança). |
| **`#3741`** | Rotação Máxima da Placa | Limite máximo programável de RPM do Spindle. |

---

## 📂 Exemplos Prontos para Importação

Dentro da pasta **`examples/`**, você encontra fluxos prontos para importar diretamente no Node-RED (**Menu -> Import**):

1. **`01_leitura_escrita_pmc.json`**: Leitura e escrita de relés internos `R1000` em formato de bytes e arrays.
2. **`02_leitura_escrita_parametros_cnc.json`**: Consulta e alteração de parâmetros CNC com nós de injeção e depuração.
3. **`03_dashboard_telemetria_cnc.json`**: Monitoramento contínuo em tempo real com separação de coordenadas X/Y/Z, feedrate e RPM.
4. **`04_controle_bits_io_digital.json`**: Leitura de sensores discretos (`X0.0`) e acionamento de saídas/válvulas (`Y0.0`).

---

## 👤 Créditos e Autoria

- **Desenvolvedor:** Vanderlucio Lopes
- **Projeto:** Comunicação Industrial Fanuc FOCAS / PMC / CNC para Node-RED
- **Licença:** [MIT License](LICENSE)
