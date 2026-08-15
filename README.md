# 🤖 Fanuc FOCAS & CLP (PMC) - Aplicação de Comunicação Industrial

Aplicação em JavaScript (Node.js) e C# para comunicação, leitura e escrita de registradores do CLP (PMC) e parâmetros em máquinas CNC Fanuc através de múltiplos drivers industriais (FOCAS Nativo com DLLs oficiais `Fwlib32.dll`, FOCAS TCP Socket direto e OPC UA).

---

## 📁 Estrutura do Repositório

- **[`versao_teste/`](./versao_teste/)**: Versão completa da aplicação industrial:
  - **`src/`**: Clientes, drivers industriais (`opcua`, `focas_dll`, `focas_tcp`), decodificadores e servidor Express/WebSocket.
  - **`public/`**: Dashboard Web industrial com telemetria em tempo real, editor de PMC e matriz interativa de bits/LEDs.
  - **`util/`**: Catálogo estruturado de parâmetros Fanuc (`fanuc_parameters.json`), mapeamento de registradores do CLP (`pmc_registers.json`), funções de busca (`param_helper.js`) e [Guia Técnico de Parâmetros](./versao_teste/util/GUIA_PARAMETROS_E_PMC_FANUC.md).
  - **`fanuc_bridge32.exe` / `fwlib32.cs` / `fwlib32.h`**: Bridge nativo x86 e mapeamento completo FOCAS.
  - **DLLs Oficiais Fanuc**: `Fwlib32.dll`, `fwlib30i.dll`, `fwlib0iD.dll`, `fwlibe1.dll`, `Fwlib160.dll`, `Fwlib150.dll`, etc.

---

## 🚀 Como Executar

1. Entre na pasta `versao_teste`:
   ```bash
   cd versao_teste
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

3. Inicie o Dashboard Web:
   ```bash
   npm start
   ```
   Acesse no navegador: **`http://localhost:3000`**

4. Ou utilize o console interativo CLI:
   ```bash
   npm run cli
   ```
