# 🏭 Console Multi-Máquinas Fanuc CNC & CLP (PMC) - Versão Produção

Sistema industrial completo para monitoramento, controle, leitura e escrita de múltiplos CNCs e CLPs (PMC) Fanuc simultâneos, com persistência nativa em banco de dados **SQLite** e interface web em tempo real.

---

## 🌟 Principais Recursos

- **Gestão Multi-Máquinas (Frota de CNCs):** Cadastre, configure e monitore múltiplos tornos e centros de usinagem Fanuc em paralelo através do botão **`➕ Adicionar Máquina`**.
- **Persistência em Banco de Dados SQLite:** Todas as máquinas, credenciais, portas, tags de leitura/escrita e parâmetros CNC são salvos no banco local (`data/machines.sqlite`).
- **Suporte a Três Protocolos / Drivers:**
  - **FOCAS DLL Nativa (x86):** Conexão direta com as bibliotecas oficiais da Fanuc (`Fwlib32.dll`, `fwlib30i.dll`, `fwlib0iD.dll`) através do micro-bridge 32-bit (`fanuc_bridge32.exe`).
  - **FOCAS TCP Direto:** Comunicação via socket Ethernet na porta `8193`.
  - **OPC UA / CNCnetPDM:** Integração via servidor OPC UA na porta `4840` com autenticação.
- **Painel de Controle Individual por Máquina:**
  - ⚡ **Telemetria & Eixos:** Posições X, Y, Z, A ao vivo, modo de operação, programa ativo, contador de peças, avanço (feedrate) e rotação (spindle RPM).
  - 🔌 **Painel de Bits (I/O Digital):** Visualização de matriz de LEDs para `X0` (entradas), `Y0` (saídas), `R1000` (relés) e `K0` (keep relays), com acionamento de bits por clique.
  - 📥 **Tags de Leitura Automática (PMC):** Cadastro de tags de leitura lidas ciclicamente em segundo plano a cada refresh, com decodificação decimal, hexadecimal e binária.
  - 📤 **Tags de Escrita (Comandos no CLP):** Cadastro de tags de controle com valores pré-configurados e botão de disparo rápido **`⚡ Escrever no CLP`**.
  - ⚙️ **Parâmetros CNC:** Consulta e alteração de parâmetros específicos da máquina (#0020, #5001, etc.).
- **WebSocket em Tempo Real:** Transmissão multiplexada da frota inteira a cada 1000ms.

---

## 📁 Estrutura de Arquivos

```
versao_producao/
├── data/
│   └── machines.sqlite              # Banco de dados SQLite persistente
├── public/                          # Interface Web do Dashboard
│   ├── index.html                   # Estrutura HTML responsiva
│   ├── style.css                    # Design system industrial dark
│   └── app.js                       # Lógica interativa e WebSocket
├── src/
│   ├── bridge/
│   │   └── fanuc_bridge.cs          # Código C# do bridge FOCAS x86
│   ├── database/
│   │   └── db.js                    # Camada SQLite (CRUD Máquinas, Tags e Params)
│   ├── drivers/
│   │   ├── base_driver.js           # Classe base para drivers
│   │   ├── focas_dll_driver.js      # Driver DLL Nativa Fanuc
│   │   ├── focas_tcp_driver.js      # Driver TCP Socket
│   │   └── opcua_driver.js          # Driver OPC UA
│   ├── constants.js                 # Constantes e mapas do PMC/CNC
│   ├── fanuc_client.js              # Cliente unificado Fanuc
│   ├── machine_manager.js           # Gerenciador de pool de instâncias
│   └── server.js                    # Servidor Express + WebSocket API
├── util/                            # Catálogo e guias técnicos
│   ├── GUIA_PARAMETROS_E_PMC_FANUC.md
│   ├── fanuc_parameters.json
│   ├── pmc_registers.json
│   └── param_helper.js
├── fanuc_bridge32.exe               # Executável do bridge 32-bit compilado
├── Fwlib32.dll                      # DLL oficial Fanuc FOCAS
├── package.json                     # Dependências do projeto
├── pm2.config.js                    # Configuração para operação 24/7
├── README.md                        # Esta documentação
└── start_service.bat                # Script de inicialização rápida
```

---

## 🚀 Como Iniciar em Produção

### Opção 1: Via Script em Lote (Recomendado no Windows)
Dê um duplo clique no arquivo:
```cmd
start_service.bat
```

### Opção 2: Via Linha de Comando (Node.js)
```bash
npm start
# ou
node src/server.js
```

### Opção 3: Operação 24/7 com PM2
```bash
npx pm2 start pm2.config.js
npx pm2 save
```

Após iniciar, acesse no navegador: **`http://localhost:3000`**

---

## 🗄️ Esquema do Banco de Dados SQLite

### Tabela `machines`
| Coluna | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | INTEGER PRIMARY KEY | Identificador único da máquina |
| `name` | TEXT | Nome descritivo (ex: "Centro de Usinagem 01") |
| `model` | TEXT | Modelo do CNC (ex: "Fanuc Series 0i-TF") |
| `driver` | TEXT | Driver (`focas_dll`, `focas_tcp`, `opcua`) |
| `host` | TEXT | Endereço IP da máquina |
| `focas_port` | INTEGER | Porta FOCAS (padrão `8193`) |
| `opcua_port` | INTEGER | Porta OPC UA (padrão `4840`) |
| `opcua_endpoint` | TEXT | URL do endpoint OPC UA |
| `username` / `password` | TEXT | Credenciais de autenticação |
| `timeout` | INTEGER | Timeout em milissegundos |
| `enabled` | INTEGER | `1` = Ativa, `0` = Desativada |

### Tabela `machine_pmc_tags`
| Coluna | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | INTEGER PRIMARY KEY | Identificador da tag |
| `machine_id` | INTEGER | ID da máquina proprietária (FK) |
| `name` | TEXT | Nome da tag (ex: `Sensor_Pressao`) |
| `direction` | TEXT | `'READ'` (Leitura periódica) ou `'WRITE'` (Escrita/Comando) |
| `address_type` | TEXT | Tipo de endereço (`R`, `D`, `X`, `Y`, `K`, `G`, `F`, `A`) |
| `address` | INTEGER | Endereço numérico (ex: `1000`, `0`, `500`) |
| `length` | INTEGER | Quantidade de registradores |
| `data_type` | TEXT | `Byte` (8b), `Word` (16b), `Long` (32b) |
| `write_value` | TEXT | Valor configurado para comandos de escrita |
| `description` | TEXT | Descrição funcional da tag |

---

## 🔌 Principais Endpoints da API REST

### Máquinas
- `GET /api/machines`: Retorna todas as máquinas cadastradas e sua telemetria atual.
- `POST /api/machines`: Cadastra uma nova máquina no banco de dados SQLite.
- `GET /api/machines/:id`: Retorna detalhes e telemetria de uma máquina.
- `PUT /api/machines/:id`: Atualiza configurações de uma máquina.
- `DELETE /api/machines/:id`: Exclui a máquina e suas tags vinculadas.
- `POST /api/machines/:id/connect`: Estabelece conexão com a máquina.
- `POST /api/machines/:id/disconnect`: Encerra a conexão.

### Tags de Leitura e Escrita do CLP (PMC)
- `GET /api/machines/:id/pmc/tags`: Lista as tags cadastradas (filtro opcional `?direction=READ` ou `?direction=WRITE`).
- `POST /api/machines/:id/pmc/tags`: Cria e persiste uma nova tag de Leitura ou Escrita no SQLite.
- `PUT /api/machines/:id/pmc/tags/:tagId`: Atualiza uma tag existente.
- `POST /api/machines/:id/pmc/tags/:tagId/write`: Dispara a escrita imediata do valor no CLP da máquina.
- `DELETE /api/machines/:id/pmc/tags/:tagId`: Remove uma tag do banco.

### Operações Manuais e Parâmetros CNC
- `GET /api/machines/:id/pmc/read`: Leitura pontual de registradores.
- `POST /api/machines/:id/pmc/write`: Escrita pontual em registradores.
- `GET /api/machines/:id/parameter/read`: Leitura de parâmetro CNC.
- `POST /api/machines/:id/parameter/write`: Gravação de parâmetro CNC.

---

## 🛡️ Licença e Suporte
Desenvolvido para ambientes industriais com alta confiabilidade e suporte 24/7.
