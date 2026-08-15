/**
 * Frontend JavaScript para o Dashboard Fanuc FOCAS / CLP
 */

let ws = null;
let currentConfig = null;

// Elementos da UI
const statusPill = document.getElementById('connection-status-pill');
const statusText = document.getElementById('status-text');
const driverBadge = document.getElementById('current-driver-badge');
const cncModeBadge = document.getElementById('cnc-mode-badge');
const cncRunStatus = document.getElementById('cnc-run-status');
const cncAlarmStatus = document.getElementById('cnc-alarm-status');
const cncFeedrate = document.getElementById('cnc-feedrate');
const cncSpindle = document.getElementById('cnc-spindle');

const axisX = document.getElementById('axis-x');
const axisY = document.getElementById('axis-y');
const axisZ = document.getElementById('axis-z');
const axisA = document.getElementById('axis-a');

const logsConsole = document.getElementById('logs-console');
const toastContainer = document.getElementById('toast-container');

// Modal Elements
const configModal = document.getElementById('config-modal');
const btnConfigModal = document.getElementById('btn-config-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnModalSave = document.getElementById('btn-modal-save');
const btnModalDisconnect = document.getElementById('btn-modal-disconnect');

// Bit Matrices
const matrixX0 = document.getElementById('bit-matrix-x0');
const matrixY0 = document.getElementById('bit-matrix-y0');
const matrixR1000 = document.getElementById('bit-matrix-r1000');
const matrixK0 = document.getElementById('bit-matrix-k0');

// PMC Control
const pmcType = document.getElementById('pmc-type');
const pmcAddress = document.getElementById('pmc-address');
const pmcCount = document.getElementById('pmc-count');
const pmcDataType = document.getElementById('pmc-data-type');
const btnPmcRead = document.getElementById('btn-pmc-read');
const btnPmcWrite = document.getElementById('btn-pmc-write');
const pmcWriteValues = document.getElementById('pmc-write-values');
const pmcResultsTbody = document.getElementById('pmc-results-tbody');

// Param Control
const paramNumber = document.getElementById('param-number');
const paramAxis = document.getElementById('param-axis');
const paramValueWrite = document.getElementById('param-value-write');
const btnParamRead = document.getElementById('btn-param-read');
const btnParamWrite = document.getElementById('btn-param-write');
const paramResultDisplay = document.getElementById('param-result-display');

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  setupBitMatrices();
  setupEventListeners();
  initWebSocket();
  fetchInitialStatus();
});

// Logs e Toasts
function log(msg, type = 'info') {
  const timeStr = new Date().toTimeString().split(' ')[0];
  const div = document.createElement('div');
  div.className = `log-entry log-${type}`;
  div.innerHTML = `<span class="log-time">[${timeStr}]</span> <span class="log-msg">${msg}</span>`;
  logsConsole.appendChild(div);
  logsConsole.scrollTop = logsConsole.scrollHeight;
}

function showToast(msg, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// Configuração dos Botões de Bits
function setupBitMatrices() {
  function renderBits(container, addressType, address, isReadOnly = false) {
    container.innerHTML = '';
    for (let bit = 7; bit >= 0; bit--) {
      const btn = document.createElement('div');
      btn.className = 'bit-btn';
      btn.id = `bit-${addressType}${address}-${bit}`;
      btn.innerHTML = `<span class="bit-num">.${bit}</span><span class="bit-indicator"></span>`;
      
      if (!isReadOnly) {
        btn.onclick = async () => {
          const isActive = btn.classList.contains('active');
          const newVal = isActive ? 0 : 1;
          try {
            const res = await fetch('/api/pmc/bit/write', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: addressType, address, bit, value: newVal })
            });
            const data = await res.json();
            if (data.success) {
              log(`Bit ${addressType}${address}.${bit} alternado para ${newVal}`, 'success');
              btn.classList.toggle('active', newVal === 1);
            }
          } catch (e) {
            showToast(`Erro ao alterar bit: ${e.message}`, 'error');
          }
        };
      }
      container.appendChild(btn);
    }
  }

  renderBits(matrixX0, 'X', 0, true); // Entradas são somente leitura da máquina
  renderBits(matrixY0, 'Y', 0, false);
  renderBits(matrixR1000, 'R', 1000, false);
  renderBits(matrixK0, 'K', 0, false);
}

function updateBitGroup(addressType, address, byteVal) {
  for (let bit = 0; bit < 8; bit++) {
    const el = document.getElementById(`bit-${addressType}${address}-${bit}`);
    if (el) {
      const isSet = (byteVal & (1 << bit)) !== 0;
      el.classList.toggle('active', isSet);
    }
  }
}

// Conexão WebSocket para Telemetria em Tempo Real
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    // WebSocket conectado ao servidor local
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'telemetry') {
        updateTelemetry(msg.status, msg.monitoredTags);
      }
    } catch (e) {}
  };

  ws.onclose = () => {
    updateConnectionUI(false, 'DESCONECTADO', 'Servidor offline');
    setTimeout(initWebSocket, 2000);
  };
}

function updateConnectionUI(connected, driverName = '', error = '') {
  if (connected) {
    statusPill.classList.remove('disconnected');
    statusText.textContent = 'CNC CONECTADO';
    driverBadge.textContent = `DRIVER: ${(driverName || 'FANUC').toUpperCase()}`;
    driverBadge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    driverBadge.style.color = '#6ee7b7';
  } else {
    statusPill.classList.add('disconnected');
    statusText.textContent = 'DESCONECTADO';
    driverBadge.textContent = `DRIVER: ${(driverName || 'OFFLINE').toUpperCase()} (OFFLINE)`;
    driverBadge.style.borderColor = 'rgba(239, 68, 68, 0.4)';
    driverBadge.style.color = '#fca5a5';
  }
}

// Atualiza a tela com a telemetria recebida
function updateTelemetry(status, monitoredTags) {
  if (status) {
    const isConn = status.connected === true;
    updateConnectionUI(isConn, status.driver || (currentConfig && currentConfig.connection && currentConfig.connection.driver));

    const elProg = document.getElementById('cnc-program');
    const elParts = document.getElementById('cnc-parts-count');

    if (isConn) {
      if (status.mode) cncModeBadge.textContent = `MODO: ${status.mode}`;
      if (status.runStatus) cncRunStatus.textContent = status.runStatus;
      if (status.feedrate !== undefined) cncFeedrate.textContent = `${status.feedrate} mm/min`;
      if (status.spindleSpeed !== undefined) cncSpindle.textContent = `${status.spindleSpeed} RPM`;
      if (elProg && status.program !== undefined) elProg.textContent = status.program;
      if (elParts && status.partsCount !== undefined) elParts.textContent = status.partsCount;
      
      if (status.alarm !== undefined) {
        cncAlarmStatus.textContent = status.alarm ? (status.alarmText || 'ALARME ATIVO') : (status.alarmText || 'Normal');
        cncAlarmStatus.className = status.alarm ? 'telemetry-value text-danger' : 'telemetry-value status-ok';
      }
      
      if (status.positions) {
        if (status.positions.X !== undefined) axisX.textContent = typeof status.positions.X === 'number' ? status.positions.X.toFixed(3) : status.positions.X;
        if (status.positions.Y !== undefined) axisY.textContent = typeof status.positions.Y === 'number' ? status.positions.Y.toFixed(3) : status.positions.Y;
        if (status.positions.Z !== undefined) axisZ.textContent = typeof status.positions.Z === 'number' ? status.positions.Z.toFixed(3) : status.positions.Z;
        if (status.positions.A !== undefined) axisA.textContent = typeof status.positions.A === 'number' ? status.positions.A.toFixed(3) : status.positions.A;
      }
    } else {
      cncModeBadge.textContent = 'MODO: OFFLINE';
      cncRunStatus.textContent = 'DESCONECTADO';
      cncFeedrate.textContent = '---';
      cncSpindle.textContent = '---';
      if (elProg) elProg.textContent = '---';
      if (elParts) elParts.textContent = '---';
      cncAlarmStatus.textContent = '---';
      cncAlarmStatus.className = 'telemetry-value text-muted';
      axisX.textContent = '---';
      axisY.textContent = '---';
      axisZ.textContent = '---';
      axisA.textContent = '---';

      // Limpa valores de texto e apaga todos os LEDs de bits
      const elX0 = document.getElementById('byte-val-x0');
      const elY0 = document.getElementById('byte-val-y0');
      const elR1000 = document.getElementById('byte-val-r1000');
      const elK0 = document.getElementById('byte-val-k0');
      if (elX0) elX0.textContent = 'Valor: ---';
      if (elY0) elY0.textContent = 'Valor: ---';
      if (elR1000) elR1000.textContent = 'Valor: ---';
      if (elK0) elK0.textContent = 'Valor: ---';

      document.querySelectorAll('.bit-btn').forEach(btn => btn.classList.remove('active'));
    }
  }

  if (monitoredTags && Array.isArray(monitoredTags)) {
    monitoredTags.forEach(item => {
      if (item.data && item.data.values && item.data.values.length > 0) {
        const type = item.data.addressType;
        const addr = item.data.startAddress;
        const firstVal = item.data.values[0];

        if (type === 'X' && addr === 0) {
          document.getElementById('byte-val-x0').textContent = `Valor: ${firstVal} (0x${firstVal.toString(16).toUpperCase().padStart(2, '0')})`;
          updateBitGroup('X', 0, firstVal);
        } else if (type === 'Y' && addr === 0) {
          document.getElementById('byte-val-y0').textContent = `Valor: ${firstVal} (0x${firstVal.toString(16).toUpperCase().padStart(2, '0')})`;
          updateBitGroup('Y', 0, firstVal);
        } else if (type === 'R' && addr === 1000) {
          document.getElementById('byte-val-r1000').textContent = `Valor: ${firstVal} (0x${firstVal.toString(16).toUpperCase().padStart(2, '0')})`;
          updateBitGroup('R', 1000, firstVal);
        } else if (type === 'K' && addr === 0) {
          document.getElementById('byte-val-k0').textContent = `Valor: ${firstVal} (0x${firstVal.toString(16).toUpperCase().padStart(2, '0')})`;
          updateBitGroup('K', 0, firstVal);
        }
      }
    });
  }
}

// Obter status inicial
async function fetchInitialStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.success) {
      currentConfig = data.config;
      const isConn = data.status && data.status.connected === true;
      updateConnectionUI(isConn, data.config.connection.driver);

      if (isConn) {
        log(`Conectado via ${data.config.connection.driver.toUpperCase()} em ${data.config.connection.host}`, 'success');
      } else {
        log(`CNC Desconectado (${data.config.connection.driver.toUpperCase()} em ${data.config.connection.host}). Clique em Conexão para configurar.`, 'info');
      }
    }
  } catch (e) {
    updateConnectionUI(false, 'OFFLINE');
    log(`Erro ao obter status inicial: ${e.message}`, 'error');
  }
}

// Event Listeners
function setupEventListeners() {
  // Modal de Configuração
  btnConfigModal.onclick = () => {
    if (currentConfig && currentConfig.connection) {
      document.getElementById('cfg-driver').value = currentConfig.connection.driver || 'opcua';
      document.getElementById('cfg-host').value = currentConfig.connection.host || '127.0.0.1';
      document.getElementById('cfg-port').value = currentConfig.connection.port || 4840;
      document.getElementById('cfg-focas-port').value = currentConfig.connection.focasPort || 8193;
      document.getElementById('cfg-opcua-endpoint').value = currentConfig.connection.opcuaEndpoint || 'opc.tcp://127.0.0.1:4840';
    }
    configModal.classList.add('open');
  };

  btnCloseModal.onclick = () => configModal.classList.remove('open');

  btnModalSave.onclick = async () => {
    const newConn = {
      driver: document.getElementById('cfg-driver').value,
      host: document.getElementById('cfg-host').value,
      port: Number(document.getElementById('cfg-port').value),
      focasPort: Number(document.getElementById('cfg-focas-port').value),
      opcuaEndpoint: document.getElementById('cfg-opcua-endpoint').value
    };

    try {
      const res = await fetch('/api/connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConn)
      });
      const data = await res.json();
      if (data.success) {
        showToast('Configuração salva e reconectada!', 'success');
        configModal.classList.remove('open');
        fetchInitialStatus();
      } else {
        showToast(data.error || 'Erro ao conectar', 'error');
      }
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  btnModalDisconnect.onclick = async () => {
    try {
      await fetch('/api/disconnect', { method: 'POST' });
      showToast('Desconectado', 'info');
      configModal.classList.remove('open');
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  // Leitura de PMC
  btnPmcRead.onclick = async () => {
    const type = pmcType.value;
    const addr = Number(pmcAddress.value);
    const count = Number(pmcCount.value);
    const dataType = pmcDataType.value;

    try {
      const res = await fetch(`/api/pmc/read?type=${type}&address=${addr}&count=${count}&dataType=${dataType}`);
      const data = await res.json();

      if (data.success && data.data) {
        const pmc = data.data;
        pmcResultsTbody.innerHTML = '';
        log(`Leitura de ${pmc.count} item(ns) em ${pmc.addressType}${pmc.startAddress} realizada com sucesso`, 'success');

        pmc.values.forEach((val, idx) => {
          const row = document.createElement('tr');
          const currentAddr = `${pmc.addressType}${pmc.startAddress + idx}`;
          const hex = '0x' + (val < 0 ? (val >>> 0) : val).toString(16).toUpperCase();
          const bin = pmc.dataType === 'Byte' ? (val & 0xFF).toString(2).padStart(8, '0') : '-';

          row.innerHTML = `
            <td><strong>${currentAddr}</strong></td>
            <td>${val}</td>
            <td><code>${hex}</code></td>
            <td><code>${bin}</code></td>
          `;
          pmcResultsTbody.appendChild(row);
        });
      } else {
        showToast(data.error || 'Erro na leitura', 'error');
        log(`Erro na leitura PMC: ${data.error}`, 'error');
      }
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  // Escrita de PMC
  btnPmcWrite.onclick = async () => {
    const type = pmcType.value;
    const addr = Number(pmcAddress.value);
    const dataType = pmcDataType.value;
    const rawVal = pmcWriteValues.value.trim();

    if (!rawVal) {
      showToast('Insira os valores a serem escritos', 'warning');
      return;
    }

    const values = rawVal.split(',').map(v => Number(v.trim()));

    try {
      const res = await fetch('/api/pmc/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, address: addr, values, dataType })
      });
      const data = await res.json();

      if (data.success) {
        showToast(`Valores gravados em ${type}${addr}!`, 'success');
        log(`Escrita concluída em ${type}${addr}: [${values.join(', ')}]`, 'success');
        btnPmcRead.click(); // Atualiza tabela de visualização
      } else {
        showToast(data.error || 'Erro na escrita', 'error');
        log(`Erro ao escrever no PMC: ${data.error}`, 'error');
      }
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  // Leitura de Parâmetro CNC
  btnParamRead.onclick = async () => {
    const num = Number(paramNumber.value);
    const axis = Number(paramAxis.value);

    try {
      const res = await fetch(`/api/parameter/read?paramNumber=${num}&axis=${axis}`);
      const data = await res.json();

      if (data.success && data.data) {
        const p = data.data;
        paramResultDisplay.innerHTML = `
          <strong>Parâmetro #${p.paramNumber}</strong> (Eixo ${p.axis}): 
          <span style="color: var(--accent-cyan); font-size: 1.1rem; font-weight: bold;">${p.value}</span> 
          <span class="text-muted">(${p.type})</span>
        `;
        log(`Parâmetro #${p.paramNumber} (Eixo ${p.axis}) lido: ${p.value}`, 'success');
      } else {
        showToast(data.error || 'Erro ao ler parâmetro', 'error');
      }
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  // Escrita de Parâmetro CNC
  btnParamWrite.onclick = async () => {
    const num = Number(paramNumber.value);
    const axis = Number(paramAxis.value);
    const val = Number(paramValueWrite.value);

    try {
      const res = await fetch('/api/parameter/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paramNumber: num, axis, value: val })
      });
      const data = await res.json();

      if (data.success) {
        showToast(`Parâmetro #${num} salvo com sucesso!`, 'success');
        log(`Parâmetro #${num} (Eixo ${axis}) gravado: ${val}`, 'success');
        btnParamRead.click();
      } else {
        showToast(data.error || 'Erro ao salvar parâmetro', 'error');
      }
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  // Limpar Logs
  document.getElementById('btn-clear-logs').onclick = () => {
    logsConsole.innerHTML = '';
  };
}
