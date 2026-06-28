export const styles = String.raw`
:root {
  color-scheme: dark;
  --page: #090c14;
  --shell: #121622;
  --sidebar: #0e131e;
  --surface: #121622;
  --surface-raised: #171c28;
  --surface-soft: #0a0e17;
  --line: #222a3a;
  --line-strong: #1a2130;
  --text: #eef1f6;
  --muted: #9aa6ba;
  --faint: #5d6781;
  --green: #4ade80;
  --green-soft: rgba(34, 197, 94, .13);
  --green-line: rgba(34, 197, 94, .28);
  --red: #fb7185;
  --red-soft: rgba(244, 63, 94, .13);
  --red-line: rgba(244, 63, 94, .30);
  --violet: #7c8cff;
  --violet-soft: rgba(124, 140, 255, .16);
  --blue: #3b4fb0;
  --blue-soft: rgba(59, 79, 176, .2);
  --verify: #6d5fce;
  --amber: #fbbf24;
  --code: #0a0e18;
  --shadow: 0 22px 80px rgba(0, 0, 0, .28);
}
[data-theme="light"] {
  color-scheme: light;
  --page: #f6f7f9;
  --shell: #fcfcfd;
  --sidebar: #f7f7f8;
  --surface: #ffffff;
  --surface-raised: #f1f1f4;
  --surface-soft: #fcfcfd;
  --line: #e2e8f0;
  --line-strong: #cbd5e1;
  --text: #18181b;
  --muted: #626b7a;
  --faint: #94a3b8;
  --green: #15803d;
  --green-soft: #f0fdf4;
  --green-line: #bbf7d0;
  --red: #b91c1c;
  --red-soft: #fef2f2;
  --red-line: #fee2e2;
  --violet: #5b5bd6;
  --violet-soft: #ddd6fe;
  --blue: #1d4ed8;
  --blue-soft: #eff6ff;
  --verify: #6d5fce;
  --amber: #b45309;
  --code: #18181b;
  --shadow: 0 20px 60px rgba(47, 62, 91, .12);
}
* { box-sizing: border-box; }
html { min-width: 320px; background: var(--page); }
body { margin: 0; min-height: 100vh; color: var(--text); background: var(--page); font: 14px/1.5 'Geist', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
button, input { font: inherit; }
button { color: inherit; }
.page { min-height: 100vh; padding: 28px; }
.report-shell { max-width: 1500px; min-height: calc(100vh - 56px); margin: 0 auto; overflow: hidden; border: 1px solid var(--line); border-radius: 18px; background: var(--shell); box-shadow: var(--shadow); }
.topbar { min-height: 94px; padding: 18px 24px; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 24px; border-bottom: 1px solid var(--line); }
.run-summary, .summary-item, .top-actions, .detail-meta, .detail-state, .chips, .spec-heading, .assertion-title, .request-top, .code-head { display: flex; align-items: center; }
.run-summary { justify-content: flex-start; gap: 4px; }
.summary-item { min-width: 175px; gap: 12px; padding: 0 22px; border-left: 1px solid var(--line); }
.summary-item:first-child { border-left: 0; }
.summary-item strong { display: block; color: var(--text); font-size: 15px; line-height: 1.25; white-space: nowrap; }
.summary-item strong small { color: var(--muted); font-size: 12px; font-weight: 500; }
.summary-item p { margin: 3px 0 0; color: var(--muted); font-size: 10px; white-space: nowrap; }
.summary-ring, .summary-icon { width: 39px; height: 39px; flex: 0 0 39px; border-radius: 50%; }
.summary-ring { position: relative; display: grid; place-items: center; background: conic-gradient(var(--green) var(--progress), var(--line) 0); }
.summary-ring::before { content: ""; position: absolute; inset: 4px; border-radius: inherit; background: var(--shell); }
.summary-ring span { position: relative; width: 5px; height: 5px; border-radius: 50%; background: var(--green); }
.summary-icon { display: grid; place-items: center; border: 2px solid var(--red-line); color: var(--red); font-size: 17px; font-weight: 800; box-shadow: inset 0 0 0 5px var(--red-soft); }
.clock-icon { position: relative; border-color: var(--violet); box-shadow: inset 0 0 0 5px var(--violet-soft); }
.clock-icon::before { content: ""; width: 10px; height: 10px; border: 1.5px solid var(--violet); border-radius: 50%; }
.clock-icon::after { content: ""; position: absolute; width: 1.5px; height: 6px; background: var(--violet); transform: translate(1px,-2px); transform-origin: bottom; }
.top-actions { justify-content: flex-end; gap: 8px; }
.button { min-height: 36px; padding: 8px 12px; border: 1px solid var(--line-strong); border-radius: 9px; background: var(--surface); color: var(--text); cursor: pointer; transition: border-color .15s ease, transform .15s ease, background .15s ease; }
.button:hover { border-color: var(--violet); transform: translateY(-1px); }
.button.subtle { color: var(--muted); }
.button.export-button { border-color: #e7eaf0; background: #f5f6f9; color: #171b25; font-weight: 650; }
.button.export-button span { margin-right: 5px; font-size: 17px; }
.theme-symbol { display: inline-block; margin-right: 6px; color: var(--violet); }
.workspace { display: grid; grid-template-columns: 390px minmax(0, 1fr); min-height: calc(100vh - 151px); }
.sidebar { padding: 22px 18px 32px; border-right: 1px solid var(--line); background: var(--sidebar); }
.search-wrap { height: 44px; display: flex; align-items: center; gap: 9px; padding: 0 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface-soft); }
.search-wrap:focus-within { border-color: var(--violet); box-shadow: 0 0 0 3px var(--violet-soft); }
.search-wrap > span { color: var(--muted); font-size: 19px; transform: rotate(-20deg); }
.search { width: 100%; border: 0; outline: 0; background: transparent; color: var(--text); }
.search::placeholder { color: var(--faint); }
.chips { gap: 8px; margin: 13px 0 24px; }
.chip { padding: 6px 11px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface-soft); color: var(--muted); font-size: 12px; cursor: pointer; }
.chip:hover { border-color: var(--line-strong); color: var(--text); }
.chip.active[data-mode="failed"] { border-color: var(--red-line); background: var(--red-soft); color: var(--red); }
.chip.active[data-mode="all"] { border-color: var(--violet); background: var(--violet-soft); color: var(--text); }
.spec-group { margin-bottom: 24px; }
.spec-heading { justify-content: space-between; gap: 10px; margin: 0 6px 8px; color: var(--muted); }
.spec-name { overflow: hidden; font: 650 12px 'Geist Mono', ui-monospace, SFMono-Regular, Consolas, monospace; text-overflow: ellipsis; white-space: nowrap; }
.spec-badge { flex: 0 0 auto; padding: 2px 7px; border-radius: 999px; color: var(--green); background: var(--green-soft); font-size: 10px; font-weight: 700; }
.spec-badge.failed { color: var(--red); background: var(--red-soft); }
.test-item { width: 100%; min-height: 47px; position: relative; display: grid; grid-template-columns: 10px minmax(0,1fr) auto; align-items: center; gap: 8px; margin: 2px 0; padding: 10px 11px; overflow: hidden; border: 1px solid transparent; border-radius: 10px; background: transparent; color: var(--text); text-align: left; cursor: pointer; }
.test-item:hover { background: var(--surface); }
.test-item.active { border-color: var(--red-line); background: linear-gradient(90deg, var(--red-soft), transparent 72%); }
.test-item.active::before { content: ""; position: absolute; left: 0; top: 8px; bottom: 8px; width: 3px; border-radius: 0 3px 3px 0; background: var(--red); }
.test-item.active.passed { border-color: var(--green-line); background: linear-gradient(90deg, var(--green-soft), transparent 72%); }
.test-item.active.passed::before { background: var(--green); }
.status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--faint); }
.status-dot.failed { background: var(--red); box-shadow: 0 0 0 3px var(--red-soft); }
.status-dot.passed { background: var(--green); }
.status-dot.skipped { background: var(--amber); }
.test-title { overflow: hidden; font-size: 12px; line-height: 1.35; text-overflow: ellipsis; }
.test-duration { color: var(--muted); font: 10px 'Geist Mono', ui-monospace, SFMono-Regular, Consolas, monospace; }
.main { min-width: 0; padding: 26px 36px 54px; background: var(--shell); }
.empty { min-height: 50vh; display: grid; place-items: center; color: var(--muted); text-align: center; }
.detail-head { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 18px; }
.detail-title { min-width: 0; }
.detail-title h2 { margin: 0; font-size: clamp(21px, 2.1vw, 29px); line-height: 1.2; letter-spacing: -.025em; }
.detail-meta { gap: 9px; margin-top: 9px; color: var(--muted); font-size: 11px; flex-wrap: wrap; }
.detail-state { flex: 0 0 auto; align-self: flex-start; gap: 10px; }
.badge { padding: 4px 9px; border-radius: 6px; font-size: 10px; font-weight: 750; text-transform: uppercase; letter-spacing: .04em; }
.badge.failed { color: var(--red); background: var(--red-soft); border: 1px solid var(--red-line); }
.badge.passed { color: var(--green); background: var(--green-soft); border: 1px solid var(--green-line); }
.badge.skipped { color: var(--amber); background: rgba(239,173,79,.1); border: 1px solid rgba(239,173,79,.28); }
.detail-duration { padding: 4px 8px; color: var(--muted); border-radius: 6px; background: var(--surface); font: 10px 'Geist Mono', ui-monospace, SFMono-Regular, Consolas, monospace; }
.endpoint { font-family: 'Geist Mono', ui-monospace, SFMono-Regular, Consolas, monospace; }
.endpoint .method { color: var(--text); font-weight: 700; }
.metrics-grid { display: grid; grid-template-columns: repeat(4, minmax(128px, 1fr)); gap: 14px; margin-bottom: 16px; }
.metric-card { min-height: 126px; padding: 18px 20px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); }
.metric-card.danger { border-color: var(--red-line); background: var(--red-soft); }
.metric-card > span { display: block; color: var(--muted); font-size: 10px; }
.metric-card strong { display: block; margin: 11px 0 3px; color: var(--text); font: 700 clamp(25px,2.4vw,32px) 'Geist Mono', ui-monospace, SFMono-Regular, Consolas, monospace; }
.metric-card.danger strong { color: var(--red); }
.metric-card.success { border-color: var(--green-line); background: var(--green-soft); }
.metric-card.success strong { color: var(--green); }
.metric-card small { color: var(--muted); font-size: 10px; }
.analysis-grid { display: grid; grid-template-columns: minmax(0,1.25fr) minmax(290px,.85fr); align-items: start; gap: 14px; margin-bottom: 16px; }
.section-card, .panel { border: 1px solid var(--line); border-radius: 14px; background: var(--surface); }
.section-card { padding: 19px 20px; }
.section-card h3, .panel-title { margin: 0 0 13px; font-size: 13px; }
.failure-reason p { margin: 0; color: #aab2c2; font-size: 13px; line-height: 1.75; }
[data-theme="light"] .failure-reason p { color: var(--muted); }
.diagnosis-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 16px; }
.meta-tag { padding: 3px 7px; border-radius: 5px; color: var(--muted); background: var(--surface-raised); font: 9px 'Geist Mono', ui-monospace, SFMono-Regular, Consolas, monospace; text-transform: uppercase; }
.suggested-action { margin-top: 15px !important; padding-top: 13px; border-top: 1px solid var(--line); }
.assertion-list { display: flex; flex-direction: column; gap: 8px; }
.assertion-item { min-height: 48px; display: grid; grid-template-columns: 24px minmax(0,1fr) auto auto; gap: 10px; align-items: center; padding: 9px 12px; border: 1px solid var(--line-strong); border-radius: 9px; background: transparent; font-family: 'Geist', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.assertion-item.failed { border-color: var(--red-line); background: var(--red-soft); }
.assertion-icon { width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; color: var(--faint); font: 700 14px/1 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI Symbol", sans-serif; }
.assertion-item.failed .assertion-icon { color: var(--red); }
.assertion-copy { min-width: 0; display: flex; flex-direction: column; color: var(--muted); font-size: 12px; line-height: 1.4; }
.assertion-copy small { margin-top: 2px; color: var(--faint); font: 9px 'Geist Mono', ui-monospace, SFMono-Regular, Consolas, monospace; }
.assertion-item.failed .assertion-copy { color: var(--text); }
.assertion-status { align-self: center; color: var(--muted); font-size: 10px; line-height: 1; }
.assertion-item.failed .assertion-status { color: var(--red); }
.assertion-item.passed .assertion-icon, .assertion-item.passed .assertion-status { color: var(--green); }
.assertion-note { color: var(--muted); }
.assertion-target { padding: 2px 6px; border: 1px solid var(--line); border-radius: 5px; color: var(--muted); font: 600 9px 'Geist Mono', ui-monospace, SFMono-Regular, Consolas, monospace; text-transform: uppercase; }
.assertion-target.empty { visibility: hidden; }
.failure-banner { margin-bottom: 16px; padding: 17px 20px; border: 1px solid var(--red-line); border-radius: 12px; background: var(--red-soft); }
.failure-banner-label { margin-bottom: 7px; color: var(--red); font: 700 10px 'Geist Mono', ui-monospace, SFMono-Regular, Consolas, monospace; letter-spacing: .12em; text-transform: uppercase; }
.failure-message { color: var(--text); font: 12px/1.55 'Geist Mono', ui-monospace, SFMono-Regular, Consolas, monospace; overflow-wrap: anywhere; }
.failure-location { margin-top: 7px; color: var(--muted); font: 10px 'Geist Mono', ui-monospace, SFMono-Regular, Consolas, monospace; }
.failure-banner.passed { border-color: var(--green-line); background: var(--green-soft); }
.failure-banner.passed .failure-banner-label { color: var(--green); }
.panel { margin-bottom: 16px; overflow: hidden; }
.panel-head { display: flex; justify-content: space-between; align-items: center; gap: 14px; padding: 15px 18px; border-bottom: 1px solid var(--line); }
.panel-head h3 { margin: 0; font-size: 13px; }
.panel-hint { color: var(--muted); font-size: 10px; }
.panel-body { padding: 18px; }
.comparison-section { margin-bottom: 16px; padding: 0 2px; }
.comparison-section > h3 { margin: 0 0 10px; font-size: 11px; }
.comparison-section > h3 .match-note { margin-left: 8px; color: var(--green); font-size: 11px; font-weight: 500; }
.comparison-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.comparison-card { min-width: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 11px; background: var(--surface-soft); }
.comparison-head { display: flex; align-items: center; gap: 8px; padding: 10px 13px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 9px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.comparison-card.received.failed { border-color: var(--red-line); }
.comparison-card.received.failed .comparison-head { color: var(--red); background: var(--red-soft); }
.comparison-card.received.passed { border-color: var(--green-line); }
.comparison-card.received.passed .comparison-head { color: var(--green); background: var(--green-soft); }
.status-token { padding: 2px 6px; border-radius: 5px; color: var(--green); background: var(--green-soft); font: 700 12px 'Geist Mono', ui-monospace, SFMono-Regular, Consolas, monospace; letter-spacing: 0; }
.received.failed .status-token { color: var(--red); background: rgba(255,92,114,.14); }
.json-lines { min-height: 118px; display: block; padding: 14px; overflow: auto; background: var(--code); color: #cbd5e1; font: 11px/1.7 'Geist Mono', ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre; }
.json-line { display: block; min-height: 1.7em; padding: 0 5px; }
.json-line.diff-line { margin: 0 -1px; border-radius: 3px; background: var(--red-soft); color: var(--red); box-shadow: inset 3px 0 0 var(--red); }
.json-line.diff-line:not(.diff-block-start):not(.diff-block-end) { border-radius: 0; }
.json-line.diff-block-start:not(.diff-block-end) { border-radius: 3px 3px 0 0; }
.json-line.diff-block-end:not(.diff-block-start) { border-radius: 0 0 3px 3px; }
.sequence-head { align-items: flex-start; }
.sequence-legend { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 16px; color: var(--muted); font-size: 10px; }
.sequence-legend span { display: inline-flex; align-items: center; gap: 6px; }
.legend-dot { width: 8px; height: 8px; border-radius: 2px; background: var(--faint); }
.legend-dot.preparacao { background: var(--blue); }
.legend-dot.validacao { background: var(--violet); }
.legend-dot.verificacao { background: var(--verify); }
.sequence-scroll { overflow-x: auto; scrollbar-color: var(--line-strong) transparent; }
.sequence { min-width: 720px; display: flex; flex-direction: column; gap: 4px; }
.request-row { width: 100%; min-height: 44px; display: grid; grid-template-columns: 28px 58px minmax(155px,1fr) minmax(180px,1.35fr) 72px 58px 82px; align-items: center; gap: 9px; padding: 7px 10px; border: 1px solid transparent; border-radius: 9px; background: transparent; color: var(--text); text-align: left; cursor: pointer; }
.request-row:hover { background: var(--surface-raised); }
.request-row.active { border-color: var(--violet); background: rgba(124,124,245,.035); }
.request-order { color: var(--muted); font: 11px 'Geist Mono', ui-monospace, SFMono-Regular, Consolas, monospace; text-align: center; }
.request-row.active .request-order { color: var(--violet); font-weight: 700; }
.request-method { justify-self: start; padding: 2px 7px; border-radius: 4px; color: #93b4ff; background: rgba(59,130,246,.16); font: 750 10px 'Geist Mono', ui-monospace, SFMono-Regular, Consolas, monospace; }
.request-method.get { color: #5fd39a; background: var(--green-soft); }
.request-method.delete { color: var(--red); background: var(--red-soft); }
.request-method.put, .request-method.patch { color: #fcd34d; background: rgba(245,158,11,.15); }
.request-target { min-width: 0; display: flex; align-items: center; gap: 7px; overflow: hidden; }
.request-url { min-width: 0; overflow: hidden; color: #93b4ff; font: 11px 'Geist Mono', ui-monospace, SFMono-Regular, Consolas, monospace; text-overflow: ellipsis; white-space: nowrap; }
.redirect-badge { flex: 0 0 auto; padding: 2px 6px; border: 1px solid rgba(124,140,255,.3); border-radius: 999px; background: var(--violet-soft); color: var(--violet); font-size: 8px; font-weight: 700; white-space: nowrap; }
.request-row.active .request-url { color: var(--text); font-weight: 700; }
.request-bar-track { height: 13px; position: relative; overflow: hidden; border-radius: 3px; background: #0a0d14; }
[data-theme="light"] .request-bar-track { background: #ececef; }
.request-bar { height: 100%; position: absolute; top: 0; display: block; border-radius: 3px; background: var(--faint); }
.request-bar.preparacao { background: var(--blue); }
.request-bar.validacao { background: var(--violet); }
.request-bar.bad { background: var(--red); }
.request-bar.verificacao { background: var(--verify); }
.request-bar.limpeza { background: var(--amber); }
.request-status { color: var(--green); font: 700 10px 'Geist Mono', ui-monospace, SFMono-Regular, Consolas, monospace; text-align: right; }
.request-status.bad { color: var(--red); }
.request-time { color: var(--muted); font: 10px 'Geist Mono', ui-monospace, SFMono-Regular, Consolas, monospace; text-align: right; }
.request-row.bad .request-time { color: var(--red); font-weight: 700; }
.request-curl { justify-self: end; padding: 5px 8px; border: 1px solid var(--line); border-radius: 6px; background: transparent; color: var(--muted); font: 650 9px 'Geist Mono', ui-monospace, SFMono-Regular, Consolas, monospace; cursor: pointer; }
.request-row.active .request-curl { border-color: var(--violet); background: var(--violet); color: #fff; }
.selected-grid { display: grid; grid-template-columns: minmax(0,1.15fr) minmax(300px,.85fr); gap: 14px; }
.redirect-trail { margin-bottom: 14px; overflow: hidden; border: 1px solid var(--line); border-radius: 10px; background: var(--surface-soft); }
.redirect-trail-title { display: flex; justify-content: space-between; gap: 12px; padding: 9px 12px; border-bottom: 1px solid var(--line); color: var(--text); font-size: 10px; font-weight: 650; }
.redirect-trail-title span { color: var(--violet); font-weight: 600; }
.redirect-hop { display: grid; grid-template-columns: 22px 42px minmax(0,1fr); align-items: center; gap: 8px; padding: 8px 12px; border-top: 1px solid var(--line-strong); }
.redirect-hop:first-of-type { border-top: 0; }
.redirect-hop > span { color: var(--faint); font: 9px 'Geist Mono', ui-monospace, SFMono-Regular, Consolas, monospace; }
.redirect-hop strong { color: var(--amber); font: 700 10px 'Geist Mono', ui-monospace, SFMono-Regular, Consolas, monospace; }
.redirect-hop code { min-width: 0; overflow: hidden; color: var(--muted); font: 10px 'Geist Mono', ui-monospace, SFMono-Regular, Consolas, monospace; text-overflow: ellipsis; white-space: nowrap; }
.code-panel { min-width: 0; position: relative; overflow: hidden; border: 1px solid var(--line); border-radius: 10px; background: var(--surface-soft); }
.code-panel.full-span { grid-column: 1 / -1; }
.code-head { justify-content: space-between; min-height: 42px; padding: 9px 12px; border-bottom: 1px solid var(--line); }
.code-title { color: var(--text); font-size: 10px; font-weight: 650; }
.code-title.mono { font-family: 'Geist Mono', ui-monospace, SFMono-Regular, Consolas, monospace; }
.code-head-actions { display: flex; align-items: center; gap: 10px; }
.code-context { color: var(--muted); font: 9px 'Geist Mono', ui-monospace, SFMono-Regular, Consolas, monospace; }
.response-panel .code-context { color: var(--red); font-weight: 650; }
.copy-button { padding: 7px 11px; border: 1px solid var(--line); border-radius: 7px; background: transparent; color: var(--muted); font-size: 10px; font-weight: 600; cursor: pointer; transition: color .16s ease, border-color .16s ease, background .16s ease, transform .16s ease; }
.copy-button:hover { border-color: var(--violet); color: var(--text); transform: translateY(-1px); }
.copy-button.mini { padding: 3px 5px; border-color: transparent; font-weight: 400; }
.copy-button.primary { margin-left: auto; padding: 8px 14px; border-color: #eef1f6; background: #eef1f6; color: #0b0e16; font-size: 11px; }
.copy-button.copied, .request-curl.copied { border-color: rgba(74,222,128,.45) !important; background: rgba(74,222,128,.14) !important; color: var(--green) !important; transform: scale(.97); }
.copy-check { display: inline-block; animation: copy-pop .28s ease; }
.copy-chevron { margin-right: 3px; }
@keyframes copy-pop { 0% { transform: scale(.4); opacity: 0; } 70% { transform: scale(1.25); } 100% { transform: scale(1); opacity: 1; } }
pre { margin: 0; padding: 15px; overflow: auto; background: var(--code); color: #dce6f7; font: 11px/1.6 'Geist Mono', ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
.code-panel pre { min-height: 155px; max-height: 340px; }
.debug-toolbar { min-height: 62px; display: flex; align-items: center; gap: 18px; padding: 12px 18px; border-bottom: 1px solid var(--line); }
.debug-tabs { display: flex; gap: 4px; padding: 3px; border-radius: 9px; background: var(--surface-soft); }
.debug-tab { padding: 7px 12px; border: 0; border-radius: 7px; background: transparent; color: var(--faint); font-size: 11px; cursor: pointer; }
.debug-tab.active { background: var(--surface); color: var(--text); font-weight: 700; box-shadow: 0 1px 4px rgba(0,0,0,.2); }
.debug-context { min-width: 0; overflow: hidden; color: var(--faint); font: 11px 'Geist Mono', ui-monospace, SFMono-Regular, Consolas, monospace; text-overflow: ellipsis; white-space: nowrap; }
.reproduction-help { margin: 0 0 10px; color: var(--muted); font-size: 11px; }
.format-chips { display: flex; gap: 6px; margin-bottom: 12px; }
.format-chip { padding: 5px 11px; border: 1px solid var(--line); border-radius: 7px; color: var(--faint); background: var(--surface-soft); font: 600 10px 'Geist Mono', ui-monospace, SFMono-Regular, Consolas, monospace; }
.format-chip.active { border-color: #2a3650; background: #1a2233; color: #cdd4e0; }
.reproduction-code pre { min-height: 250px; max-height: 500px; line-height: 1.8; }
.empty-note { color: var(--muted); font-size: 11px; }
.toast { position: fixed; right: 24px; bottom: 24px; z-index: 50; display: flex; align-items: center; gap: 8px; padding: 10px 14px; border: 1px solid rgba(74,222,128,.28); border-radius: 9px; background: #111a19; color: #d8f8e5; box-shadow: 0 12px 35px rgba(0,0,0,.35); opacity: 0; transform: translateY(12px) scale(.98); pointer-events: none; transition: opacity .18s ease, transform .24s cubic-bezier(.2,.8,.2,1); }
.toast.show { opacity: 1; transform: translateY(0) scale(1); }
.toast-check { width: 19px; height: 19px; display: grid; place-items: center; border-radius: 50%; background: rgba(74,222,128,.15); color: var(--green); font-weight: 800; animation: copy-pop .28s ease; }
@media (max-width: 1260px) {
  .page { padding: 16px; }
  .report-shell { min-height: calc(100vh - 32px); }
  .topbar { grid-template-columns: minmax(220px,1fr) auto; }
  .run-summary { justify-content: flex-end; }
  .top-actions { grid-column: 1 / -1; justify-content: flex-end; padding-top: 12px; border-top: 1px solid var(--line); }
  .workspace { grid-template-columns: 340px minmax(0,1fr); }
  .main { padding: 24px; }
  .summary-item { min-width: 155px; padding: 0 15px; }
}
@media (max-width: 960px) {
  .topbar { grid-template-columns: 1fr; gap: 15px; }
  .run-summary { justify-content: flex-start; overflow-x: auto; }
  .top-actions { grid-column: auto; justify-content: flex-start; }
  .workspace { grid-template-columns: 300px minmax(0,1fr); }
  .metrics-grid { grid-template-columns: 1fr 1fr; }
  .analysis-grid, .selected-grid { grid-template-columns: 1fr; }
  .sequence-head { display: block; }
  .sequence-legend { justify-content: flex-start; margin-top: 10px; }
  .debug-toolbar { flex-wrap: wrap; gap: 10px; }
  .debug-context { order: 3; width: 100%; }
}
@media (max-width: 720px) {
  .page { padding: 0; }
  .report-shell { min-height: 100vh; border: 0; border-radius: 0; }
  .topbar { padding: 16px; }
  .summary-item { min-width: 145px; padding: 0 12px; }
  .summary-item:first-child { padding-left: 0; }
  .workspace { display: block; }
  .sidebar { border-right: 0; border-bottom: 1px solid var(--line); }
  .main { padding: 20px 15px 42px; }
  .detail-head { display: block; }
  .detail-state { margin-top: 12px; }
  .comparison-grid { grid-template-columns: 1fr; }
  .sequence-scroll { margin: 0 -4px; padding-left: 14px; padding-right: 14px; }
  .debug-toolbar { align-items: stretch; }
  .debug-tabs { width: 100%; }
  .debug-tab { flex: 1; }
  .copy-button.primary { width: 100%; margin-left: 0; }
}
@media (max-width: 440px) {
  .metrics-grid { grid-template-columns: 1fr; }
  .metric-card { min-height: 105px; }
  .run-summary { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 0; overflow: visible; }
  .summary-item { min-width: 0; display: block; padding: 0 8px; }
  .summary-item strong { font-size: 13px; }
  .summary-item p { white-space: normal; line-height: 1.25; }
  .summary-ring, .summary-icon { margin-bottom: 8px; }
  .button { font-size: 11px; }
}

/* === Sequência: tubo por status, tempo no tubo, métodos, redirects === */
.request-row { grid-template-columns: 28px 58px minmax(150px,1fr) minmax(200px,1.5fr) 64px 76px; }
.request-method.options { color: #c4b5fd; background: rgba(139,92,246,.16); }
.request-method.head { color: #f3a6c4; background: rgba(236,72,153,.14); }
.request-bar-track { height: 18px; }
.request-bar.s2 { background: var(--green); }
.request-bar.s3 { background: var(--amber); }
.request-bar.s45 { background: var(--red); }
.request-bar.snone { background: var(--faint); }
.request-bar.bad { background: var(--red); }
.request-time { position: absolute; right: auto; top: 50%; transform: translateY(-50%); color: var(--muted); border-radius: 4px; white-space: nowrap; pointer-events: none; }
.request-time.inside { color: #eef2f8; background: rgba(8,11,18,.5); padding: 1px 5px; }
.legend-dot.s2 { background: var(--green); }
.legend-dot.s3 { background: var(--amber); }
.legend-dot.s45 { background: var(--red); }
.request-curl { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 26px; padding: 5px; }
.copy-button.mini { display: inline-flex; align-items: center; justify-content: center; }
.seq-hop { display: flex; align-items: center; gap: 8px; padding: 2px 10px 2px 94px; font: 11px 'Geist Mono', ui-monospace, SFMono-Regular, Consolas, monospace; color: var(--muted); }
.seq-hop.is-hidden { display: none; }
.seq-hop-arrow { color: var(--faint); }
.seq-hop-code { color: var(--amber); font-weight: 700; }
.seq-hop-loc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.request-row.is-hidden { display: none; }

/* === Botão "mostrar mais" compartilhado === */
.more-btn { margin-top: 12px; display: inline-flex; align-items: center; gap: 7px; padding: 8px 13px; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--surface-soft); color: var(--muted); font: 600 11px 'Geist', ui-sans-serif, system-ui, sans-serif; cursor: pointer; transition: border-color .15s ease, color .15s ease; }
.more-btn:hover { border-color: var(--violet); color: var(--text); }
.more-chev { display: inline-block; transition: transform .2s ease; }

/* === Menu lateral: trilho, contadores, colapso === */
.spec-group { margin: 0 0 18px; padding: 0 0 2px 12px; border-left: 2px solid var(--line); }
.spec-group:last-child { margin-bottom: 4px; }
.spec-heading { width: 100%; justify-content: flex-start; gap: 0; margin: 0 0 6px; padding: 5px 8px 6px; border: 0; border-radius: 7px; background: transparent; color: var(--muted); cursor: pointer; user-select: none; transition: background .12s ease; }
.spec-heading:hover { background: var(--surface); }
.spec-chev { display: inline-block; margin-right: 7px; color: var(--muted); font-size: 11px; transition: transform .2s ease, color .12s ease; }
.spec-group.collapsed .spec-chev { transform: rotate(-90deg); }
.spec-heading:hover .spec-name, .spec-heading:hover .spec-chev { color: var(--text); }
.spec-counts { margin-left: auto; display: inline-flex; align-items: center; gap: 9px; font: 600 10px 'Geist Mono', ui-monospace, SFMono-Regular, Consolas, monospace; }
.spec-counts .cnt-f { color: var(--red); }
.spec-counts .cnt-p { color: var(--green); }
.spec-counts .cnt-p.zero { color: var(--muted); }
.spec-group.collapsed > .test-item, .spec-group.collapsed > .passed-toggle { display: none; }
.test-item.is-hidden { display: none; }
.passed-toggle { width: 100%; display: flex; align-items: center; gap: 7px; margin: 2px 0; padding: 8px 11px; border: 0; border-radius: 8px; background: transparent; color: var(--muted); font: 600 11px 'Geist', ui-sans-serif, system-ui, sans-serif; cursor: pointer; text-align: left; }
.passed-toggle:hover { background: var(--surface); color: var(--text); }

/* === Tela de sucesso: largura total + 2 colunas + resumo === */
.analysis-grid.pass-layout { grid-template-columns: 1fr; }
.section-card.result-strip { padding: 14px 18px; }
.assert-summary { display: flex; align-items: center; gap: 9px; margin-bottom: 13px; padding: 9px 13px; border: 1px solid var(--green-line); border-radius: 9px; background: var(--green-soft); color: var(--green); font: 650 12px 'Geist', ui-sans-serif, system-ui, sans-serif; }
.assert-summary .assert-count { margin-left: auto; font: 700 11px 'Geist Mono', ui-monospace, SFMono-Regular, Consolas, monospace; }
.assertion-list.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; align-content: start; }
.assertion-item.is-hidden { display: none; }

/* === Comparação: botão ampliar + modal === */
.comparison-head .expand-btn { margin-left: auto; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 22px; padding: 0; border: 1px solid var(--line); border-radius: 6px; background: transparent; color: var(--muted); font-size: 14px; line-height: 1; cursor: pointer; transition: border-color .15s ease, color .15s ease; }
.comparison-head .expand-btn:hover { border-color: var(--violet); color: var(--text); }
.comparison-card .json-lines { max-height: 340px; }
.fl-modal-backdrop { position: fixed; inset: 0; z-index: 200; display: flex; align-items: center; justify-content: center; padding: 32px; background: rgba(4,6,12,.68); }
.fl-modal { display: flex; flex-direction: column; width: min(1100px, 92vw); max-height: 86vh; border: 1px solid var(--line); border-radius: 14px; background: var(--shell); box-shadow: var(--shadow); overflow: hidden; }
.fl-modal-head { display: flex; align-items: center; gap: 10px; padding: 13px 18px; border-bottom: 1px solid var(--line); }
.fl-modal-title { font: 650 13px 'Geist', ui-sans-serif, system-ui, sans-serif; color: var(--text); }
.fl-modal-actions { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.fl-modal-close { width: 30px; height: 30px; display: grid; place-items: center; border: 1px solid var(--line); border-radius: 7px; background: transparent; color: var(--muted); font-size: 14px; cursor: pointer; }
.fl-modal-close:hover { border-color: var(--violet); color: var(--text); }
.fl-modal-body { overflow: auto; }
.fl-modal-body .json-lines { max-height: none; min-height: 0; border-radius: 0; font-size: 12.5px; line-height: 1.85; }
@media (max-width: 760px) { .assertion-list.two-col { grid-template-columns: 1fr; } }
`;
