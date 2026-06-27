export const clientScript = String.raw`
(function () {
  "use strict";
  var report = JSON.parse(document.getElementById("faillens-data").textContent);
  var all = [];
  report.specs.forEach(function (spec) {
    spec.tests.forEach(function (test) { all.push({ spec: spec, test: test }); });
  });
  var state = { mode: report.summary.failed ? "failed" : "all", query: "", selected: null, requestId: null };
  var sidebar = document.getElementById("test-list");
  var detail = document.getElementById("detail");
  var toast = document.getElementById("toast");

  function e(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }
  function json(value) {
    if (value === undefined) return "—";
    if (typeof value === "string") return value;
    try { return JSON.stringify(value, null, 2); } catch (_) { return String(value); }
  }
  function duration(ms) {
    ms = Number(ms || 0);
    return ms >= 1000 ? (ms / 1000).toFixed(ms >= 10000 ? 1 : 2) + " s" : Math.round(ms) + " ms";
  }
  function statusLabel(stateValue) {
    return stateValue === "failed" ? "Falhou" : stateValue === "passed" ? "Passou" : stateValue === "skipped" ? "Ignorado" : "Desconhecido";
  }
  function flash(message) {
    toast.textContent = message; toast.classList.add("show");
    clearTimeout(flash.timer); flash.timer = setTimeout(function () { toast.classList.remove("show"); }, 1500);
  }
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { flash("Copiado"); }, function () { fallback(text); });
    } else fallback(text);
  }
  function fallback(text) {
    var area = document.createElement("textarea"); area.value = text; area.style.position = "fixed"; area.style.opacity = "0";
    document.body.appendChild(area); area.select();
    try { document.execCommand("copy"); flash("Copiado"); } catch (_) { flash("Não foi possível copiar"); }
    area.remove();
  }
  function visibleItems() {
    var query = state.query.toLowerCase();
    return all.filter(function (item) {
      return (state.mode === "all" || item.test.state === "failed") &&
        (!query || item.test.title.toLowerCase().indexOf(query) >= 0 || item.spec.specPath.toLowerCase().indexOf(query) >= 0);
    });
  }
  function itemKey(item) { return item.spec.specPath + "::" + item.test.id; }
  function selectedItem() {
    return all.find(function (item) { return itemKey(item) === state.selected; });
  }
  function renderSidebar() {
    var visible = visibleItems();
    if (!state.selected || !visible.some(function (item) { return itemKey(item) === state.selected; })) {
      state.selected = visible.length ? itemKey(visible[0]) : null;
      state.requestId = null;
    }
    var groups = {};
    visible.forEach(function (item) { (groups[item.spec.specPath] || (groups[item.spec.specPath] = [])).push(item); });
    sidebar.innerHTML = Object.keys(groups).map(function (specPath) {
      return '<section class="spec-group"><div class="spec-title" title="' + e(specPath) + '">' + e(specPath) + '</div>' +
        groups[specPath].map(function (item) {
          var key = itemKey(item);
          return '<button class="test-item ' + (key === state.selected ? 'active' : '') + '" data-test="' + e(key) + '">' +
            '<span class="status-dot ' + e(item.test.state) + '"></span><span class="test-title">' + e(item.test.title) + '</span>' +
            '<span class="test-duration">' + e(duration(item.test.durationMs)) + '</span></button>';
        }).join("") + '</section>';
    }).join("") || '<div class="empty"><div>Nenhum teste corresponde ao filtro.</div></div>';
    renderDetail();
  }
  function evidence(diagnosis) {
    return diagnosis.evidence && diagnosis.evidence.length
      ? '<ul class="evidence">' + diagnosis.evidence.map(function (item) { return '<li>' + e(item) + '</li>'; }).join("") + '</ul>'
      : '';
  }
  function diagnosisHtml(value) {
    if (!value) return '<p class="no-diagnosis">Nenhum diagnóstico foi necessário para este teste.</p>';
    return '<div class="confidence">Confiança ' + e(value.confidence) + ' · ' + e(value.category) + '</div>' +
      '<h4>' + e(value.title) + '</h4><p>' + e(value.summary) + '</p>' + evidence(value) +
      '<p class="suggestion"><strong>Ação sugerida:</strong> ' + e(value.suggestedAction) + '</p>';
  }
  function requestRows(test) {
    var max = Math.max.apply(null, test.requests.map(function (request) { return Number(request.durationMs || 0); }).concat([1]));
    return test.requests.map(function (request) {
      var status = request.receivedStatus == null ? "SEM_RESPOSTA" : request.receivedStatus;
      var bad = request.receivedStatus == null || request.receivedStatus >= 400;
      var vars = [];
      (request.generatedVariables || []).forEach(function (name) { vars.push("gera " + name); });
      (request.usedVariables || []).forEach(function (name) { vars.push("usa " + name); });
      return '<button class="request-row ' + (request.id === state.requestId ? 'active' : '') + '" data-request="' + e(request.id) + '">' +
        '<span class="req-order">#' + e(request.order) + '</span><span class="method">' + e(request.method) + '</span>' +
        '<span class="req-url" title="' + e(request.originalUrl || request.url) + '">' + e(request.originalUrl || request.url) + (vars.length ? '<span class="vars">' + e(vars.join(" · ")) + '</span>' : '') + '</span>' +
        '<span class="req-status ' + (bad ? 'bad' : 'ok') + '">' + e(status) + '</span><span class="req-time">' + e(duration(request.durationMs)) + '</span>' +
        '<span class="req-phase">' + e(request.phase) + '</span><span class="button mini" data-copy-request="' + e(request.id) + '">Copiar cURL</span>' +
        '<span class="time-bar" style="width:' + Math.max(2, Math.round((request.durationMs || 0) / max * 100)) + '%"></span></button>';
    }).join("") || '<p class="no-diagnosis">Nenhuma chamada cy.request foi capturada neste teste.</p>';
  }
  function codeBlock(label, value, copyKind, full) {
    return '<div class="code-block ' + (full ? 'full' : '') + '"><div class="code-label">' + e(label) + '</div>' +
      (copyKind ? '<button class="button mini copy" data-copy-kind="' + e(copyKind) + '">Copiar</button>' : '') +
      '<pre>' + e(value) + '</pre></div>';
  }
  function renderDetail() {
    var item = selectedItem();
    if (!item) { detail.innerHTML = '<div class="empty"><div>Selecione um teste para começar o debug.</div></div>'; return; }
    var test = item.test;
    var main = test.requests.find(function (request) { return request.id === test.mainRequestId; }) || test.requests[0];
    if (!state.requestId || !test.requests.some(function (request) { return request.id === state.requestId; })) state.requestId = main ? main.id : null;
    var selectedRequest = test.requests.find(function (request) { return request.id === state.requestId; });
    var expected = test.error && test.error.expected !== undefined ? json(test.error.expected) : "—";
    var actual = test.error && test.error.actual !== undefined ? json(test.error.actual) : (main && main.receivedStatus != null ? String(main.receivedStatus) : "—");
    var location = test.error && test.error.file ? test.error.file + (test.error.line ? ':' + test.error.line + ':' + (test.error.column || 0) : '') : '';
    detail.innerHTML = '<header class="test-head"><div><div class="eyebrow">' + e(item.spec.specPath) + '</div><h2>' + e(test.title) + '</h2>' +
      '<div class="meta-row"><span class="badge ' + e(test.state) + '">' + e(statusLabel(test.state)) + '</span><span>' + e(duration(test.durationMs)) + '</span>' +
      (main ? '<span class="endpoint"><b class="method">' + e(main.method) + '</b> ' + e(main.originalUrl || main.url) + '</span>' : '') + '</div></div></header>' +
      '<div class="cards"><div class="metric"><span>Status esperado</span><strong>' + e(expected) + '</strong></div>' +
      '<div class="metric"><span>Status atual</span><strong>' + e(actual) + '</strong></div><div class="metric"><span>Duração</span><strong>' + e(duration(test.durationMs)) + '</strong></div>' +
      '<div class="metric"><span>Requisições</span><strong>' + e(test.requests.length) + '</strong></div></div>' +
      '<section class="panel diagnosis"><div class="panel-head"><h3>Diagnóstico da falha</h3></div><div class="panel-body">' + diagnosisHtml(test.diagnosis) + '</div></section>' +
      '<section class="panel"><div class="panel-head"><h3>Assertions</h3></div><div class="panel-body">' + e((test.error && test.error.assertionMessage) || "Nenhuma mensagem descritiva de assertion foi registrada.") + (location ? '<div class="vars">' + e(location) + '</div>' : '') + '</div></section>' +
      '<section class="panel"><div class="panel-head"><h3>Assertion falhou</h3></div><div class="panel-body"><div class="assertion">' + e((test.error && test.error.message) || "Nenhuma falha de assertion registrada.") + '</div></div></section>' +
      '<section class="panel"><div class="panel-head"><h3>Esperado vs. recebido</h3></div><div class="panel-body compare"><div class="compare-card"><span>Esperado</span><strong>' + e(expected) + '</strong></div><div class="compare-card"><span>Recebido</span><strong>' + e(actual) + '</strong></div></div></section>' +
      '<section class="panel"><div class="panel-head"><h3>Sequência de chamadas</h3></div><div class="panel-body sequence">' + requestRows(test) + '</div></section>' +
      '<section class="panel"><div class="panel-head"><h3>Chamada selecionada</h3></div><div class="panel-body request-tabs">' +
      (selectedRequest ? codeBlock("cURL", selectedRequest.curl, "curl", true) + codeBlock("Request body", json(selectedRequest.requestBody), null, false) + codeBlock("Response body", json(selectedRequest.responseBody), null, false) : '<p class="no-diagnosis">Selecione uma chamada.</p>') +
      codeBlock("Prévia de reprodução completa", test.reproductionScript || "Nenhuma request disponível.", "script", true) + '</div></section>';
  }

  document.getElementById("filter").addEventListener("input", function (event) { state.query = event.target.value; renderSidebar(); });
  document.querySelector(".chips").addEventListener("click", function (event) {
    var button = event.target.closest("[data-mode]"); if (!button) return;
    state.mode = button.dataset.mode;
    document.querySelectorAll("[data-mode]").forEach(function (node) { node.classList.toggle("active", node.dataset.mode === state.mode); });
    renderSidebar();
  });
  sidebar.addEventListener("click", function (event) {
    var button = event.target.closest("[data-test]"); if (!button) return;
    state.selected = button.dataset.test; state.requestId = null; renderSidebar();
  });
  detail.addEventListener("click", function (event) {
    var curlButton = event.target.closest("[data-copy-request]");
    if (curlButton) {
      event.preventDefault(); event.stopPropagation();
      var current = selectedItem(); var request = current && current.test.requests.find(function (item) { return item.id === curlButton.dataset.copyRequest; });
      if (request) copy(request.curl); return;
    }
    var requestButton = event.target.closest("[data-request]");
    if (requestButton) { state.requestId = requestButton.dataset.request; renderDetail(); return; }
    var copyButton = event.target.closest("[data-copy-kind]");
    if (copyButton) {
      var selected = selectedItem(); if (!selected) return;
      var selectedReq = selected.test.requests.find(function (item) { return item.id === state.requestId; });
      copy(copyButton.dataset.copyKind === "curl" ? (selectedReq ? selectedReq.curl : "") : (selected.test.reproductionScript || ""));
    }
  });
  document.getElementById("theme-toggle").addEventListener("click", function () {
    var next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next; try { localStorage.setItem("faillens-theme", next); } catch (_) {}
  });
  document.getElementById("export-report").addEventListener("click", function () {
    var blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob); var link = document.createElement("a"); link.href = url; link.download = "faillens-report.json"; link.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  });
  try { var saved = localStorage.getItem("faillens-theme"); if (saved) document.documentElement.dataset.theme = saved; } catch (_) {}
  document.querySelectorAll("[data-mode]").forEach(function (node) { node.classList.toggle("active", node.dataset.mode === state.mode); });
  renderSidebar();
})();
`;
