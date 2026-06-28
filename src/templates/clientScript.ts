export const clientScript = String.raw`
(function () {
  "use strict";
  var report = JSON.parse(document.getElementById("faillens-data").textContent);
  var all = [];
  report.specs.forEach(function (spec) {
    spec.tests.forEach(function (test) { all.push({ spec: spec, test: test }); });
  });
  var state = { mode: "all", query: "", selected: null, requestId: null, view: "call",
    collapsedSpecs: {}, passedShown: {}, seqShown: {}, assertShown: {} };
  var sidebar = document.getElementById("test-list");
  var detail = document.getElementById("detail");
  var toast = document.getElementById("toast");

  var COPY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15V5a2 2 0 0 1 2-2h10"></path></svg>';

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
    return value === "failed" ? "✕" : value === "passed" ? "✓" : value === "skipped" ? "⊘" : "○";
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
  function copyFeedback(button, success) {
    flash(success ? "Copiado para a área de transferência" : "Não foi possível copiar");
    if (!button || !success) return;
    var original = button.innerHTML;
    button.classList.add("copied");
    button.innerHTML = '<span class="copy-check">✓</span>';
    clearTimeout(button.__failLensCopyTimer);
    button.__failLensCopyTimer = setTimeout(function () {
      button.classList.remove("copied");
      button.innerHTML = original;
    }, 1400);
  }
  function flash(message) {
    toast.innerHTML = '<span class="toast-check">✓</span><span>' + e(message) + '</span>';
    toast.classList.add("show");
    clearTimeout(flash.timer);
    flash.timer = setTimeout(function () { toast.classList.remove("show"); }, 1800);
  }
  function fallbackCopy(text, button) {
    var area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    var success = false;
    try { success = document.execCommand("copy"); } catch (_) {}
    area.remove();
    copyFeedback(button, success);
  }
  function copy(text, button) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { copyFeedback(button, true); }, function () { fallbackCopy(text, button); });
    } else fallbackCopy(text, button);
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
      state.view = "call";
    }
    var groups = {};
    visible.forEach(function (item) {
      (groups[item.spec.specPath] || (groups[item.spec.specPath] = [])).push(item);
    });
    sidebar.innerHTML = Object.keys(groups).map(function (specPath) {
      var items = groups[specPath];
      var failures = items.filter(function (item) { return item.test.state === "failed"; }).length;
      var passedItems = items.filter(function (item) { return item.test.state === "passed"; });
      var passedCount = passedItems.length;
      var collapsed = !!state.collapsedSpecs[specPath];
      var mixed = failures > 0 && passedCount > 0;
      var showPassed = !!state.passedShown[specPath];
      var counts = (failures ? '<span class="cnt-f">' + failures + ' ✕</span>' : "") +
        '<span class="cnt-p' + (passedCount ? "" : " zero") + '">' + passedCount + ' ✓</span>';
      var rows = items.map(function (item) {
        var key = itemKey(item);
        var hide = mixed && item.test.state === "passed" && !showPassed && key !== state.selected;
        return '<button class="test-item ' + e(item.test.state) + (key === state.selected ? " active" : "") + (hide ? " is-hidden" : "") + '" data-test="' + e(key) + '">' +
          '<span class="status-dot ' + e(item.test.state) + '"></span><span class="test-title">' + e(item.test.title) + '</span>' +
          '<span class="test-duration">' + e(duration(item.test.durationMs)) + '</span></button>';
      }).join("");
      var hiddenPassed = mixed ? passedItems.filter(function (item) { return itemKey(item) !== state.selected; }).length : 0;
      var passedToggle = (mixed && hiddenPassed > 0)
        ? '<button class="passed-toggle" data-passed-toggle="' + e(specPath) + '"><span class="more-chev">▾</span> ' + (showPassed ? "ocultar os que passaram" : hiddenPassed + " passaram") + '</button>'
        : "";
      return '<section class="spec-group' + (collapsed ? " collapsed" : "") + '">' +
        '<button class="spec-heading" data-spec-toggle="' + e(specPath) + '"><span class="spec-chev">▾</span>' +
        '<span class="spec-name" title="' + e(specPath) + '">' + e(baseName(specPath)) + '</span><span class="spec-counts">' + counts + '</span></button>' +
        rows + passedToggle + '</section>';
    }).join("") || '<div class="empty"><div>Nenhum teste corresponde ao filtro.</div></div>';
    renderDetail();
  }

  function assertionItemHtml(assertion, hidden) {
    var location = assertion.file ? baseName(assertion.file) + (assertion.line ? ':' + assertion.line : '') : '';
    return '<div class="assertion-item ' + e(assertion.state) + (hidden ? " is-hidden" : "") + '"><span class="assertion-icon">' + assertionIcon(assertion.state) + '</span>' +
      '<span class="assertion-copy"><span>' + e(assertion.title) + '</span>' +
      (assertion.state === "pending" ? '<small class="assertion-note">Não executada após a falha anterior</small>' : (location ? '<small>' + e(location) + '</small>' : '')) + '</span>' +
      '<span class="assertion-target' + (!assertion.target || assertion.target === "unknown" ? ' empty' : '') + '">' + e(assertion.target && assertion.target !== "unknown" ? assertion.target : "n/a") + '</span>' +
      '<span class="assertion-status">' + e(assertionState(assertion.state)) + '</span></div>';
  }
  function assertionsHtml(test) {
    var assertions = test.assertions || [];
    if (!assertions.length) return '<p class="empty-note">Nenhuma assertion individual foi observada pelo Cypress.</p>';
    return '<div class="assertion-list">' + assertions.map(function (a) { return assertionItemHtml(a, false); }).join("") + '</div>';
  }
  function successAssertions(test) {
    var assertions = test.assertions || [];
    if (!assertions.length) return '<p class="empty-note">Nenhuma assertion individual foi observada pelo Cypress.</p>';
    var summary = '<div class="assert-summary"><span>✓</span><span>Contrato satisfeito — todas as asserções passaram</span><span class="assert-count">' + assertions.length + '/' + assertions.length + '</span></div>';
    var LIMIT = 8;
    var expanded = !!state.assertShown[test.id];
    var items = assertions.map(function (a, index) {
      return assertionItemHtml(a, assertions.length > LIMIT && !expanded && index >= LIMIT);
    }).join("");
    var more = assertions.length > LIMIT
      ? '<button class="more-btn" data-assert-toggle="' + e(test.id) + '"><span class="more-chev">▾</span> ' + (expanded ? "Mostrar menos" : "Mostrar mais " + (assertions.length - LIMIT) + " asserções") + '</button>'
      : "";
    return summary + '<div class="assertion-list two-col">' + items + '</div>' + more;
  }

  function diagnosisHtml(test) {
    if (!test.diagnosis) return '<p>Nenhum diagnóstico determinístico foi necessário para este teste.</p>';
    var value = test.diagnosis;
    return '<p>' + e(value.summary) + '</p>' +
      '<div class="diagnosis-meta"><span class="meta-tag">' + e(value.category) + '</span><span class="meta-tag">confiança ' + e(value.confidence) + '</span></div>' +
      '<p class="suggested-action"><strong>Ação sugerida:</strong> ' + e(value.suggestedAction) + '</p>';
  }

  function expectedPayload(test, expectedStatus) {
    var error = test.error || {};
    if (error.expected !== undefined && error.expected !== null && typeof error.expected === "object") return error.expected;
    var markers = test.payloadDiff || [];
    if (markers.some(function (marker) { return marker.kind === "whole-response"; })) {
      return { status: expectedStatus, body: "Resposta de erro; não uma coleção" };
    }
    var absent = {};
    markers.forEach(function (marker) {
      if (!marker.evidenceOnly && marker.path.indexOf("$.") === 0) absent[marker.path.slice(2)] = "<ausente>";
    });
    if (Object.keys(absent).length) return absent;
    return { status: expectedStatus };
  }
  function lineIndent(line) { return (line.match(/^\s*/) || [""])[0].length; }
  function diffRanges(lines, markers) {
    var ranges = [];
    (markers || []).forEach(function (marker) {
      if (marker.path === "$" || marker.kind === "whole-response") {
        ranges.push({ start: 0, end: lines.length - 1, reason: marker.reason });
        return;
      }
      var keyName = marker.path.split(".").pop();
      var start = lines.findIndex(function (line) {
        var key = line.match(/^\s*"([^"]+)"\s*:/);
        return key && key[1] === keyName;
      });
      if (start < 0) return;
      var end = start;
      if (/[[{]\s*,?$/.test(lines[start])) {
        var indent = lineIndent(lines[start]);
        for (var index = start + 1; index < lines.length; index += 1) {
          var trimmed = lines[index].trim();
          if (lineIndent(lines[index]) === indent && /^[}\]]/.test(trimmed)) { end = index; break; }
          if (lineIndent(lines[index]) <= indent && !/^[}\]]/.test(trimmed)) { end = index - 1; break; }
          end = index;
        }
      }
      ranges.push({ start: start, end: end, reason: marker.reason });
    });
    return ranges;
  }
  function highlightedJson(value, test, highlight) {
    var lines = json(value).split("\n");
    var ranges = highlight ? diffRanges(lines, test.payloadDiff || []) : [];
    return '<code class="json-lines">' + lines.map(function (line, index) {
      var range = ranges.find(function (item) { return index >= item.start && index <= item.end; });
      var classes = range ? ' diff-line' + (index === range.start ? ' diff-block-start' : '') + (index === range.end ? ' diff-block-end' : '') : '';
      return '<span class="json-line' + classes + '"' + (range ? ' title="' + e(range.reason) + '"' : '') + '>' + e(line || " ") + '</span>';
    }).join("") + '</code>';
  }

  function chainedUrl(request) {
    var url = String(request.originalUrl || request.url || "");
    if (/^https?:\/\//i.test(url)) {
      try {
        var parsed = new URL(url);
        url = parsed.pathname + parsed.search + parsed.hash;
      } catch (_) {}
    }
    var identifier = (request.usedVariables || []).find(function (name) { return /_ID$|^\$ID$/.test(name); });
    if (identifier && url.indexOf(identifier) < 0) url = url.replace(/\/[^/?#]+(?=[?#]|$)/, "/" + identifier);
    return url;
  }
  function chainLoc(value) {
    try { var parsed = new URL(value, "http://faillens.local"); return parsed.pathname + parsed.search; } catch (_) { return value; }
  }

  function isBadRequest(request, test) {
    return Boolean(request.error) || (test.state === "failed" && request.id === test.mainRequestId);
  }
  function statusBarClass(request, test) {
    if (isBadRequest(request, test)) return "bad";
    var status = request.receivedStatus;
    if (status == null) return "snone";
    if (Number(status) >= 400) return "s45";
    if (Number(status) >= 300) return "s3";
    return "s2";
  }
  function requestRowHtml(request, test, left, width, hidden) {
    var status = request.receivedStatus == null ? "—" : request.receivedStatus;
    var bad = isBadRequest(request, test);
    var methodClass = String(request.method || "get").toLowerCase();
    var redirects = request.redirects || [];
    var hops = redirects.map(function (hop) {
      return '<div class="seq-hop' + (hidden ? " is-hidden" : "") + '"><span class="seq-hop-arrow">↳</span>' +
        '<span class="seq-hop-code">' + e(hop.statusCode || "3xx") + '</span><span class="seq-hop-loc" title="' + e(hop.location) + '">' + e(chainLoc(hop.location)) + '</span></div>';
    }).join("");
    return '<div class="request-row ' + (request.id === state.requestId ? "active " : "") + (bad ? "bad " : "") + (hidden ? "is-hidden" : "") + '" data-request="' + e(request.id) + '" role="button" tabindex="0">' +
      '<span class="request-order">' + e(request.order) + '</span>' +
      '<span class="request-method ' + e(methodClass) + '">' + e(request.method) + '</span>' +
      '<span class="request-target"><span class="request-url" title="' + e(request.originalUrl || request.url) + '">' + e(chainedUrl(request)) + '</span>' +
      (redirects.length ? '<span class="redirect-badge">seguiu ' + e(redirects.length) + ' redirect' + (redirects.length === 1 ? "" : "s") + '</span>' : "") + '</span>' +
      '<span class="request-bar-track"><span class="request-bar ' + statusBarClass(request, test) + '" style="left:' + left + '%;width:' + width + '%"></span>' +
      '<span class="request-time">' + e(duration(request.durationMs)) + '</span></span>' +
      '<span class="request-status ' + (bad ? "bad" : "") + '">' + e(status) + '</span>' +
      '<button class="request-curl" data-copy-request="' + e(request.id) + '" aria-label="Copiar cURL" title="Copiar cURL desta chamada">' + COPY_ICON + '</button></div>' + hops;
  }
  function requestRows(test) {
    var requests = test.requests;
    if (!requests.length) return '<p class="empty-note">Nenhuma chamada cy.request foi capturada neste teste.</p>';
    var total = requests.reduce(function (sum, request) { return sum + Math.max(1, Number(request.durationMs || 0)); }, 0) || 1;
    var LIMIT = 10;
    var expanded = !!state.seqShown[test.id];
    var hideable = requests.filter(function (request, index) {
      return index >= LIMIT && !isBadRequest(request, test) && request.id !== state.requestId;
    }).length;
    var elapsed = 0;
    var rows = requests.map(function (request, index) {
      var time = Math.max(1, Number(request.durationMs || 0));
      var left = Math.round(elapsed / total * 1000) / 10;
      var width = Math.max(4, Math.round(time / total * 1000) / 10);
      elapsed += time;
      var hidden = !expanded && index >= LIMIT && !isBadRequest(request, test) && request.id !== state.requestId;
      return requestRowHtml(request, test, left, width, hidden);
    }).join("");
    var more = hideable > 0
      ? '<button class="more-btn" data-seq-toggle="' + e(test.id) + '"><span class="more-chev">▾</span> ' + (expanded ? "Mostrar menos" : "Mostrar mais " + hideable + " chamadas") + '</button>'
      : "";
    return rows + more;
  }
  function positionBarTimes() {
    detail.querySelectorAll(".request-bar-track").forEach(function (track) {
      var bar = track.querySelector(".request-bar");
      var label = track.querySelector(".request-time");
      if (!bar || !label) return;
      var trackWidth = track.clientWidth;
      if (!trackWidth) return;
      var labelWidth = label.offsetWidth;
      var barRight = bar.offsetLeft + bar.offsetWidth;
      var inside = bar.offsetWidth >= labelWidth + 10;
      var left = inside ? barRight - labelWidth - 5 : Math.min(barRight + 4, trackWidth - labelWidth - 4);
      label.style.left = Math.max(2, left) + "px";
      label.classList.toggle("inside", inside);
    });
  }

  function redirectTrailHtml(request) {
    var redirects = request.redirects || [];
    if (!redirects.length) return '';
    return '<div class="redirect-trail"><div class="redirect-trail-title">Rastro de redirects <span>' + e(redirects.length) + ' salto' + (redirects.length === 1 ? '' : 's') + '</span></div>' +
      redirects.map(function (redirect, index) {
        return '<div class="redirect-hop"><span>' + e(index + 1) + '</span><strong>' + e(redirect.statusCode || '3xx') + '</strong><code>' + e(redirect.location) + '</code></div>';
      }).join('') + '</div>';
  }

  function codePanel(title, context, content, copyKind, extraClass) {
    return '<div class="code-panel ' + e(extraClass || "") + '"><div class="code-head"><span class="code-title">' + e(title) + '</span>' +
      '<span class="code-head-actions">' + (context ? '<span class="code-context">' + e(context) + '</span>' : '') +
      (copyKind ? '<button class="copy-button mini" data-copy-kind="' + e(copyKind) + '" aria-label="Copiar" title="Copiar">' + COPY_ICON + '</button>' : '') + '</span></div><pre>' + e(content) + '</pre></div>';
  }

  function passSummary(test) {
    var count = (test.assertions || []).length;
    if (count > 0) return 'A' + (count === 1 ? '' : 's') + ' ' + count + ' asserç' + (count === 1 ? 'ão foi satisfeita' : 'ões foram satisfeitas') + ' — resposta dentro do contrato esperado.';
    return 'Resposta dentro do contrato esperado — nenhuma asserção sinalizou divergência.';
  }
  function expandButton() {
    return '<button class="expand-btn" data-expand="1" aria-label="Ampliar" title="Ampliar">⤢</button>';
  }
  function analysisSections(test, main, expected, actual) {
    if (test.state !== "failed" && test.state !== "passed") return '';
    var passed = test.state === "passed";
    var error = test.error || {};
    var location = error.file ? error.file + (error.line ? ':' + error.line + ':' + (error.column || 0) : '') : '';
    var receivedPayload = main ? main.responseBody : { status: actual };
    var expectedBody = passed ? receivedPayload : expectedPayload(test, expected);

    var reasonTitle = passed ? 'Resultado' : 'Motivo da falha';
    var reasonHtml = passed
      ? '<p>' + e(test.diagnosis ? test.diagnosis.summary : 'A resposta atendeu ao status esperado e todas as asserções foram satisfeitas. Nenhuma ação necessária.') + '</p>'
      : diagnosisHtml(test);

    var banner = passed
      ? '<section class="failure-banner passed"><div class="failure-banner-label">Todas as asserções passaram</div><div class="failure-message">' + e(passSummary(test)) + '</div></section>'
      : '<section class="failure-banner"><div class="failure-banner-label">Assertion falhou</div><div class="failure-message">' + e(error.message || "Falha registrada sem mensagem.") + '</div>' +
        (location ? '<div class="failure-location">at ' + e(location) + '</div>' : '') + '</section>';

    var compTitle = passed ? 'Resposta validada' : 'Esperado vs. recebido';
    var matchNote = passed ? '<span class="match-note">Esperado e recebido são idênticos — contrato satisfeito.</span>' : '';
    var receivedClass = passed ? 'received passed' : 'received failed';
    var comparison = '<section class="comparison-section"><h3>' + compTitle + matchNote + '</h3><div class="comparison-grid">' +
      '<div class="comparison-card"><div class="comparison-head">Esperado <span class="status-token">' + e(expected) + '</span>' + expandButton() + '</div>' + highlightedJson(expectedBody, test, false) + '</div>' +
      '<div class="comparison-card ' + receivedClass + '"><div class="comparison-head">Recebido <span class="status-token">' + e(actual) + '</span>' + expandButton() + '</div>' + highlightedJson(receivedPayload, test, !passed) + '</div></div></section>';

    var gridClass = passed ? 'analysis-grid pass-layout' : 'analysis-grid';
    var reasonClass = passed ? 'section-card failure-reason result-strip' : 'section-card failure-reason';
    var assertionsBlock = passed ? successAssertions(test) : assertionsHtml(test);
    return '<div class="' + gridClass + '"><section class="' + reasonClass + '"><h3>' + reasonTitle + '</h3>' + reasonHtml + '</section>' +
      '<section class="section-card"><h3>Asserções</h3>' + assertionsBlock + '</section></div>' +
      banner + comparison;
  }

  function selectedPanel(test, selectedRequest, selectedContext) {
    var hasScript = Boolean(test.reproductionScript);
    var callView = !hasScript || state.view === "call";
    var flow = test.requests.map(function (request) { return request.method + ' ' + chainedUrl(request); }).join(' → ');
    var tabs = '<div class="debug-tabs"><button class="debug-tab ' + (callView ? 'active' : '') + '" data-detail-tab="call">Chamada selecionada</button>' +
      (hasScript ? '<button class="debug-tab ' + (!callView ? 'active' : '') + '" data-detail-tab="script">Script de reprodução</button>' : '') + '</div>';
    var hint = callView ? selectedContext : 'fluxo completo · ' + flow;
    var content;
    if (callView) {
      content = selectedRequest
        ? redirectTrailHtml(selectedRequest) + '<div class="selected-grid">' + codePanel("cURL", "", selectedRequest.curl, "curl", "") +
          codePanel("Response body", selectedRequest.receivedStatus == null ? "sem resposta" : selectedRequest.receivedStatus + " " + statusMeaning(selectedRequest.receivedStatus), json(selectedRequest.responseBody), "response", "response-panel") +
          codePanel("Request body", "payload enviado", json(selectedRequest.requestBody), "request", "full-span") + '</div>'
        : '<p class="empty-note">Selecione uma chamada.</p>';
    } else {
      content = '<p class="reproduction-help">Cole no terminal e execute de cima a baixo. A prévia encadeia as variáveis detectadas automaticamente e mantém os dados sensíveis mascarados.</p>' +
        '<div class="format-chips"><span class="format-chip active">bash + curl</span></div>' +
        '<div class="code-panel reproduction-code"><div class="code-head"><span class="code-title mono">reproduzir.sh</span><button class="copy-button mini" data-copy-kind="script" aria-label="Copiar script" title="Copiar script">' + COPY_ICON + '</button></div>' +
        '<pre>' + e(test.reproductionScript || "Nenhuma request disponível.") + '</pre></div>';
    }
    return '<section class="panel debug-panel"><div class="debug-toolbar">' + tabs + '<span class="debug-context">' + e(hint) + '</span></div>' +
      '<div class="panel-body">' + content + '</div></section>';
  }

  function renderDetail() {
    var item = selectedItem();
    if (!item) {
      detail.innerHTML = '<div class="empty"><div>Selecione um teste para começar o debug.</div></div>';
      return;
    }
    var test = item.test;
    var main = test.requests.find(function (request) { return request.id === test.mainRequestId; }) || test.requests[0];
    if (!state.requestId || !test.requests.some(function (request) { return request.id === state.requestId; })) state.requestId = main ? main.id : null;
    var selectedRequest = test.requests.find(function (request) { return request.id === state.requestId; });
    var statusExpectation = test.statusExpectation || {};
    var expected = statusExpectation.label || "Não especificado";
    var actual = statusExpectation.actual != null ? String(statusExpectation.actual) : (main && main.receivedStatus != null ? String(main.receivedStatus) : "Sem resposta");
    var endpoint = main ? '<span class="endpoint">' + e(report.project && report.project.name || "projeto") + ' / <span class="method">' + e(main.method) + '</span> ' + e(chainedUrl(main)) + '</span>' : '';
    var selectedContext = selectedRequest ? 'passo ' + selectedRequest.order + ' · ' + selectedRequest.method + ' ' + chainedUrl(selectedRequest) : '';
    var actualCardClass = test.state === "failed" ? 'danger' : (test.state === "passed" ? 'success' : '');

    detail.innerHTML = '<header class="detail-head"><div class="detail-title"><h2>' + e(test.title) + '</h2><div class="detail-meta">' + endpoint + '</div></div>' +
      '<div class="detail-state"><span class="badge ' + e(test.state) + '">' + e(statusLabel(test.state)) + '</span><span class="detail-duration">' + e(duration(test.durationMs)) + '</span></div></header>' +
      '<div class="metrics-grid"><div class="metric-card"><span>Status esperado</span><strong>' + e(expected) + '</strong><small>' + e(statusExpectation.type === "exact" ? statusMeaning(statusExpectation.expected) : "Faixa aceita pelo teste") + '</small></div>' +
      '<div class="metric-card ' + actualCardClass + '"><span>Status atual</span><strong>' + e(actual) + '</strong><small>' + e(statusMeaning(Number(actual))) + '</small></div>' +
      '<div class="metric-card"><span>Duração</span><strong>' + e(duration(test.durationMs)) + '</strong><small>Tempo total do teste</small></div>' +
      '<div class="metric-card"><span>Requisições</span><strong>' + e(test.requests.length) + '</strong><small>Executadas</small></div></div>' +
      analysisSections(test, main, expected, actual) +
      '<section class="panel"><div class="panel-head sequence-head"><div><h3>Sequência de chamadas</h3><span class="panel-hint">Os valores se encadeiam — a resposta de uma chamada alimenta a próxima.</span></div>' +
      '<div class="sequence-legend"><span><i class="legend-dot s2"></i>2xx</span><span><i class="legend-dot s3"></i>3xx</span><span><i class="legend-dot s45"></i>4xx / 5xx</span></div></div>' +
      '<div class="panel-body sequence-scroll"><div class="sequence">' + requestRows(test) + '</div></div></section>' +
      selectedPanel(test, selectedRequest, selectedContext);
    positionBarTimes();
  }

  function openModal(title, codeElement) {
    var backdrop = document.createElement("div");
    backdrop.className = "fl-modal-backdrop";
    var clone = codeElement.cloneNode(true);
    backdrop.innerHTML = '<div class="fl-modal"><div class="fl-modal-head"><span class="fl-modal-title">' + e(title) + '</span>' +
      '<div class="fl-modal-actions"><button class="copy-button mini fl-modal-copy" aria-label="Copiar" title="Copiar">' + COPY_ICON + '</button>' +
      '<button class="fl-modal-close" aria-label="Fechar">✕</button></div></div><div class="fl-modal-body"></div></div>';
    backdrop.querySelector(".fl-modal-body").appendChild(clone);
    document.body.appendChild(backdrop);
    function close() { backdrop.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(event) { if (event.key === "Escape") close(); }
    backdrop.addEventListener("click", function (event) { if (event.target === backdrop) close(); });
    backdrop.querySelector(".fl-modal-close").addEventListener("click", close);
    backdrop.querySelector(".fl-modal-copy").addEventListener("click", function () {
      var text = Array.prototype.map.call(clone.querySelectorAll(".json-line"), function (line) { return line.textContent; }).join("\n");
      copy(text, backdrop.querySelector(".fl-modal-copy"));
    });
    document.addEventListener("keydown", onKey);
  }

  document.getElementById("filter").addEventListener("input", function (event) {
    state.query = event.target.value;
    renderSidebar();
  });
  document.querySelector(".chips").addEventListener("click", function (event) {
    var button = event.target.closest("[data-mode]");
    if (!button) return;
    state.mode = button.dataset.mode;
    document.querySelectorAll("[data-mode]").forEach(function (node) { node.classList.toggle("active", node.dataset.mode === state.mode); });
    renderSidebar();
  });
  sidebar.addEventListener("click", function (event) {
    var specToggle = event.target.closest("[data-spec-toggle]");
    if (specToggle) {
      var path = specToggle.dataset.specToggle;
      state.collapsedSpecs[path] = !state.collapsedSpecs[path];
      renderSidebar();
      return;
    }
    var passedToggle = event.target.closest("[data-passed-toggle]");
    if (passedToggle) {
      var key = passedToggle.dataset.passedToggle;
      state.passedShown[key] = !state.passedShown[key];
      renderSidebar();
      return;
    }
    var button = event.target.closest("[data-test]");
    if (!button) return;
    state.selected = button.dataset.test;
    state.requestId = null;
    state.view = "call";
    renderSidebar();
  });
  detail.addEventListener("click", function (event) {
    var current = selectedItem();
    if (!current) return;
    var seqToggle = event.target.closest("[data-seq-toggle]");
    if (seqToggle) { state.seqShown[seqToggle.dataset.seqToggle] = !state.seqShown[seqToggle.dataset.seqToggle]; renderDetail(); return; }
    var assertToggle = event.target.closest("[data-assert-toggle]");
    if (assertToggle) { state.assertShown[assertToggle.dataset.assertToggle] = !state.assertShown[assertToggle.dataset.assertToggle]; renderDetail(); return; }
    var expand = event.target.closest(".expand-btn");
    if (expand) {
      var card = expand.closest(".comparison-card");
      var codeElement = card && card.querySelector(".json-lines");
      if (codeElement) openModal(card.querySelector(".comparison-head").textContent.trim(), codeElement);
      return;
    }
    var directCopy = event.target.closest("[data-copy-request]");
    if (directCopy) {
      event.stopPropagation();
      var directRequest = current.test.requests.find(function (request) { return request.id === directCopy.dataset.copyRequest; });
      if (directRequest) copy(directRequest.curl || "", directCopy);
      return;
    }
    var tabButton = event.target.closest("[data-detail-tab]");
    if (tabButton) {
      state.view = tabButton.dataset.detailTab;
      renderDetail();
      return;
    }
    var requestButton = event.target.closest("[data-request]");
    if (requestButton) {
      state.requestId = requestButton.dataset.request;
      state.view = "call";
      renderDetail();
      return;
    }
    var copyButton = event.target.closest("[data-copy-kind]");
    if (!copyButton) return;
    var selectedRequest = current.test.requests.find(function (request) { return request.id === state.requestId; });
    var kind = copyButton.dataset.copyKind;
    if (kind === "script") copy(current.test.reproductionScript || "", copyButton);
    else if (kind === "curl") copy(selectedRequest ? selectedRequest.curl : "", copyButton);
    else if (kind === "response") copy(selectedRequest ? json(selectedRequest.responseBody) : "", copyButton);
    else if (kind === "request") copy(selectedRequest ? json(selectedRequest.requestBody) : "", copyButton);
  });
  window.addEventListener("resize", positionBarTimes);
  function updateThemeLabel() {
    document.getElementById("theme-label").textContent = document.documentElement.dataset.theme === "dark" ? "Tema claro" : "Tema escuro";
  }
  document.getElementById("theme-toggle").addEventListener("click", function () {
    var next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("faillens-theme", next); } catch (_) {}
    updateThemeLabel();
    positionBarTimes();
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
  document.querySelectorAll("[data-mode]").forEach(function (node) { node.classList.toggle("active", node.dataset.mode === state.mode); });
  renderSidebar();
})();
`;
