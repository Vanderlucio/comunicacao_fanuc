/**
 * Frontend JavaScript - Console Multi-Máquinas Fanuc & CLP (PMC)
 * Gerenciamento de instâncias individuais e controle em tempo real
 */

document.addEventListener('DOMContentLoaded', () => {
  // Estado Global
  let fleetData = [];
  let activeMachineId = null;
  let activeMachineData = null;
  let ws = null;

  // Elementos do DOM
  const fleetGrid = document.getElementById('fleet-grid');
  const statTotal = document.getElementById('stat-total-machines');
  const statConnected = document.getElementById('stat-connected-machines');
  const terminalLogs = document.getElementById('terminal-logs');

  // Modais
  const modalMachineConfig = document.getElementById('modal-machine-config');
  const modalMachinePanel = document.getElementById('modal-machine-panel');
  const modalAddTag = document.getElementById('modal-add-tag');
  const modalConfirmDelete = document.getElementById('modal-confirm-delete');
  const confirmDeleteMsg = document.getElementById('confirm-delete-msg');
  const confirmDeleteTitle = document.getElementById('confirm-delete-title');
  const btnActionConfirmDelete = document.getElementById('btn-action-confirm-delete');
  const btnCancelConfirmDelete = document.getElementById('btn-cancel-confirm-delete');
  const btnCloseConfirmDelete = document.getElementById('btn-close-confirm-delete');

  let onConfirmCallback = null;

  function showConfirmModal({ title, message, onConfirm }) {
    if (confirmDeleteTitle) confirmDeleteTitle.textContent = title || '🗑️ Confirmar Exclusão';
    if (confirmDeleteMsg) confirmDeleteMsg.innerHTML = message || 'Tem certeza que deseja excluir?';
    onConfirmCallback = onConfirm;
    modalConfirmDelete.classList.add('active');
  }

  function closeConfirmModal() {
    modalConfirmDelete.classList.remove('active');
    onConfirmCallback = null;
  }

  btnCancelConfirmDelete.addEventListener('click', closeConfirmModal);
  btnCloseConfirmDelete.addEventListener('click', closeConfirmModal);
  btnActionConfirmDelete.addEventListener('click', async () => {
    if (typeof onConfirmCallback === 'function') {
      const cb = onConfirmCallback;
      closeConfirmModal();
      await cb();
    } else {
      closeConfirmModal();
    }
  });

  // Botões Globais
  document.getElementById('btn-open-add-machine').addEventListener('click', () => openMachineModal());
  document.getElementById('btn-close-machine-modal').addEventListener('click', () => closeModal(modalMachineConfig));
  document.getElementById('btn-cancel-machine').addEventListener('click', () => closeModal(modalMachineConfig));
  document.getElementById('btn-close-machine-panel').addEventListener('click', () => closeMachinePanel());
  document.getElementById('btn-refresh-fleet').addEventListener('click', () => loadFleet());
  document.getElementById('btn-clear-logs').addEventListener('click', () => { terminalLogs.innerHTML = ''; });

  // Botões Adicionar Tag (Leitura vs Escrita)
  document.getElementById('btn-open-add-read-tag').addEventListener('click', () => openAddTagModal('READ'));
  document.getElementById('btn-open-add-write-tag').addEventListener('click', () => openAddTagModal('WRITE'));
  document.getElementById('btn-close-add-tag').addEventListener('click', () => { modalAddTag.classList.remove('active'); });
  document.getElementById('btn-cancel-add-tag').addEventListener('click', () => { modalAddTag.classList.remove('active'); });

  // Alternância de Direção no Modal de Tag
  const btnDirRead = document.getElementById('btn-dir-read');
  const btnDirWrite = document.getElementById('btn-dir-write');
  const inputTagDir = document.getElementById('input-tag-direction');
  const groupWriteVal = document.getElementById('group-write-value');

  btnDirRead.addEventListener('click', () => setTagDirection('READ'));
  btnDirWrite.addEventListener('click', () => setTagDirection('WRITE'));

  function setTagDirection(dir) {
    inputTagDir.value = dir;
    if (dir === 'READ') {
      btnDirRead.classList.add('active');
      btnDirWrite.classList.remove('active');
      groupWriteVal.style.display = 'none';
      document.getElementById('modal-tag-title').textContent = '📥 Cadastrar Tag de Leitura';
    } else {
      btnDirWrite.classList.add('active');
      btnDirRead.classList.remove('active');
      groupWriteVal.style.display = 'block';
      document.getElementById('modal-tag-title').textContent = '📤 Cadastrar Tag de Escrita';
    }
  }

  function openAddTagModal(direction = 'READ') {
    setTagDirection(direction);
    document.getElementById('form-add-tag').reset();
    document.getElementById('input-tag-direction').value = direction;
    modalAddTag.classList.add('active');
  }

  // Abas do Painel Individual
  const panelTabs = document.querySelectorAll('.panel-tab');
  panelTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      panelTabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const target = document.getElementById(tab.dataset.tab);
      if (target) target.classList.add('active');
    });
  });

  // Alternância de Campos no Modal de Máquina (FOCAS vs OPC UA)
  const driverSelect = document.getElementById('select-machine-driver');
  driverSelect.addEventListener('change', () => {
    const isOpcUa = driverSelect.value === 'opcua';
    document.getElementById('options-opcua').style.display = isOpcUa ? 'block' : 'none';
    document.getElementById('options-focas').style.display = isOpcUa ? 'none' : 'block';
  });

  // Formulário de Cadastro/Edição de Máquina
  const formMachineConfig = document.getElementById('form-machine-config');
  formMachineConfig.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('input-machine-id').value;
    const isEdit = Boolean(id);

    const payload = {
      name: document.getElementById('input-machine-name').value.trim(),
      model: document.getElementById('input-machine-model').value.trim(),
      driver: document.getElementById('select-machine-driver').value,
      host: document.getElementById('input-machine-host').value.trim(),
      focas_port: Number(document.getElementById('input-machine-focas-port').value),
      opcua_port: Number(document.getElementById('input-machine-opcua-port').value),
      opcua_endpoint: document.getElementById('input-machine-opcua-endpoint').value.trim(),
      username: document.getElementById('input-machine-username').value.trim(),
      password: document.getElementById('input-machine-password').value,
      timeout: Number(document.getElementById('input-machine-timeout').value)
    };

    try {
      const url = isEdit ? `/api/machines/${id}` : '/api/machines';
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        log(`[Sistema] Máquina '${payload.name}' ${isEdit ? 'atualizada' : 'cadastrada'} com sucesso!`, 'log-success');
        closeModal(modalMachineConfig);
        await loadFleet();
      } else {
        alert(`Erro ao salvar máquina: ${data.error}`);
      }
    } catch (err) {
      log(`[Erro] Falha ao salvar máquina: ${err.message}`, 'log-error');
    }
  });

  // ==================== CARREGAMENTO DA FROTA ====================

  async function loadFleet() {
    try {
      const res = await fetch('/api/machines');
      const json = await res.json();
      if (json.success) {
        fleetData = json.data;
        renderFleetGrid(fleetData);
        updateFleetStats(fleetData);

        if (activeMachineId) {
          const current = fleetData.find(m => m.id === activeMachineId);
          if (current) updateActiveMachineView(current);
        }
      }
    } catch (err) {
      log(`[Erro] Não foi possível carregar a lista de máquinas: ${err.message}`, 'log-error');
    }
  }

  function updateFleetStats(machines) {
    statTotal.textContent = machines.length;
    const connectedCount = machines.filter(m => m.liveStatus && m.liveStatus.connected).length;
    statConnected.textContent = connectedCount;
  }

  function renderFleetGrid(machines) {
    if (machines.length === 0) {
      fleetGrid.innerHTML = `
        <div class="loading-state">
          <span>Nenhuma máquina cadastrada.</span>
          <button class="btn btn-primary" onclick="document.getElementById('btn-open-add-machine').click()">
            ➕ Cadastrar Primeira Máquina
          </button>
        </div>
      `;
      return;
    }

    fleetGrid.innerHTML = machines.map(m => {
      const live = m.liveStatus || { connected: false };
      const isConnected = Boolean(live.connected);
      const dotClass = isConnected ? 'status-indicator-dot connected' : 'status-indicator-dot disconnected';
      const driverLabels = {
        'focas_dll': 'FOCAS DLL',
        'focas_tcp': 'FOCAS TCP',
        'opcua': 'OPC UA'
      };

      const mode = isConnected ? (live.mode || 'Auto') : '---';
      const runStatus = isConnected ? (live.runStatus || 'Parado') : 'DESCONECTADO';
      const prog = isConnected ? (live.program ? `O${live.program}` : '---') : '---';
      const parts = isConnected ? (live.partsCount !== undefined ? live.partsCount : '---') : '---';
      const spindle = isConnected ? (live.spindleSpeed !== undefined ? `${live.spindleSpeed} RPM` : '---') : '---';
      const feed = isConnected ? (live.feedrate !== undefined ? `${live.feedrate} mm/min` : '---') : '---';

      return `
        <div class="machine-card" data-machine-id="${m.id}">
          <div class="machine-card-header">
            <div class="machine-card-title-box">
              <span class="${dotClass}"></span>
              <div>
                <div class="machine-card-name">${escapeHtml(m.name)}</div>
                <div class="machine-card-model">${escapeHtml(m.model || 'CNC Fanuc')}</div>
              </div>
            </div>
            <span class="machine-driver-badge">${driverLabels[m.driver] || m.driver}</span>
          </div>

          <div class="machine-card-body">
            <div class="machine-meta-row">
              <span>Endereço IP:</span>
              <span class="machine-meta-val">${escapeHtml(m.host)}:${m.driver === 'opcua' ? m.opcua_port : m.focas_port}</span>
            </div>
            <div class="machine-meta-row">
              <span>Status:</span>
              <span class="machine-meta-val ${isConnected ? 'text-success' : 'text-danger'}">
                ${isConnected ? '🟢 CONECTADO' : '🔴 DESCONECTADO'}
              </span>
            </div>

            <!-- Mini Telemetria -->
            <div class="machine-telemetry-preview">
              <div class="preview-item">
                <span class="preview-label">Modo</span>
                <span class="preview-val">${mode}</span>
              </div>
              <div class="preview-item">
                <span class="preview-label">Execução</span>
                <span class="preview-val">${runStatus}</span>
              </div>
              <div class="preview-item">
                <span class="preview-label">Programa</span>
                <span class="preview-val highlight">${prog}</span>
              </div>
              <div class="preview-item">
                <span class="preview-label">Peças</span>
                <span class="preview-val highlight">${parts}</span>
              </div>
              <div class="preview-item">
                <span class="preview-label">Spindle</span>
                <span class="preview-val">${spindle}</span>
              </div>
              <div class="preview-item">
                <span class="preview-label">Avanço</span>
                <span class="preview-val">${feed}</span>
              </div>
            </div>
          </div>

          <div class="machine-card-footer">
            <button class="btn btn-primary btn-sm btn-open-panel" data-id="${m.id}">
              ⚡ Abrir Painel de Controle
            </button>
            <div style="display:flex; gap: 0.35rem;">
              <button class="btn btn-secondary btn-icon-only btn-edit-machine" data-id="${m.id}" title="Editar Configurações">
                ✏️
              </button>
              <button class="btn btn-secondary btn-icon-only btn-delete-machine" data-id="${m.id}" title="Excluir Máquina">
                🗑️
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Event Listeners nos botões dos cards
    document.querySelectorAll('.btn-open-panel').forEach(b => {
      b.addEventListener('click', (e) => {
        const id = Number(e.currentTarget.dataset.id);
        openMachinePanel(id);
      });
    });

    document.querySelectorAll('.btn-edit-machine').forEach(b => {
      b.addEventListener('click', (e) => {
        const id = Number(e.currentTarget.dataset.id);
        const m = fleetData.find(x => x.id === id);
        if (m) openMachineModal(m);
      });
    });

    document.querySelectorAll('.btn-delete-machine').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = Number(e.currentTarget.dataset.id);
        const m = fleetData.find(x => x.id === id);
        const machineName = m ? m.name : `ID ${id}`;

        showConfirmModal({
          title: '🗑️ Excluir Máquina CNC',
          message: `Deseja realmente excluir a máquina <strong>${escapeHtml(machineName)}</strong> e todas as suas configurações cadastradas?`,
          onConfirm: async () => {
            await deleteMachine(id);
          }
        });
      });
    });
  }

  // ==================== PAINEL INDIVIDUAL DA MÁQUINA (MODAL 2) ====================

  async function openMachinePanel(machineId) {
    activeMachineId = machineId;
    activeMachineData = fleetData.find(m => m.id === machineId);

    if (!activeMachineData) {
      log(`[Aviso] Máquina ID ${machineId} não encontrada.`, 'log-warn');
      return;
    }

    document.getElementById('panel-machine-title').textContent = activeMachineData.name;
    document.getElementById('panel-machine-subtitle').textContent = `IP: ${activeMachineData.host} | Driver: ${activeMachineData.driver.toUpperCase()} | Modelo: ${activeMachineData.model || 'CNC Fanuc'}`;
    
    updateActiveMachineView(activeMachineData);
    modalMachinePanel.classList.add('active');
  }

  function closeMachinePanel() {
    modalMachinePanel.classList.remove('active');
    activeMachineId = null;
    activeMachineData = null;
  }

  function updateActiveMachineView(machine) {
    if (!machine || machine.id !== activeMachineId) return;

    const live = machine.liveStatus || { connected: false };
    const isConnected = Boolean(live.connected);

    // Indicador e Botão Conectar
    const dot = document.getElementById('panel-machine-dot');
    dot.className = isConnected ? 'status-indicator-dot connected' : 'status-indicator-dot disconnected';

    const btnToggle = document.getElementById('btn-panel-toggle-connect');
    btnToggle.textContent = isConnected ? '🛑 Desconectar' : '🔌 Conectar';
    btnToggle.className = isConnected ? 'btn btn-danger btn-sm' : 'btn btn-outline btn-sm';
    btnToggle.onclick = async () => {
      const endpoint = isConnected ? 'disconnect' : 'connect';
      try {
        log(`[Comando] ${isConnected ? 'Desconectando' : 'Conectando'} ${machine.name}...`, 'log-info');
        const res = await fetch(`/api/machines/${machine.id}/${endpoint}`, { method: 'POST' });
        const resData = await res.json();
        if (resData.success) {
          log(`[Conexão] ${machine.name}: ${isConnected ? 'Desconectado' : 'Conectado com sucesso'}`, 'log-success');
          await loadFleet();
        }
      } catch (err) {
        log(`[Erro] Falha ao alternar conexão: ${err.message}`, 'log-error');
      }
    };

    // Telemetria Operacional
    document.getElementById('panel-cnc-mode').textContent = isConnected ? (live.mode || '---') : '---';
    document.getElementById('panel-cnc-run').textContent = isConnected ? (live.runStatus || '---') : 'DESCONECTADO';
    document.getElementById('panel-cnc-prog').textContent = isConnected ? (live.program ? `O${live.program}` : '---') : '---';
    document.getElementById('panel-cnc-parts').textContent = isConnected ? (live.partsCount !== undefined ? live.partsCount : '---') : '---';
    document.getElementById('panel-cnc-feed').textContent = isConnected ? (live.feedrate !== undefined ? `${live.feedrate} mm/min` : '---') : '---';
    document.getElementById('panel-cnc-spindle').textContent = isConnected ? (live.spindleSpeed !== undefined ? `${live.spindleSpeed} RPM` : '---') : '---';
    document.getElementById('panel-cnc-alarm').textContent = isConnected ? (live.alarm ? `⚠️ ${live.alarmText}` : 'Normal') : '---';

    // Eixos
    const pos = isConnected && live.positions ? live.positions : {};
    document.getElementById('panel-axis-x').textContent = isConnected && pos.X !== undefined ? (typeof pos.X === 'number' ? pos.X.toFixed(3) : pos.X) : '---';
    document.getElementById('panel-axis-y').textContent = isConnected && pos.Y !== undefined ? (typeof pos.Y === 'number' ? pos.Y.toFixed(3) : pos.Y) : '---';
    document.getElementById('panel-axis-z').textContent = isConnected && pos.Z !== undefined ? (typeof pos.Z === 'number' ? pos.Z.toFixed(3) : pos.Z) : '---';
    document.getElementById('panel-axis-a').textContent = isConnected && pos.A !== undefined ? (typeof pos.A === 'number' ? pos.A.toFixed(3) : pos.A) : '---';

    // Renderiza Tabelas de Tags de Leitura e Escrita
    renderPmcTagsSection(machine);

    // Atualiza Painel de Bits (I/O)
    renderBitMatrices(machine);
  }

  // ==================== SEÇÃO DE TAGS DE LEITURA & ESCRITA PMC ====================

  function renderPmcTagsSection(machine) {
    const isConnected = Boolean(machine.liveStatus && machine.liveStatus.connected);
    const tags = machine.monitoredTags || [];

    const readTags = tags.filter(t => (t.direction || (t.tag && t.tag.direction) || 'READ').toUpperCase() === 'READ');
    const writeTags = tags.filter(t => (t.direction || (t.tag && t.tag.direction) || 'READ').toUpperCase() === 'WRITE');

    // 1. Tabela de Tags de Leitura (READ)
    const tbodyRead = document.getElementById('tbody-read-tags');
    if (readTags.length === 0) {
      tbodyRead.innerHTML = `<tr><td colspan="8" class="text-center text-muted">Nenhuma tag de leitura cadastrada. Clique em '+ Adicionar Tag de Leitura'.</td></tr>`;
    } else {
      tbodyRead.innerHTML = readTags.map(item => {
        const tag = item.tag || {};
        const data = item.data;
        const val = isConnected && data && data.values && data.values.length > 0 ? data.values[0] : null;
        const num = val !== null ? (typeof val === 'number' ? val : (Number(val) || 0)) : null;

        const decDisplay = num !== null ? `<strong>${num}</strong>` : '<span class="text-muted">---</span>';
        const hexDisplay = num !== null ? `<code>0x${num.toString(16).toUpperCase().padStart(tag.data_type === 'Word' ? 4 : 2, '0')}</code>` : '<span class="text-muted">---</span>';
        const binDisplay = num !== null ? `<code>${num.toString(2).padStart(8, '0')}</code>` : '<span class="text-muted">---</span>';

        return `
          <tr>
            <td><strong>${escapeHtml(tag.name || 'Tag')}</strong></td>
            <td><code class="text-accent">${tag.address_type}${tag.address}</code></td>
            <td>${tag.data_type || 'Byte'}</td>
            <td>${decDisplay}</td>
            <td>${hexDisplay}</td>
            <td>${binDisplay}</td>
            <td>${escapeHtml(tag.description || '-')}</td>
            <td>
              <button class="btn btn-secondary btn-xs btn-delete-tag" data-tag-id="${tag.id}">🗑️</button>
            </td>
          </tr>
        `;
      }).join('');
    }

    // 2. Tabela de Tags de Escrita (WRITE)
    const tbodyWrite = document.getElementById('tbody-write-tags');
    if (writeTags.length === 0) {
      tbodyWrite.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Nenhuma tag de escrita cadastrada. Clique em '+ Adicionar Tag de Escrita'.</td></tr>`;
    } else {
      tbodyWrite.innerHTML = writeTags.map(item => {
        const tag = item.tag || {};
        const currentWriteVal = tag.write_value !== undefined ? tag.write_value : '0';

        return `
          <tr>
            <td><strong>${escapeHtml(tag.name || 'Comando')}</strong></td>
            <td><code class="text-accent">${tag.address_type}${tag.address}</code></td>
            <td>${tag.data_type || 'Byte'}</td>
            <td>
              <input type="text" class="form-control input-tag-val" id="write-val-input-${tag.id}" value="${escapeHtml(currentWriteVal)}" style="max-width:110px; padding:0.35rem 0.5rem; font-family:var(--font-mono);">
            </td>
            <td>
              <button class="btn btn-danger btn-xs btn-execute-tag-write" data-tag-id="${tag.id}">
                ⚡ Escrever no CLP
              </button>
            </td>
            <td>${escapeHtml(tag.description || '-')}</td>
            <td>
              <button class="btn btn-secondary btn-xs btn-delete-tag" data-tag-id="${tag.id}">🗑️</button>
            </td>
          </tr>
        `;
      }).join('');
    }

    // Event Listeners de Disparo de Escrita
    tbodyWrite.querySelectorAll('.btn-execute-tag-write').forEach(btn => {
      btn.onclick = async () => {
        const tagId = btn.dataset.tagId;
        const valInput = document.getElementById(`write-val-input-${tagId}`);
        const customValue = valInput ? valInput.value.trim() : '0';

        try {
          log(`[Escrita Tag] Enviando comando para tag ID ${tagId} (Valor: ${customValue}) na máquina ${machine.id}...`, 'log-info');
          const res = await fetch(`/api/machines/${machine.id}/pmc/tags/${tagId}/write`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: customValue })
          });
          const resJson = await res.json();
          if (resJson.success) {
            log(`[Escrita Tag OK] Comando executado com sucesso no CLP!`, 'log-success');
            await loadFleet();
          } else {
            alert(`Erro ao executar escrita: ${resJson.error}`);
          }
        } catch (e) {
          log(`[Erro Escrita Tag] ${e.message}`, 'log-error');
        }
      };
    });

    // Event Listeners de Exclusão de Tags (com Modal Customizado de Confirmação)
    document.querySelectorAll('.btn-delete-tag').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const tagId = btn.dataset.tagId;
        const tagObj = tags.find(t => (t.tag && String(t.tag.id) === String(tagId)) || (t.id && String(t.id) === String(tagId)));
        const tagName = tagObj && tagObj.tag ? tagObj.tag.name : (tagObj ? tagObj.name : `ID ${tagId}`);
        const tagAddr = tagObj && tagObj.tag ? `${tagObj.tag.address_type}${tagObj.tag.address}` : '';

        showConfirmModal({
          title: '🗑️ Excluir Tag do CLP',
          message: `Deseja realmente excluir a tag <strong>${escapeHtml(tagName)}</strong> ${tagAddr ? `(<code>${tagAddr}</code>)` : ''}?`,
          onConfirm: async () => {
            try {
              const res = await fetch(`/api/machines/${machine.id}/pmc/tags/${tagId}`, { method: 'DELETE' });
              const json = await res.json();
              if (json.success) {
                log(`[Sistema] Tag '${tagName}' excluída com sucesso.`, 'log-info');
                await loadFleet();
              } else {
                alert(`Erro ao excluir tag: ${json.error}`);
              }
            } catch (err) {
              log(`[Erro] Falha ao excluir tag: ${err.message}`, 'log-error');
            }
          }
        });
      };
    });
  }

  // ==================== PAINEL DE BITS (I/O) ====================

  function renderBitMatrices(machine) {
    const isConnected = Boolean(machine.liveStatus && machine.liveStatus.connected);
    const tags = machine.monitoredTags || [];
    const getByteVal = (type, addr) => {
      if (!isConnected) return null;
      const found = tags.find(t => t.tag && t.tag.address_type === type && Number(t.tag.address) === addr);
      if (found && found.data && found.data.values && found.data.values.length > 0) {
        return found.data.values[0];
      }
      return null;
    };

    renderBitGroup('panel-matrix-x0', 'panel-byte-x0', 'X', 0, getByteVal('X', 0), false);
    renderBitGroup('panel-matrix-y0', 'panel-byte-y0', 'Y', 0, getByteVal('Y', 0), true);
    renderBitGroup('panel-matrix-r1000', 'panel-byte-r1000', 'R', 1000, getByteVal('R', 1000), true);
    renderBitGroup('panel-matrix-k0', 'panel-byte-k0', 'K', 0, getByteVal('K', 0), true);
  }

  function renderBitGroup(matrixId, labelId, type, address, val, allowWrite) {
    const matrix = document.getElementById(matrixId);
    const label = document.getElementById(labelId);
    if (!matrix) return;

    if (val === null || val === undefined) {
      label.textContent = 'Valor: ---';
      matrix.innerHTML = Array.from({ length: 8 }, (_, i) => `
        <div class="bit-btn">
          <span class="bit-led"></span>
          <span>.${7 - i}</span>
        </div>
      `).join('');
      return;
    }

    label.textContent = `Dec: ${val} (0x${val.toString(16).toUpperCase().padStart(2, '0')})`;

    matrix.innerHTML = Array.from({ length: 8 }, (_, i) => {
      const bitIndex = 7 - i;
      const isSet = ((val >> bitIndex) & 1) === 1;
      return `
        <div class="bit-btn ${isSet ? 'active' : ''}" data-bit="${bitIndex}" data-type="${type}" data-addr="${address}" data-current="${val}">
          <span class="bit-led"></span>
          <span>.${bitIndex}</span>
        </div>
      `;
    }).join('');

    if (allowWrite && activeMachineId) {
      matrix.querySelectorAll('.bit-btn').forEach(btn => {
        btn.onclick = async () => {
          const bitIndex = Number(btn.dataset.bit);
          const currentVal = Number(btn.dataset.current);
          const newVal = currentVal ^ (1 << bitIndex);

          try {
            log(`[Escrita Bit] Alterando ${type}${address}.${bitIndex} para ${(newVal >> bitIndex) & 1} na máquina ${activeMachineId}...`, 'log-info');
            const res = await fetch(`/api/machines/${activeMachineId}/pmc/write`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                addressType: type,
                startAddress: address,
                values: [newVal],
                dataType: 'Byte'
              })
            });
            const resJson = await res.json();
            if (resJson.success) {
              log(`[Escrita Bit OK] ${type}${address}.${bitIndex} gravado com sucesso!`, 'log-success');
              await loadFleet();
            }
          } catch (e) {
            log(`[Erro Escrita Bit] ${e.message}`, 'log-error');
          }
        };
      });
    }
  }

  // ==================== LEITURA & ESCRITA PMC AVULSA ====================

  document.getElementById('form-panel-pmc-read').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeMachineId) return;

    const addressType = document.getElementById('panel-pmc-type').value;
    const startAddress = Number(document.getElementById('panel-pmc-address').value);
    const count = Number(document.getElementById('panel-pmc-count').value);
    const dataType = document.getElementById('panel-pmc-datatype').value;

    const tbody = document.getElementById('panel-pmc-results-tbody');
    tbody.innerHTML = `<tr><td colspan="4" class="text-center">Consultando CLP da máquina ${activeMachineId}...</td></tr>`;

    try {
      const res = await fetch(`/api/machines/${activeMachineId}/pmc/read?addressType=${addressType}&startAddress=${startAddress}&count=${count}&dataType=${dataType}`);
      const json = await res.json();

      if (json.success && json.data && json.data.values) {
        const values = json.data.values;
        tbody.innerHTML = values.map((val, idx) => {
          const addr = startAddress + idx;
          const num = typeof val === 'number' ? val : (Number(val) || 0);
          const hex = num.toString(16).toUpperCase().padStart(dataType === 'Word' ? 4 : 2, '0');
          const bin = num.toString(2).padStart(8, '0');
          return `
            <tr>
              <td><strong>${addressType}${addr}</strong></td>
              <td>${val !== null && val !== undefined ? val : 0}</td>
              <td><code>0x${hex}</code></td>
              <td><code>${bin.slice(0, 4)} ${bin.slice(4)}</code></td>
            </tr>
          `;
        }).join('');
        log(`[PMC Read] Lidos ${values.length} registradores (${addressType}${startAddress}) da máquina ${activeMachineId}`, 'log-success');
      } else {
        tbody.innerHTML = `<tr><td colspan="4" class="text-danger text-center">Erro: ${json.error || 'Falha na leitura'}</td></tr>`;
      }
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-danger text-center">Erro: ${err.message}</td></tr>`;
    }
  });

  document.getElementById('panel-pmc-type').addEventListener('change', (e) => {
    document.getElementById('write-addr-prefix').textContent = e.target.value;
  });

  document.getElementById('form-panel-pmc-write').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeMachineId) return;

    const addressType = document.getElementById('panel-pmc-type').value;
    const startAddress = Number(document.getElementById('panel-write-address').value);
    const rawValues = document.getElementById('panel-write-values').value.trim();
    const dataType = document.getElementById('panel-write-datatype').value;

    const values = rawValues.split(',').map(v => Number(v.trim())).filter(v => !isNaN(v));
    if (values.length === 0) {
      alert('Informe ao menos um valor numérico válido.');
      return;
    }

    try {
      log(`[PMC Write] Gravando no CLP da máquina ${activeMachineId}: ${addressType}${startAddress} = [${values.join(', ')}]`, 'log-info');
      const res = await fetch(`/api/machines/${activeMachineId}/pmc/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addressType, startAddress, values, dataType })
      });
      const json = await res.json();
      if (json.success) {
        log(`[PMC Write OK] Registrador gravado com sucesso!`, 'log-success');
        document.getElementById('btn-panel-read-pmc').click();
      } else {
        alert(`Erro na gravação: ${json.error}`);
      }
    } catch (err) {
      log(`[Erro PMC Write] ${err.message}`, 'log-error');
    }
  });

  // ==================== PARÂMETROS CNC ====================

  document.getElementById('btn-panel-read-param').addEventListener('click', async () => {
    if (!activeMachineId) return;

    const paramNumber = Number(document.getElementById('panel-param-num').value);
    const axis = Number(document.getElementById('panel-param-axis').value);
    const display = document.getElementById('panel-param-display');

    display.innerHTML = `<span class="spinner" style="width:20px;height:20px;"></span> Lendo parâmetro #${paramNumber}...`;

    try {
      const res = await fetch(`/api/machines/${activeMachineId}/parameter/read?paramNumber=${paramNumber}&axis=${axis}`);
      const json = await res.json();

      if (json.success && json.data) {
        display.innerHTML = `
          <div style="font-size:1.1rem; font-weight:700; color:#fff;">
            Parâmetro #${paramNumber} (Eixo ${axis}): <span class="highlight">${json.data.value}</span>
          </div>
          <div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.3rem;">
            Tipo: ${json.data.type || 'Standard'} | Descrição: ${json.data.description || 'Parâmetro CNC Fanuc'}
          </div>
        `;
        log(`[Parâmetro Read] #${paramNumber} = ${json.data.value} (Máquina ${activeMachineId})`, 'log-success');
      } else {
        display.innerHTML = `<span class="text-danger">Erro: ${json.error || 'Não foi possível ler o parâmetro'}</span>`;
      }
    } catch (err) {
      display.innerHTML = `<span class="text-danger">Erro: ${err.message}</span>`;
    }
  });

  document.getElementById('btn-panel-write-param').addEventListener('click', async () => {
    if (!activeMachineId) return;

    const paramNumber = Number(document.getElementById('panel-param-num').value);
    const axis = Number(document.getElementById('panel-param-axis').value);
    const value = Number(document.getElementById('panel-param-new-val').value);

    if (isNaN(value)) {
      alert('Informe um valor numérico válido.');
      return;
    }

    try {
      log(`[Parâmetro Write] Gravando #${paramNumber} = ${value} (Eixo ${axis}) na máquina ${activeMachineId}...`, 'log-info');
      const res = await fetch(`/api/machines/${activeMachineId}/parameter/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paramNumber, axis, value })
      });
      const json = await res.json();

      if (json.success) {
        log(`[Parâmetro Write OK] Parâmetro #${paramNumber} gravado com sucesso!`, 'log-success');
        document.getElementById('btn-panel-read-param').click();
      } else {
        alert(`Erro na gravação do parâmetro: ${json.error}`);
      }
    } catch (err) {
      log(`[Erro Parâmetro] ${err.message}`, 'log-error');
    }
  });

  // ==================== SALVAR TAG (LEITURA OU ESCRITA) ====================

  document.getElementById('form-add-tag').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeMachineId) return;

    const direction = document.getElementById('input-tag-direction').value || 'READ';
    const payload = {
      name: document.getElementById('input-tag-name').value.trim(),
      direction,
      address_type: document.getElementById('input-tag-type').value,
      address: Number(document.getElementById('input-tag-address').value),
      data_type: document.getElementById('input-tag-datatype').value,
      write_value: document.getElementById('input-tag-write-value').value.trim() || '0',
      description: document.getElementById('input-tag-desc').value.trim()
    };

    try {
      const res = await fetch(`/api/machines/${activeMachineId}/pmc/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        modalAddTag.classList.remove('active');
        document.getElementById('form-add-tag').reset();
        await loadFleet();
        log(`[Sistema] Nova tag de ${direction === 'READ' ? 'Leitura' : 'Escrita'} '${payload.name}' salva com sucesso!`, 'log-success');
      }
    } catch (err) {
      alert(`Erro ao salvar tag: ${err.message}`);
    }
  });

  // ==================== FUNÇÕES AUXILIARES ====================

  function openMachineModal(machine = null) {
    const isEdit = Boolean(machine);
    document.getElementById('modal-machine-title').textContent = isEdit ? '✏️ Editar Máquina CNC' : '➕ Cadastrar Nova Máquina CNC';
    document.getElementById('input-machine-id').value = isEdit ? machine.id : '';
    document.getElementById('input-machine-name').value = isEdit ? machine.name : '';
    document.getElementById('input-machine-model').value = isEdit ? (machine.model || '') : '';
    document.getElementById('select-machine-driver').value = isEdit ? machine.driver : 'focas_dll';
    document.getElementById('input-machine-host').value = isEdit ? machine.host : '192.168.1.100';
    document.getElementById('input-machine-focas-port').value = isEdit ? (machine.focas_port || 8193) : 8193;
    document.getElementById('input-machine-opcua-port').value = isEdit ? (machine.opcua_port || 4840) : 4840;
    document.getElementById('input-machine-opcua-endpoint').value = isEdit ? (machine.opcua_endpoint || '') : '';
    document.getElementById('input-machine-username').value = isEdit ? (machine.username || 'OpcUaClient') : 'OpcUaClient';
    document.getElementById('input-machine-password').value = isEdit ? (machine.password || 'OpcUaClient') : 'OpcUaClient';
    document.getElementById('input-machine-timeout').value = isEdit ? (machine.timeout || 5000) : 5000;

    driverSelect.dispatchEvent(new Event('change'));
    modalMachineConfig.classList.add('active');
  }

  function closeModal(modal) {
    modal.classList.remove('active');
  }

  async function deleteMachine(id) {
    try {
      const res = await fetch(`/api/machines/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        log(`[Sistema] Máquina ID ${id} excluída com sucesso.`, 'log-info');
        await loadFleet();
      }
    } catch (e) {
      log(`[Erro] Falha ao excluir máquina: ${e.message}`, 'log-error');
    }
  }

  function log(msg, type = 'log-info') {
    const time = new Date().toLocaleTimeString();
    const div = document.createElement('div');
    div.className = `log-entry ${type}`;
    div.textContent = `[${time}] ${msg}`;
    terminalLogs.prepend(div);
    if (terminalLogs.children.length > 50) {
      terminalLogs.removeChild(terminalLogs.lastChild);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ==================== WEBSOCKET AO VIVO ====================

  function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      log('[WebSocket] Conexão em tempo real estabelecida com o servidor.', 'log-success');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'fleet_telemetry' && msg.fleet) {
          msg.fleet.forEach(item => {
            const found = fleetData.find(m => m.id === item.machineId);
            if (found) {
              found.liveStatus = item.status;
              found.monitoredTags = item.monitoredTags;
            }
          });

          renderFleetGrid(fleetData);
          updateFleetStats(fleetData);

          if (activeMachineId) {
            const current = fleetData.find(m => m.id === activeMachineId);
            if (current) updateActiveMachineView(current);
          }
        }
      } catch (e) {}
    };

    ws.onclose = () => {
      setTimeout(initWebSocket, 3000);
    };
  }

  // Inicialização
  loadFleet();
  initWebSocket();
});
