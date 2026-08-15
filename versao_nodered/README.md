# 🔴 Integração Industrial Fanuc FOCAS / OPC UA para Node-RED

Fluxos prontos para o **Node-RED** com visualização em Dashboard, publicação de telemetria em tempo real via **MQTT** para sistemas MES/ERP e controle de bits do CLP (PMC).

---

## 📊 Recursos do Fluxo Pré-Configurado

-  gauges de **Rotação do Spindle** (0 a 12.000 RPM) e **Avanço Feedrate** (0 a 5.000 mm/min).
- Cards com as **Posições dos Eixos X, Y, Z, A** em milímetros com 3 casas decimais.
- Monitor de **Produção**: Peças produzidas, Programa CNC ativo (ex: `O4712`), Modo de operação e Status.
- **Conector MQTT Indústria 4.0**: Publica automaticamente no tópico `factory/fanuc/cnc01/telemetry` a cada segundo.
- Integração transparente com a API REST / WebSocket do servidor Fanuc FOCAS.

---

## 🚀 Como Iniciar

1. Certifique-se de que a aplicação principal Fanuc esteja rodando (em `versao_teste` ou `versao_producao`).
2. Entre na pasta `versao_nodered`:
   ```bash
   cd versao_nodered
   ```
3. Execute:
   ```bash
   start_nodered.bat
   ```
   *Ou pelo terminal:*
   ```bash
   npx node-red -s settings.js -u . flows.json
   ```

4. Acesse:
   - **Editor de Fluxos do Node-RED:** [`http://localhost:1880`](http://localhost:1880)
   - **Dashboard Industrial Visual:** [`http://localhost:1880/ui`](http://localhost:1880/ui)
