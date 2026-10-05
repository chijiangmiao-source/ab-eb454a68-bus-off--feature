'use strict';
/* global CanEngine */

const Can = window.CanEngine;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  nodes: [{ name: 'A', tec: 0 }, { name: 'B', tec: 0 }],
  requests: [
    { time: 0, node: 'A', id: '0x100', dlc: 1, data: '11 22', error: null },
    { time: 0, node: 'B', id: '0x180', dlc: 0, data: '', error: null },
  ],
  result: null,
  recoveryNode: null, // 当前展开恢复证据的 bus-off 节点
  recoveryEpisode: 1,
};

const MODE_TEXT = { active: '主动错误', passive: '错误被动', 'bus-off': 'bus-off' };

/* ------------------------- 录入区渲染 ------------------------- */

function renderNodes() {
  const box = $('#nodes');
  box.innerHTML = '';
  state.nodes.forEach((n, i) => {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <input type="text" maxlength="8" value="${escapeAttr(n.name)}" data-k="name" placeholder="如 A / CAM1" />
      <input type="number" min="0" max="255" value="${n.tec}" data-k="tec" title="初始发送错误计数 0~255" />
      <button type="button" class="btn small danger" data-act="del-node">删</button>`;
    row.querySelector('[data-k="name"]').addEventListener('input', (e) => { state.nodes[i].name = e.target.value; });
    row.querySelector('[data-k="tec"]').addEventListener('input', (e) => { state.nodes[i].tec = e.target.value === '' ? '' : Number(e.target.value); });
    row.querySelector('[data-act="del-node"]').addEventListener('click', () => { state.nodes.splice(i, 1); renderAll(); });
    box.appendChild(row);
  });
}

function renderRequests() {
  const box = $('#requests');
  box.innerHTML = '';
  state.requests.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = 'row';
    const nodeOpts = state.nodes.map((n) => `<option value="${escapeAttr(n.name)}"${n.name === r.node ? ' selected' : ''}>${escapeHtml(n.name || '?')}</option>`).join('');
    const errType = r.error?.type || '';
    const srcNode = state.nodes.find((n) => n.name === (r.error?.sourceNode || ''));
    const srcOpts = state.nodes.filter((n) => n.name !== r.node)
      .map((n) => `<option value="${escapeAttr(n.name)}"${n.name === r.error?.sourceNode ? ' selected' : ''}>${escapeHtml(n.name)}</option>`).join('');
    row.innerHTML = `
      <input type="number" min="0" value="${r.time}" data-k="time" />
      <select data-k="node">${nodeOpts}</select>
      <input type="text" value="${escapeAttr(r.id)}" data-k="id" placeholder="0x123" />
      <input type="number" min="0" max="8" value="${r.dlc}" data-k="dlc" />
      <input type="text" value="${escapeAttr(r.data)}" data-k="data" placeholder="如 11 22 AB" />
      <div class="err-cell">
        <select data-k="etype">
          <option value=""${!errType ? ' selected' : ''}>无</option>
          <option value="ack"${errType === 'ack' ? ' selected' : ''}>ACK 错误</option>
          <option value="crc"${errType === 'crc' ? ' selected' : ''}>CRC 错误</option>
          <option value="bit"${errType === 'bit' ? ' selected' : ''}>数据位错误</option>
        </select>
        <select data-k="esrc" class="${errType === 'crc' ? '' : 'hidden'}">
          <option value="">来源节点…</option>${srcOpts}
        </select>
        <input type="number" min="0" data-k="ebit" class="${errType === 'bit' ? '' : 'hidden'}"
          value="${errType === 'bit' ? r.error.dataBit : ''}" placeholder="位序号" title="按 Dn.7→Dn.0 展平，0 = 首字节最高位" />
      </div>
      <button type="button" class="btn small danger" data-act="del-req">删</button>`;
    const q = selector => row.querySelector(selector);
    q('[data-k="time"]').addEventListener('input', e => { r.time = e.target.value === '' ? '' : Number(e.target.value); });
    q('[data-k="node"]').addEventListener('change', e => { r.node = e.target.value; renderRequests(); });
    q('[data-k="id"]').addEventListener('input', e => { r.id = e.target.value; });
    q('[data-k="dlc"]').addEventListener('input', e => { r.dlc = e.target.value === '' ? '' : Number(e.target.value); });
    q('[data-k="data"]').addEventListener('input', e => { r.data = e.target.value; });
    q('[data-k="etype"]').addEventListener('change', e => {
      const t = e.target.value;
      if (t === 'ack') r.error = { type: 'ack' };
      else if (t === 'crc') r.error = { type: 'crc', sourceNode: q('[data-k="esrc"]').value || state.nodes.find((n) => n.name !== r.node)?.name || '' };
      else if (t === 'bit') r.error = { type: 'bit', dataBit: Number(q('[data-k="ebit"]').value) || 0 };
      else r.error = null;
      renderRequests();
    });
    q('[data-k="esrc"]')?.addEventListener('change', e => { if (r.error) r.error.sourceNode = e.target.value; });
    q('[data-k="ebit"]')?.addEventListener('input', e => { if (r.error) r.error.dataBit = Number(e.target.value); });
    q('[data-act="del-req"]').addEventListener('click', () => { state.requests.splice(i, 1); renderAll(); });
    box.appendChild(row);
  });
  updateCountInfo();
}

function updateCountInfo() {
  $('#count-info').textContent = `节点 ${state.nodes.length}/4，请求 ${state.requests.length}/24`;
}

function renderAll() {
  renderNodes();
  renderRequests();
}

$('#btn-add-node').addEventListener('click', () => {
  if (state.nodes.length >= 4) return;
  state.nodes.push({ name: String.fromCharCode(65 + state.nodes.length), tec: 0 });
  renderAll();
});
$('#btn-add-req').addEventListener('click', () => {
  if (state.requests.length >= 24) return;
  const last = state.requests[state.requests.length - 1];
  state.requests.push({
    time: last ? last.time : 0, node: state.nodes[0]?.name || '',
    id: '0x100', dlc: 0, data: '', error: null,
  });
  renderAll();
});
$('#btn-clear').addEventListener('click', () => {
  state.nodes = [];
  state.requests = [];
  state.result = null;
  clearFieldErrors();
  clearRecoveryEvidence();
  $('#summary').classList.add('hidden');
  $('#attempts').innerHTML = '<p class="muted placeholder">已清空。</p>';
  renderAll();
});

/* ------------------------- 组装与提交 ------------------------- */

function buildPayload() {
  return {
    nodes: state.nodes.map((n) => ({ name: n.name, tec: Number(n.tec) || 0 })),
    requests: state.requests.map((r) => ({
      time: Number(r.time) || 0,
      node: r.node,
      id: typeof r.id === 'string' ? r.id.trim() : r.id,
      dlc: Number(r.dlc) || 0,
      data: r.data,
      error: r.error,
    })),
  };
}

function clearFieldErrors() {
  $$('.invalid-field').forEach((el) => el.classList.remove('invalid-field'));
  $$('.row.invalid').forEach((el) => el.classList.remove('invalid'));
  $('#field-errors').classList.add('hidden');
}

/* 恢复资格空闲证据：切换节点、重新提交或字段校验错误时必须清除旧节点证据 */
function clearRecoveryEvidence() {
  state.recoveryNode = null;
  state.recoveryEpisode = 1;
  $('#recovery-box').classList.add('hidden');
  $('#recovery-node').innerHTML = '';
  $('#recovery-body').innerHTML = '';
}

function showFieldErrors(errors) {
  clearFieldErrors();
  const box = $('#field-errors');
  box.innerHTML = '<h4>字段级反馈（旧结论已清除，请修正后重新执行）</h4><ul></ul>';
  const ul = box.querySelector('ul');
  const seen = new Set();
  for (const e of errors) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="field-path">${e.field || '(根)'}</span>：${escapeHtml(e.message)}`;
    ul.appendChild(li);
    highlightField(e.field);
    seen.add(e.field);
  }
  box.classList.remove('hidden');
}

function highlightField(fp) {
  const nodeM = fp.match(/^nodes\[(\d+)\](?:\.(name|tec))?/);
  if (nodeM) {
    const rows = $$('#nodes .row');
    const row = rows[Number(nodeM[1])];
    row?.classList.add('invalid');
    if (nodeM[2]) row?.querySelector(`[data-k="${nodeM[2]}"]`)?.classList.add('invalid-field');
    return;
  }
  const reqM = fp.match(/^requests\[(\d+)\](?:\.(time|node|id|dlc|data)(?:\[(\d+)\])?|\.error(?:\.(type|sourceNode|dataBit))?)?/);
  if (reqM) {
    const rows = $$('#requests .row');
    const row = rows[Number(reqM[1])];
    if (!row) return;
    row.classList.add('invalid');
    const key = reqM[2] || reqM[4];
    if (key === 'sourceNode') row.querySelector('[data-k="esrc"]')?.classList.add('invalid-field');
    else if (key === 'dataBit') row.querySelector('[data-k="ebit"]')?.classList.add('invalid-field');
    else if (key) row.querySelector(`[data-k="${key}"]`)?.classList.add('invalid-field');
    if (fp.includes('.data')) row.querySelector('[data-k="data"]')?.classList.add('invalid-field');
    if (fp.includes('.error')) row.querySelector('[data-k="etype"]')?.classList.add('invalid-field');
  }
}

$('#btn-run').addEventListener('click', async () => {
  clearFieldErrors();
  let result;
  try {
    const resp = await fetch('/api/simulate', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildPayload()),
    });
    result = await resp.json();
  } catch (e) {
    showFieldErrors([{ field: '', message: '请求失败：' + e.message }]);
    return;
  }
  if (!result.ok) {
    // 校验失败：清除旧结论与旧节点恢复证据
    state.result = null;
    $('#summary').classList.add('hidden');
    $('#attempts').innerHTML = '<p class="muted placeholder">输入未通过校验，暂无结论。</p>';
    $('#stale-hint').classList.remove('hidden');
    clearRecoveryEvidence();
    showFieldErrors(result.errors || []);
    return;
  }
  $('#stale-hint').classList.add('hidden');
  state.result = result;
  renderResult(result);
});

/* ------------------------- 结果渲染 ------------------------- */

function renderResult(r) {
  // 节点状态卡
  const cards = $('#stat-cards');
  cards.innerHTML = '';
  for (const n of r.nodes) {
    const d = document.createElement('div');
    d.className = 'stat';
    d.innerHTML = `
      <div><span class="node">${escapeHtml(n.name)}</span><span class="badge ${n.mode}">${MODE_TEXT[n.mode]}</span></div>
      <div class="counts">TEC=${n.tec}　REC=${n.rec}</div>`;
    cards.appendChild(d);
  }

  // 事件
  const log = $('#event-log');
  log.innerHTML = '';
  if (!r.events.length) log.innerHTML = '<span class="muted">无状态迁移事件。</span>';
  for (const ev of r.events) {
    const d = document.createElement('div');
    d.className = `event-line ${ev.type}`;
    d.innerHTML = eventText(ev, r);
    log.appendChild(d);
  }

  // 请求结局
  const tb = $('#outcomes-table tbody');
  tb.innerHTML = '';
  r.requests.forEach((q, i) => {
    const tr = document.createElement('tr');
    const tag = outcomeTag(q.status);
    tr.innerHTML = `<td>${i}</td><td>${q.time}</td><td>${escapeHtml(q.node)}</td>
      <td class="mono">${Can.fmtId(q.id)}</td><td><span class="tag ${tag.cls}">${tag.text}</span></td>
      <td>${q.attempts?.length || 0}</td><td>${escapeHtml(q.reason || '')}</td>`;
    tb.appendChild(tr);
  });
  $('#summary').classList.remove('hidden');

  // 逐帧卡片
  const box = $('#attempts');
  box.innerHTML = '';
  r.attempts.forEach((a) => box.appendChild(renderAttemptCard(a, r)));

  // 恢复资格空闲证据：重新提交有效输入时先清除旧节点选择，再按新结论构建
  clearRecoveryEvidence();
  if (r.recoveryEvidence && r.recoveryEvidence.length) renderRecoveryBox(r);
}

function outcomeTag(status) {
  switch (status) {
    case 'transmitted': return { text: '发送成功', cls: 'ok' };
    case 'rejected': return { text: '已拒绝', cls: 'rejected' };
    case 'aborted': return { text: '中止', cls: 'aborted' };
    case 'waiting-busoff': return { text: '挂起(bus-off)', cls: 'waiting' };
    case 'pending-retry': return { text: '待重传', cls: 'waiting' };
    default: return { text: status || '?', cls: '' };
  }
}

function eventText(ev, r) {
  const at = `<span class="mono">位 ${ev.atBit}</span>`;
  switch (ev.type) {
    case 'error-passive':
      return `⚪ <b>${escapeHtml(ev.node)}</b> 在 ${at} 进入<b>错误被动</b>（TEC=${ev.tec}${ev.rec ? `，REC=${ev.rec}` : ''}），错误标志转为 6 个隐性位`;
    case 'bus-off':
      return `🔴 <b>${escapeHtml(ev.node)}</b> 在 ${at} TEC=${ev.tec} 达到 256，进入 <b>bus-off</b>：退出仲裁，新请求被拒绝，等待 128×11 连续隐性位`;
    case 'recovered':
      return `🟢 <b>${escapeHtml(ev.node)}</b> 在 ${at} 完成 ${ev.groups} 次 11 连续隐性位监测，<b>恢复发送资格</b>，TEC/REC 清零`;
    case 'rejected':
      return `⛔ ${at} 节点 <b>${escapeHtml(ev.node)}</b> 的请求 #${ev.requestIndex} 被<b>拒绝</b>（bus-off）`;
    case 'aborted':
      return `⛔ ${at} 节点 <b>${escapeHtml(ev.node)}</b> 的请求 #${ev.requestIndex} 中止`;
    default: return JSON.stringify(ev);
  }
}

function renderAttemptCard(a, r) {
  const card = document.createElement('div');
  card.className = `attempt ${a.ok ? 'ok-frame' : 'err'}${a.retransmit ? ' retx' : ''}`;
  const dataHex = a.data.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ') || '—';
  card.innerHTML = `
    <div class="att-head">
      <span class="seq">帧尝试 #${a.index}${a.retransmit ? '（自动重传）' : ''}</span>
      <span class="winner">🏆 ${escapeHtml(a.winner)}</span>
      <span class="frameid">ID=${a.frameIdHex}　DLC=${a.dlc}　数据=[${dataHex}]　CRC=${a.crc}</span>
      <span class="status ${a.ok ? 'ok' : 'bad'}">${a.ok ? '正常应答完成' : '检出错误并重传'}</span>
    </div>
    <div class="att-body">
      <div class="kv-grid">
        <div class="kv"><span class="k">同刻候选：</span>${a.contenders.map((c) => `${escapeHtml(c.node)}(${c.idHex})`).join('、')}</div>
        <div class="kv"><span class="k">仲裁结果：</span>${escapeHtml(a.arbitration.winner)} 获胜（低标识符优先）${a.arbitration.note ? '；' + escapeHtml(a.arbitration.note) : ''}</div>
      </div>
      <div class="evidence-wrap"></div>
      <h5 class="muted">错误计数变化</h5>
      <table class="cc-table">
        <thead><tr><th>节点</th><th>角色</th><th>TEC(前→后)</th><th>REC(前→后)</th><th>模式</th></tr></thead>
        <tbody class="cc-body"></tbody>
      </table>
      <button type="button" class="btn small btn-open-trace">逐位回放该帧（${a.trace.length} 位）…</button>
      <div class="trace-preview"></div>
    </div>`;

  // 仲裁证据
  const ew = card.querySelector('.evidence-wrap');
  for (const ev of a.arbitration.loserEvidence) {
    const d = document.createElement('div');
    d.className = 'evidence arbitration';
    d.innerHTML = `<h5>仲裁失败证据 · ${escapeHtml(ev.node)}</h5>
      <div>${escapeHtml(ev.detail)}</div>
      <div class="loc">全局位序号=${ev.globalBit}　场位置=${ev.label}　该节点发送=${bitTxt(ev.sent)}　总线=${bitTxt(ev.bus)}</div>`;
    d.querySelector('.loc').addEventListener('click', () => openTrace(a, ev.globalBit));
    ew.appendChild(d);
  }
  // 错误/首个违规
  if (a.firstViolation) {
    const d = document.createElement('div');
    d.className = 'evidence';
    const v = a.firstViolation;
    d.innerHTML = `<h5>首个违规证据 · ${escapeHtml(v.node)}（${v.role === 'transmitter' ? '发送方' : '接收方'}）</h5>
      <div>${escapeHtml(v.detail)}</div>
      <div class="loc">全局位序号=${v.globalBit}　场=${v.frameField}/${v.fieldLabel || ''}　错误类型=${v.kind}</div>`;
    d.querySelector('.loc').addEventListener('click', () => openTrace(a, v.globalBit));
    ew.appendChild(d);
  }
  if (a.errors.length > 1) {
    const ul = document.createElement('div');
    ul.className = 'kv';
    ul.innerHTML = `<span class="k">本次尝试全部检出：</span>` + a.errors.map((e) =>
      `${escapeHtml(e.node)}(${e.role === 'transmitter' ? '发' : '收'}) ${e.kind}@${e.globalBit}`).join('；');
    ew.appendChild(ul);
  }

  // 计数表
  const ccb = card.querySelector('.cc-body');
  for (const c of a.counterChanges) {
    const roles = new Set(a.errors.filter((e) => e.node === c.node).map((e) => e.role === 'transmitter' ? '发送方' : '接收方'));
    const dt = c.tecAfter - c.tecBefore, dr = c.recAfter - c.recBefore;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(c.node)}</td><td>${[...roles].join('/') || '旁观'}</td>
      <td>${c.tecBefore} → <b class="${dt > 0 ? 'delta-up' : dt < 0 ? 'delta-down' : ''}">${c.tecAfter}</b> ${dt ? `(${dt > 0 ? '+' : ''}${dt})` : ''}</td>
      <td>${c.recBefore} → <b class="${dr > 0 ? 'delta-up' : dr < 0 ? 'delta-down' : ''}">${c.recAfter}</b> ${dr ? `(${dr > 0 ? '+' : ''}${dr})` : ''}</td>
      <td><span class="badge ${c.modeAfter}">${MODE_TEXT[c.modeAfter]}</span></td>`;
    ccb.appendChild(tr);
  }

  // 迷你轨迹
  const pv = card.querySelector('.trace-preview');
  const errorBits = new Set(a.errors.map((e) => e.globalBit));
  let lastField = null;
  for (const b of a.trace) {
    if (lastField !== b.field && ['SOF', 'ARBITRATION', 'CONTROL', 'DATA', 'CRC', 'CRC_DELIM', 'ACK', 'EOF', 'ERROR_FLAG', 'ERR_DELIM', 'IFS'].includes(b.field)) {
      const sep = document.createElement('span');
      sep.className = 'field-sep'; sep.title = b.field;
      pv.appendChild(sep);
      lastField = b.field;
    }
    const c = document.createElement('span');
    c.className = `mini ${b.bus === 0 ? 'dom' : 'rec'}${b.field === 'STUFF' ? ' stuff' : ''}${errorBits.has(b.i) ? ' error' : ''}`;
    c.title = `#${b.i} ${b.field}/${b.label} = ${b.bus}${b.note ? '\n' + b.note : ''}`;
    c.addEventListener('click', () => openTrace(a, b.i));
    pv.appendChild(c);
  }

  card.querySelector('.att-head').addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    card.classList.toggle('open');
  });
  card.querySelector('.btn-open-trace').addEventListener('click', () => { card.classList.add('open'); openTrace(a); });
  return card;
}

function bitTxt(v) { return v === 0 ? '显性(0)' : v === 1 ? '隐性(1)' : '—'; }

/* --------------------- bus-off 恢复资格空闲证据 --------------------- */

function renderRecoveryBox(r) {
  const box = $('#recovery-box');
  const sel = $('#recovery-node');
  box.classList.remove('hidden');

  // 曾进入 bus-off 的节点（按首次进入位号排序）
  const nodes = [];
  for (const ev of r.recoveryEvidence) {
    if (!nodes.some((x) => x.name === ev.node)) nodes.push({ name: ev.node, firstAt: ev.busOffBit });
  }
  nodes.sort((a, b) => a.firstAt - b.firstAt);

  // 新结论中默认选中第一个；旧选择的节点若已不存在则回到第一个（旧节点证据已随 clearRecoveryEvidence 清除）
  if (!state.recoveryNode || !nodes.some((x) => x.name === state.recoveryNode)) {
    state.recoveryNode = nodes[0]?.name || null;
    state.recoveryEpisode = 1;
  }

  sel.innerHTML = '';
  for (const n of nodes) {
    const eps = r.recoveryEvidence.filter((ev) => ev.node === n.name);
    const opt = document.createElement('option');
    opt.value = n.name;
    opt.textContent = eps.length > 1 ? `${n.name}（${eps.length} 次 bus-off）` : n.name;
    if (n.name === state.recoveryNode) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.onchange = () => {
    // 切换节点：旧节点的恢复证据必须清除
    state.recoveryNode = sel.value;
    state.recoveryEpisode = 1;
    renderRecoveryEvidence(r);
  };
  renderRecoveryEvidence(r);
}

function renderRecoveryEvidence(r) {
  const body = $('#recovery-body');
  body.innerHTML = '';
  const name = state.recoveryNode;
  if (!name) return;
  const episodes = r.recoveryEvidence.filter((ev) => ev.node === name);
  if (!episodes.length) { body.innerHTML = '<p class="muted">该节点没有 bus-off 记录。</p>'; return; }
  if (state.recoveryEpisode > episodes.length) state.recoveryEpisode = episodes.length;

  // 同一节点多次 bus-off：情节切换
  if (episodes.length > 1) {
    const epBar = document.createElement('div');
    epBar.className = 'rec-epbar';
    epBar.innerHTML = '<span class="k">bus-off 情节：</span>';
    episodes.forEach((ev, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn small' + (i + 1 === state.recoveryEpisode ? ' primary' : '');
      b.textContent = `第 ${i + 1} 次（位 ${ev.busOffBit}）`;
      b.addEventListener('click', () => { state.recoveryEpisode = i + 1; renderRecoveryEvidence(r); });
      epBar.appendChild(b);
    });
    body.appendChild(epBar);
  }

  const ev = episodes[state.recoveryEpisode - 1];
  body.appendChild(renderRecoveryEvidenceCard(ev, r));
}

function frameRefText(f) {
  if (!f) return '（空闲位，无来源帧）';
  return `帧尝试 #${f.attemptIndex} · ${f.winner} 发 ${f.frameIdHex}${f.retransmit ? '（自动重传）' : ''} · 位 ${f.startBit}~${f.endBit - 1}`;
}

function renderRecoveryEvidenceCard(ev, r) {
  const card = document.createElement('div');
  card.className = 'rec-card' + (ev.recovered ? ' recovered' : ' unrecovered');

  const head = document.createElement('div');
  head.className = 'rec-status';
  head.innerHTML = `
    <div>节点 <b>${escapeHtml(ev.node)}</b> 于全局位 <span class="mono">${ev.busOffBit}</span> 进入 bus-off（第 ${ev.episode} 次）</div>
    <div class="rec-verdict">${
      ev.recovered
        ? `🟢 已于位 <span class="mono">${ev.recoveryBit}</span> 完成 <b>第 128 个完整组</b>，恢复发送资格，TEC/REC 清零`
        : `🔴 至回放结束（位 ${r.totalBits - 1}）仍未恢复：已累计 <b>${ev.completeGroups}</b>/128 个完整组`
    }</div>`;
  card.appendChild(head);

  if (ev.recovered) {
    // 恢复边界 + 恢复后首个实际发送尝试关联
    const bd = document.createElement('div');
    bd.className = 'rec-boundary';
    const g128 = ev.groups.find((g) => g.boundary);
    bd.innerHTML = `
      <div><b>恢复边界</b>：第 128 个完整组 位 <span class="mono">${g128.startBit}~${g128.endBit}</span>（末位 ${g128.endBit} 即恢复点）</div>
      <div class="rec-firstsend"><b>恢复后首个实际发送尝试</b>：${ev.firstSendAttempt ? frameRefText(ev.firstSendAttempt) : '回放结束前暂无发送尝试'}</div>`;
    if (ev.firstSendAttempt) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn small btn-open-firstsend';
      btn.textContent = '打开该帧逐位轨迹 ⤳';
      btn.addEventListener('click', () => {
        const a = r.attempts.find((x) => x.index === ev.firstSendAttempt.attemptIndex);
        if (a) openTrace(a);
      });
      bd.querySelector('.rec-firstsend').appendChild(document.createTextNode(' '));
      bd.querySelector('.rec-firstsend').appendChild(btn);
      const mark = markRange(g128.startBit, g128.endBit);
      const view = document.createElement('button');
      view.type = 'button';
      view.className = 'btn small';
      view.textContent = '在全局位序中查看边界组';
      view.addEventListener('click', () => openGlobalTrace(
        r, g128.startBit, mark,
        `恢复边界 · ${ev.node} 第 128 个完整隐性组（位 ${g128.startBit}~${g128.endBit}）`));
      bd.appendChild(view);
    }
    card.appendChild(bd);
  } else {
    // 未恢复：最后一个完整组 + 当前残余隐性位数
    const res = document.createElement('div');
    res.className = 'rec-residual';
    const last = ev.groups[ev.groups.length - 1];
    res.innerHTML = `
      <div><b>最后一个完整组</b>：${last
        ? `第 ${last.n} 组，位 <span class="mono">${last.startBit}~${last.endBit}</span>（此前累计 ${last.groupsTotal} 组保留）`
        : '尚无完整组'}</div>
      <div><b>当前残余隐性位</b>：${ev.residualBits > 0
        ? `${ev.residualBits} 位（位 <span class="mono">${ev.residualStartBit}~${ev.residualEndBit}</span>，不足 11 位，不计入组数）`
        : '0 位（回放结束时不处于隐性连续段）'}</div>`;
    if (ev.residualBits > 0) {
      const view = document.createElement('button');
      view.type = 'button';
      view.className = 'btn small';
      view.textContent = '在全局位序中查看残余段';
      view.addEventListener('click', () => openGlobalTrace(
        r, ev.residualStartBit, markRange(ev.residualStartBit, ev.residualEndBit),
        `未恢复残余隐性段 · ${ev.node}（位 ${ev.residualStartBit}~${ev.residualEndBit}，${ev.residualBits} 位）`));
      res.appendChild(view);
    }
    card.appendChild(res);
  }

  // 按位序列顺序的连续隐性组时间线（完整组 + 被打断未完成组）
  const det = document.createElement('details');
  det.className = 'rec-seq';
  const nInt = ev.interrupted.length;
  const summary = document.createElement('summary');
  summary.innerHTML = `位序序列：${ev.groups.length} 个完整 11 位隐性组${nInt ? ` + ${nInt} 个被显性位打断的未完成组` : ''}（按全局位号顺序，点击行可定位）`;
  det.appendChild(summary);

  const table = document.createElement('table');
  table.className = 'rec-table';
  table.innerHTML = `<thead><tr>
    <th>组序</th><th>11 位完整性</th><th>起始~结束全局位号</th><th>累计完整组</th><th>打断 / 来源帧</th><th></th>
  </tr></thead><tbody></tbody>`;
  const tb = table.querySelector('tbody');

  for (const item of ev.sequence) {
    const tr = document.createElement('tr');
    tr.className = `seq-row ${item.kind}`;
    if (item.kind === 'group') {
      tr.innerHTML = `<td class="mono">#${item.n}</td>
        <td class="ok">✓ 完整 11/11${item.boundary ? ' <span class="rec-badge">恢复边界</span>' : ''}</td>
        <td class="mono">${item.startBit} ~ ${item.endBit}</td>
        <td class="mono">${item.groupsTotal}</td>
        <td>${item.boundary && ev.firstSendAttempt
          ? `恢复后首发：${escapeHtml(frameRefText(ev.firstSendAttempt))}`
          : (item.sourceFrames.length ? item.sourceFrames.map(frameRefText).map(escapeHtml).join('；') : '<span class="muted">总线空闲</span>')}</td>
        <td></td>`;
      const locate = document.createElement('button');
      locate.type = 'button'; locate.className = 'btn small';
      locate.textContent = '定位';
      locate.addEventListener('click', () => openGlobalTrace(
        r, item.startBit, markRange(item.startBit, item.endBit),
        `${ev.node} 第 ${item.n} 个完整隐性组（位 ${item.startBit}~${item.endBit}）${item.boundary ? ' · 恢复边界' : ''}`));
      tr.lastElementChild.appendChild(locate);
      if (item.boundary && ev.firstSendAttempt) {
        const fs = document.createElement('button');
        fs.type = 'button'; fs.className = 'btn small';
        fs.textContent = '首发帧 ⤳';
        fs.addEventListener('click', () => {
          const a = r.attempts.find((x) => x.index === ev.firstSendAttempt.attemptIndex);
          if (a) openTrace(a);
        });
        tr.lastElementChild.appendChild(fs);
      }
    } else if (item.kind === 'interrupted') {
      tr.innerHTML = `<td class="mono">#${item.n}</td>
        <td class="bad">✗ 未完成 ${item.length}/11</td>
        <td class="mono">${item.startBit} ~ ${item.endBit}</td>
        <td class="mono">${item.groupsBefore} <span class="muted">（已保留）</span></td>
        <td class="int-cell"></td>
        <td></td>`;
      const intCell = tr.querySelector('.int-cell');
      intCell.innerHTML = `打断位 <span class="mono">${item.interruptBit}</span>（${item.interruptField}/${item.interruptLabel}，显性 0）<br/>
        来源帧：${escapeHtml(frameRefText(item.sourceFrame))}`;
      if (item.sourceFrame) {
        const sf = document.createElement('button');
        sf.type = 'button'; sf.className = 'btn small';
        sf.textContent = '打开来源帧 ⤳';
        sf.addEventListener('click', () => {
          const a = r.attempts.find((x) => x.index === item.sourceFrame.attemptIndex);
          if (a) openTrace(a, item.interruptBit);
        });
        intCell.appendChild(document.createElement('br'));
        intCell.appendChild(sf);
      }
      const locate = document.createElement('button');
      locate.type = 'button'; locate.className = 'btn small';
      locate.textContent = '定位';
      const marks = markRange(item.startBit, item.endBit);
      marks.add(item.interruptBit);
      locate.addEventListener('click', () => openGlobalTrace(
        r, item.startBit, marks,
        `${ev.node} 被打断未完成组（隐性位 ${item.startBit}~${item.endBit}，打断位 ${item.interruptBit}）`));
      tr.lastElementChild.appendChild(locate);
    } else { // residual
      tr.innerHTML = `<td class="mono">#${item.n}</td>
        <td class="warn">… 残余 ${item.length}/11</td>
        <td class="mono">${item.startBit} ~ ${item.endBit}</td>
        <td class="mono">${item.groupsBefore}</td>
        <td><span class="muted">回放结束时仍在累计，尚未成组</span></td>
        <td></td>`;
      const locate = document.createElement('button');
      locate.type = 'button'; locate.className = 'btn small';
      locate.textContent = '定位';
      locate.addEventListener('click', () => openGlobalTrace(
        r, item.startBit, markRange(item.startBit, item.endBit),
        `${ev.node} 残余隐性位（${item.startBit}~${item.endBit}）`));
      tr.lastElementChild.appendChild(locate);
    }
    tb.appendChild(tr);
  }
  det.appendChild(table);
  det.open = true;
  card.appendChild(det);
  return card;
}

function markRange(startBit, endBit) {
  const s = new Set();
  for (let i = startBit; i <= endBit; i++) s.add(i);
  return s;
}

/* ------------------------- 位回放播放器 ------------------------- */

const player = { trace: null, idx: 0, timer: null, attempt: null, markBits: new Set(), legendHtml: '' };

function openTrace(a, gotoBit) {
  player.attempt = a;
  player.trace = a.trace;
  player.markBits = new Set();
  player.legendHtml = '';
  $('#trace-title').textContent = `帧尝试 #${a.index} · 获胜 ${a.winner} · ${a.frameIdHex} · 共 ${a.trace.length} 位`;
  $('#tr-slider').max = String(a.trace.length - 1);
  const start = gotoBit !== undefined ? a.trace.findIndex((b) => b.i >= gotoBit) : 0;
  renderTrack();
  seek(Math.max(0, start));
  $('#trace-modal').classList.remove('hidden');
  play();
}

// 全局位序轨迹（跨帧段/空闲段），用于展示 bus-off 恢复空闲证据所在位
function openGlobalTrace(r, gotoBit, markBits, title) {
  const trace = r.segments.flatMap((s) => s.bits);
  player.attempt = null;
  player.trace = trace;
  player.markBits = markBits instanceof Set ? markBits : new Set(markBits || []);
  player.legendHtml = `
    <span><span class="sw" style="background:var(--dom)"></span>显性 0</span>
    <span><span class="sw" style="background:var(--rec)"></span>隐性 1（空闲/帧内隐性场）</span>
    <span><span class="sw" style="background:var(--accent2)"></span>本组隐性位 / 打断位</span>`;
  $('#trace-title').textContent = title;
  $('#tr-slider').max = String(Math.max(0, trace.length - 1));
  const start = gotoBit !== undefined ? trace.findIndex((b) => b.i >= gotoBit) : 0;
  renderTrack();
  seek(Math.max(0, start));
  $('#trace-modal').classList.remove('hidden');
  play();
}

function closeTrace() {
  stop();
  $('#trace-modal').classList.add('hidden');
}
$('#trace-close').addEventListener('click', closeTrace);
$('#trace-modal').addEventListener('click', (e) => { if (e.target.id === 'trace-modal') closeTrace(); });

function renderTrack() {
  const track = $('#tr-track');
  track.innerHTML = '';
  const frag = document.createDocumentFragment();
  const errorBits = new Set((player.attempt?.errors || []).map((e) => e.globalBit));
  player.trace.forEach((b, k) => {
    const cell = document.createElement('span');
    const marked = player.markBits.has(b.i);
    cell.className = `bitcell ${b.bus === 0 ? 'dom' : 'rec'}${b.field === 'STUFF' ? ' stuff' : ''}${errorBits.has(b.i) ? ' errorbit' : ''}${marked ? ' marked' : ''}`;
    cell.dataset.k = k;
    cell.innerHTML = `<span class="bar"></span>`;
    cell.title = `#${b.i} ${b.field}/${b.label}`;
    cell.addEventListener('click', () => seek(k));
    frag.appendChild(cell);
  });
  track.appendChild(frag);
  $('#tr-legend').innerHTML = player.legendHtml || `
    <span><span class="sw" style="background:var(--dom)"></span>显性 0（SOF/仲裁/数据）</span>
    <span><span class="sw" style="background:var(--rec)"></span>隐性 1（线与空闲）</span>
    <span><span class="sw" style="background:var(--passive)"></span>填充位</span>
    <span><span class="sw" style="background:var(--err)"></span>违规证据位</span>`;
}

function seek(k) {
  player.idx = Math.max(0, Math.min(player.trace.length - 1, k));
  const b = player.trace[player.idx];
  $$('#tr-track .bitcell').forEach((el, i) => el.classList.toggle('cur', i === player.idx));
  $('#tr-slider').value = String(player.idx);
  $('#tr-pos').textContent = `#${b.i} / ${player.trace[player.trace.length - 1].i}`;
  const drives = b.drives ? Object.entries(b.drives).map(([n, v]) => `${escapeHtml(n)} 发 ${v}`).join('；') : '（无驱动器，空闲）';
  $('#tr-detail').innerHTML = `
    <div><b>${b.field} / ${b.label}</b>　总线 = ${b.bus === 0 ? '显性 0' : '隐性 1'}　|　${drives}</div>
    ${b.note ? `<div style="color:var(--warn);margin-top:3px">${escapeHtml(b.note)}</div>` : ''}`;
  const cur = $('#tr-track .bitcell.cur');
  cur?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'auto' });
}

function play() {
  stop();
  $('#tr-play').textContent = '⏸ 暂停';
  const ms = Number($('#tr-speed').value);
  player.timer = setInterval(() => {
    if (player.idx >= player.trace.length - 1) { stop(); $('#tr-play').textContent = '▶ 播放'; return; }
    seek(player.idx + 1);
  }, ms);
}
function stop() { if (player.timer) { clearInterval(player.timer); player.timer = null; } }

$('#tr-play').addEventListener('click', () => {
  if (player.timer) { stop(); $('#tr-play').textContent = '▶ 播放'; }
  else { if (player.idx >= player.trace.length - 1) seek(0); play(); }
});
$('#tr-step').addEventListener('click', () => { stop(); $('#tr-play').textContent = '▶ 播放'; seek(player.idx + 1); });
$('#tr-first').addEventListener('click', () => { stop(); $('#tr-play').textContent = '▶ 播放'; seek(0); });
$('#tr-slider').addEventListener('input', (e) => { stop(); $('#tr-play').textContent = '▶ 播放'; seek(Number(e.target.value)); });
$('#tr-speed').addEventListener('change', () => { if (player.timer) play(); });

/* ------------------------- 示例场景 ------------------------- */

const SAMPLES = {
  normal: {
    nodes: [{ name: 'CAM-A', tec: 0 }, { name: 'CAM-B', tec: 0 }, { name: 'RADAR', tec: 0 }],
    requests: [
      { time: 0, node: 'CAM-A', id: '0x200', dlc: 2, data: '11 22', error: null },
      { time: 0, node: 'CAM-B', id: '0x100', dlc: 1, data: 'AA', error: null },
      { time: 0, node: 'RADAR', id: '0x180', dlc: 0, data: '', error: null },
      { time: 200, node: 'RADAR', id: '0x180', dlc: 0, data: '', error: null },
    ],
  },
  passive: {
    nodes: [{ name: 'CAM-A', tec: 126 }, { name: 'CAM-B', tec: 0 }],
    requests: [
      { time: 0, node: 'CAM-A', id: '0x100', dlc: 1, data: '00', error: { type: 'bit', dataBit: 0 } },
      { time: 300, node: 'CAM-A', id: '0x101', dlc: 1, data: '00', error: { type: 'bit', dataBit: 0 } },
    ],
  },
  busoff: {
    nodes: [{ name: 'CAM-A', tec: 248 }, { name: 'CAM-B', tec: 0 }, { name: 'RADAR', tec: 0 }],
    requests: [
      { time: 0, node: 'CAM-A', id: '0x100', dlc: 1, data: '00', error: { type: 'bit', dataBit: 0 } },
      { time: 600, node: 'CAM-B', id: '0x300', dlc: 0, data: '', error: null },
      { time: 1000, node: 'CAM-A', id: '0x200', dlc: 0, data: '', error: null },
    ],
  },
};

function loadSample(key) {
  const s = JSON.parse(JSON.stringify(SAMPLES[key]));
  state.nodes = s.nodes;
  state.requests = s.requests;
  renderAll();
}
$('#btn-sample-normal').addEventListener('click', () => loadSample('normal'));
$('#btn-sample-passive').addEventListener('click', () => loadSample('passive'));
$('#btn-sample-busoff').addEventListener('click', () => loadSample('busoff'));

/* ------------------------- 工具 ------------------------- */

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

/* ------------------------- 初始化 ------------------------- */

renderAll();
