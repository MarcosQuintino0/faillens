export const clientScript = String.raw`
(function () {
  "use strict";
  var report = JSON.parse(document.getElementById("faillens-data").textContent);
  var all = [];
  report.specs.forEach(function (spec) {
    spec.tests.forEach(function (test) { all.push({ spec: spec, test: test }); });
  });
  var state = {
    mode: "all",
    query: "",
    selected: null,
    requestId: null
  };
  var sidebar = document.getElementById("test-list");
  var detail = document.getElementById("detail");
  var toast = document.getElementById("toast");

  function e(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }
  function json(value) {
    if (value === undefined || value === null) return value === null ? "null" : "—";
    if (typeof value === "string") return value;
    try { return JSON.stringify(value, null, 2); } catch (_) { return String(value); }
  }
  function duration(ms) {
    ms = Number(ms || 0);
    return ms >= 1000 ? (ms / 1000).toFixed(ms >= 10000 ? 1 : 2).replace(/0$/, "") + "s" : Math.round(ms) + "ms";
  }
  function statusLabel(value) {
    return value === "failed" ? "Falhou" : value === "passed" ? "Passou" : value === "skipped" ? "Ignorado" : "Desconhecido";
  }
  function assertionState(value) {
    return value === "failed" ? "Falhou" : value === "passed" ? "Passou" : value === "pending" ? "Pendente" : value === "skipped" ? "Ignorada" : "Observada";
  }
  function assertionIcon(value) {
    return value === "failed" ? "×" : value === "passed" ? "✓" : value === "skipped" ? "−" : "○";
  }
  function statusMeaning(status) {
    var labels = {
      200: "OK", 201: "Created", 202: "Accepted", 204: "No Content",
      400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found",
      409: "Conflict", 422: "Unprocessable Entity", 429: "Too Many Requests",
      500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable"
    };
    return labels[Number(status)] || (status == null ? "Sem resposta HTTP" : "Status HTTP");
  }
  function baseName(value) {
    var parts = String(value || "spec desconhecida").replace(/\\/g, "/").split("/");
    return parts[parts.length - 1];
  }
  function flash(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(flash.timer);
    flash.timer = setTimeout(function () { toast.classList.remove("show"); }, 1500);
  }
  function fallbackCopy(text) {
    var area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try { document.execCommand("copy"); flash("Copiado"); } catch (_) { flash("Não foi possível copiar"); }
    area.remove();
  }
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { flash("Copiado"); }, function () { fallbackCopy(text); });
    } else fallbackCopy(text);
  }
  function visibleItems() {
    var query = state.query.toLowerCase();
    return all.filter(function (item) {
      return (state.mode === "all" || item.test.state === "failed") &&
        (!query || item.test.title.toLowerCase().indexOf(query) >= 0 || item.spec.specPath.toLowerCase().indexOf(query) >= 0);
    });
  }
  function itemKey(item) { return item.spec.specPath + "::" + item.test.id; }
  function selectedItem() { return all.find(function (item) { return itemKey(item) === state.selected; }); }

  function renderSidebar() {
    var visible = visibleItems();
    if (!state.selected || !visible.some(function (item) { return itemKey(item) === state.selected; })) {
      state.selected = visible.length ? itemKey(visible[0]) : null;
      state.requestId = null;
    }
    var groups = {};
    visible.forEach(function (item) {
      (groups[item.spec.specPath] || (groups[item.spec.specPath] = [])).push(item);
    });
    sidebar.innerHTML = Object.keys(groups).map(function (specPath) {
      var items = groups[specPath];
      var failures = items.filter(function (item) { return item.test.state === "failed"; }).length;
      var badge = failures
        ? '<span class="spec-badge failed">' + failures + (failures === 1 ? ' falha' : ' falhas') + '</span>'
        : '<span class="spec-badge">tudo ok</span>';
      return '<section class="spec-group"><div class="spec-heading"><span class="spec-name" title="' + e(specPath) + '">' + e(baseName(specPath)) + '</span>' + badge + '</div>' +
        items.map(function (item) {
          var key = itemKey(item);
          return '<button class="test-item ' + e(item.test.state) + ' ' + (key === state.selected ? 'active' : '') + '" data-test="' + e(key) + '">' +
            '<span class="status-dot ' + e(item.test.state) + '"></span><span class="test-title">' + e(item.test.title) + '</span>' +
            '<span class="test-duration">' + e(duration(item.test.durationMs)) + '</span></button>';
        }).join("") + '</section>';
    }).join("") || '<div class="empty"><div>Nenhum teste corresponde ao filtro.</div></div>';
    renderDetail();
  }

  function assertionsHtml(test) {
    var assertions = test.assertions || [];
    if (!assertions.length) return '<p class="empty-note">Nenhuma assertion individual foi capturada.</p>';
    return '<div class="assertion-list">' + assertions.map(function (assertion) {
      return '<div class="assertion-item ' + e(assertion.state) + '"><span class="assertion-icon">' + assertionIcon(assertion.state) + '</span>' +
        '<span class="assertion-copy">' + e(assertion.title) + '</span><span class="assertion-status">' + e(assertionState(assertion.state)) + '</span></div>';
    }).join("") + '</div>';
  }

  function diagnosisHtml(test) {
    if (!test.diagnosis) return '<p>Nenhum diagnóstico determinístico foi necessário para este teste.</p>';
    var value = test.diagnosis;
    return '<p>' + e(value.summary) + '</p>' +
      '<div class="diagnosis-meta"><span class="meta-tag">' + e(value.category) + '</span><span class="meta-tag">confiança ' + e(value.confidence) + '</span></div>' +
      '<p class="suggested-action"><strong>Ação sugerida:</strong> ' + e(value.suggestedAction) + '</p>';
  }

  function comparisonBody(expected, fallback) {
    if (expected !== undefined && typeof expected === "object") return json(expected);
    return fallback;
  }

  function chainedUrl(request) {
    var url = String(request.originalUrl || request.url || "");
    if (/^https?:\/\//i.test(url)) {
      try {
        var parsed = new URL(url);
        url = parsed.pathname + parsed.search + parsed.hash;
      } catch (_) {}
    }
    var identifier = (request.usedVariables || []).find(function (name) { return /_ID$/.test(name); });
    if (identifier && url.indexOf(identifier) < 0) {
      url = url.replace(/\/[^/?#]+(?=[?#]|$)/, "/" + identifier);
    }
    return url;
  }

  function requestRows(test) {
    var maximum = Math.max.apply(null, test.requests.map(function (request) { return Number(request.durationMs || 0); }).concat([1]));
    return test.requests.map(function (request) {
      var status = request.receivedStatus == null ? "SEM_RESPOSTA" : request.receivedStatus;
      var bad = Boolean(request.error) || (test.state === "failed" && request.id === test.mainRequestId);
      var generated = (request.generatedVariables || [])[0];
      var used = (request.usedVariables || [])[0];
      var variable = generated ? "→ " + generated : used ? "usa " + used : "—";
      var variableClass = generated ? " generated" : "";
      var barWidth = Math.max(10, Math.round((request.durationMs || 0) / maximum * 100));
      var methodClass = String(request.method || "get").toLowerCase();
      return '<button class="request-row ' + (request.id === state.requestId ? 'active' : '') + '" data-request="' + e(request.id) + '">' +
        '<span class="request-order">' + e(request.order) + '</span>' +
        '<span class="request-method ' + e(methodClass) + '">' + e(request.method) + '</span>' +
        '<span class="request-url" title="' + e(request.originalUrl || request.url) + '">' + e(chainedUrl(request)) + '</span>' +
        '<span class="request-bar-track"><span class="request-bar ' + e(request.phase) + '" style="width:' + barWidth + '%"></span></span>' +
        '<span class="request-variable' + variableClass + '">' + e(variable) + '</span>' +
        '<span class="request-status ' + (bad ? 'bad' : '') + '">' + e(status) + '</span>' +
        '<span class="request-time">' + e(duration(request.durationMs)) + '</span>' +
        '<span class="request-curl">&lt;/&gt; cURL</span></button>';
    }).join("") || '<p class="empty-note">Nenhuma chamada cy.request foi capturada neste teste.</p>';
  }

  function codePanel(title, context, content, copyKind, extraClass) {
    return '<div class="code-panel ' + e(extraClass || "") + '"><div class="code-head"><div><div class="code-title">' + e(title) + '</div>' +
      (context ? '<div class="code-context">' + e(context) + '</div>' : '') + '</div>' +
      (copyKind ? '<button class="copy-button" data-copy-kind="' + e(copyKind) + '">copiar</button>' : '') + '</div><pre>' + e(content) + '</pre></div>';
  }

  function failureSections(test, main, expected, actual) {
    if (test.state !== "failed") return '';
    var error = test.error || {};
    var location = error.file ? error.file + (error.line ? ':' + error.line + ':' + (error.column || 0) : '') : '';
    var expectedPayload = comparisonBody(error.expected, "Nenhum payload esperado foi capturado.\nA comparação disponível é o status HTTP.");
    var receivedPayload = main ? json(main.responseBody) : "Nenhuma resposta HTTP foi capturada.";
    return '<div class="analysis-grid"><section class="section-card failure-reason"><h3>Motivo da falha</h3>' + diagnosisHtml(test) + '</section>' +
      '<section class="section-card"><h3>Assertions</h3>' + assertionsHtml(test) + '</section></div>' +
      '<section class="failure-banner"><div class="failure-banner-label">Assertion falhou</div><div class="failure-message">' + e(error.message || "Falha registrada sem mensagem.") + '</div>' +
      (location ? '<div class="failure-location">at ' + e(location) + '</div>' : '') + '</section>' +
      '<section class="panel"><div class="panel-head"><h3>Esperado vs. recebido</h3><span class="panel-hint">somente evidências capturadas</span></div><div class="panel-body comparison-grid">' +
      '<div class="comparison-card"><div class="comparison-head">Esperado <span class="status-token">' + e(expected) + '</span></div><pre>' + e(expectedPayload) + '</pre></div>' +
      '<div class="comparison-card received"><div class="comparison-head">Recebido <span class="status-token">' + e(actual) + '</span></div><pre>' + e(receivedPayload) + '</pre></div></div></section>';
  }

  function renderDetail() {
    var item = selectedItem();
    if (!item) {
      detail.innerHTML = '<div class="empty"><div>Selecione um teste para começar o debug.</div></div>';
      return;
    }
    var test = item.test;
    var main = test.requests.find(function (request) { return request.id === test.mainRequestId; }) || test.requests[0];
    if (!state.requestId || !test.requests.some(function (request) { return request.id === state.requestId; })) {
      state.requestId = main ? main.id : null;
    }
    var selectedRequest = test.requests.find(function (request) { return request.id === state.requestId; });
    var expected = test.error && test.error.expected !== undefined ? json(test.error.expected) : "—";
    var actual = test.error && test.error.actual !== undefined
      ? json(test.error.actual)
      : (main && main.receivedStatus != null ? String(main.receivedStatus) : "—");
    var endpoint = main
      ? '<span class="endpoint">' + e(report.project && report.project.name || "projeto") + ' / <span class="method">' + e(main.method) + '</span> ' + e(chainedUrl(main)) + '</span>'
      : '';
    var selectedContext = selectedRequest ? 'passo ' + selectedRequest.order + ' · ' + selectedRequest.method + ' ' + chainedUrl(selectedRequest) : '';
    var selectedHtml = selectedRequest
      ? codePanel("cURL", selectedContext, selectedRequest.curl, "curl", "") +
        codePanel("Response body", selectedRequest.receivedStatus == null ? "sem resposta" : selectedRequest.receivedStatus + " · " + statusMeaning(selectedRequest.receivedStatus), json(selectedRequest.responseBody), "response", "") +
        codePanel("Request body", "payload enviado", json(selectedRequest.requestBody), "request", "full-span")
      : '<p class="empty-note">Selecione uma chamada.</p>';

    detail.innerHTML = '<header class="detail-head"><div class="detail-title"><h2>' + e(test.title) + '</h2><div class="detail-meta">' + endpoint + '</div></div>' +
      '<div class="detail-state"><span class="badge ' + e(test.state) + '">' + e(statusLabel(test.state)) + '</span><span class="detail-duration">' + e(duration(test.durationMs)) + '</span></div></header>' +
      '<div class="metrics-grid"><div class="metric-card"><span>Status esperado</span><strong>' + e(expected) + '</strong><small>' + e(statusMeaning(Number(expected))) + '</small></div>' +
      '<div class="metric-card ' + (test.state === "failed" ? 'danger' : '') + '"><span>Status atual</span><strong>' + e(actual) + '</strong><small>' + e(statusMeaning(Number(actual))) + '</small></div>' +
      '<div class="metric-card"><span>Duração</span><strong>' + e(duration(test.durationMs)) + '</strong><small>Tempo total do teste</small></div>' +
      '<div class="metric-card"><span>Requisições</span><strong>' + e(test.requests.length) + '</strong><small>Executadas</small></div></div>' +
      failureSections(test, main, expected, actual) +
      '<section class="panel"><div class="panel-head sequence-head"><div><h3>Sequência de chamadas</h3><span class="panel-hint">Clique numa chamada para ver o cURL dela abaixo. Os valores encadeiam — a resposta de uma alimenta a próxima.</span></div>' +
      '<div class="sequence-legend"><span><i class="legend-dot preparacao"></i>Preparação</span><span><i class="legend-dot validacao"></i>Validação</span><span><i class="legend-dot verificacao"></i>Verificação</span></div></div>' +
      '<div class="panel-body sequence-scroll"><div class="sequence">' + requestRows(test) + '</div></div></section>' +
      '<section class="panel"><div class="panel-head"><div><h3>Chamada selecionada</h3><span class="panel-hint">' + e(selectedContext) + '</span></div>' +
      '<button class="copy-button" data-copy-kind="script">Copiar sequência completa</button></div><div class="panel-body selected-grid">' + selectedHtml + '</div></section>' +
      '<section class="panel reproduction"><div class="panel-head"><div><h3>Prévia · Script de reprodução</h3><span class="panel-hint">cole no terminal e execute de cima a baixo; ajuste o ambiente quando necessário</span></div>' +
      '<button class="copy-button" data-copy-kind="script">copiar script</button></div><pre>' + e(test.reproductionScript || "Nenhuma request disponível.") + '</pre></section>';
  }

  document.getElementById("filter").addEventListener("input", function (event) {
    state.query = event.target.value;
    renderSidebar();
  });
  document.querySelector(".chips").addEventListener("click", function (event) {
    var button = event.target.closest("[data-mode]");
    if (!button) return;
    state.mode = button.dataset.mode;
    document.querySelectorAll("[data-mode]").forEach(function (node) {
      node.classList.toggle("active", node.dataset.mode === state.mode);
    });
    renderSidebar();
  });
  sidebar.addEventListener("click", function (event) {
    var button = event.target.closest("[data-test]");
    if (!button) return;
    state.selected = button.dataset.test;
    state.requestId = null;
    renderSidebar();
  });
  detail.addEventListener("click", function (event) {
    var requestButton = event.target.closest("[data-request]");
    if (requestButton) {
      state.requestId = requestButton.dataset.request;
      renderDetail();
      return;
    }
    var copyButton = event.target.closest("[data-copy-kind]");
    if (!copyButton) return;
    var current = selectedItem();
    if (!current) return;
    var selectedRequest = current.test.requests.find(function (request) { return request.id === state.requestId; });
    var kind = copyButton.dataset.copyKind;
    if (kind === "script") copy(current.test.reproductionScript || "");
    else if (kind === "curl") copy(selectedRequest ? selectedRequest.curl : "");
    else if (kind === "response") copy(selectedRequest ? json(selectedRequest.responseBody) : "");
    else if (kind === "request") copy(selectedRequest ? json(selectedRequest.requestBody) : "");
  });
  function updateThemeLabel() {
    document.getElementById("theme-label").textContent = document.documentElement.dataset.theme === "dark" ? "Tema claro" : "Tema escuro";
  }
  document.getElementById("theme-toggle").addEventListener("click", function () {
    var next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("faillens-theme", next); } catch (_) {}
    updateThemeLabel();
  });
  document.getElementById("export-report").addEventListener("click", function () {
    var blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "faillens-report.json";
    link.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  });
  try {
    var savedTheme = localStorage.getItem("faillens-theme");
    if (savedTheme === "light" || savedTheme === "dark") document.documentElement.dataset.theme = savedTheme;
  } catch (_) {}
  updateThemeLabel();
  document.querySelectorAll("[data-mode]").forEach(function (node) {
    node.classList.toggle("active", node.dataset.mode === state.mode);
  });
  renderSidebar();
})();
`;
