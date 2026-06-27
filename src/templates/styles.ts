export const styles = String.raw`
:root {
  color-scheme: dark;
  --page: #080c14;
  --shell: #0b101a;
  --sidebar: #0a0f18;
  --surface: #0d131f;
  --surface-raised: #111827;
  --surface-soft: #0a101a;
  --line: #202938;
  --line-strong: #2b3547;
  --text: #f3f5fa;
  --muted: #7f899d;
  --faint: #505b70;
  --green: #35d17e;
  --green-soft: rgba(53, 209, 126, .11);
  --red: #ff5c72;
  --red-soft: rgba(255, 92, 114, .11);
  --red-line: rgba(255, 92, 114, .38);
  --violet: #7567f8;
  --violet-soft: rgba(117, 103, 248, .14);
  --amber: #efad4f;
  --code: #070b12;
  --shadow: 0 22px 80px rgba(0, 0, 0, .28);
}
[data-theme="light"] {
  color-scheme: light;
  --page: #eef2f8;
  --shell: #ffffff;
  --sidebar: #f8faff;
  --surface: #ffffff;
  --surface-raised: #f6f8fc;
  --surface-soft: #f8faff;
  --line: #dce3ee;
  --line-strong: #cbd5e3;
  --text: #182033;
  --muted: #667086;
  --faint: #99a3b5;
  --green: #128852;
  --green-soft: rgba(18, 136, 82, .09);
  --red: #d93e58;
  --red-soft: rgba(217, 62, 88, .08);
  --red-line: rgba(217, 62, 88, .3);
  --violet: #6354df;
  --violet-soft: rgba(99, 84, 223, .1);
  --amber: #9b6500;
  --code: #111827;
  --shadow: 0 20px 60px rgba(47, 62, 91, .12);
}
* { box-sizing: border-box; }
html { min-width: 320px; background: var(--page); }
body { margin: 0; min-height: 100vh; color: var(--text); background: var(--page); font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
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
.spec-name { overflow: hidden; font: 650 12px ui-monospace, SFMono-Regular, Consolas, monospace; text-overflow: ellipsis; white-space: nowrap; }
.spec-badge { flex: 0 0 auto; padding: 2px 7px; border-radius: 999px; color: var(--green); background: var(--green-soft); font-size: 10px; font-weight: 700; }
.spec-badge.failed { color: var(--red); background: var(--red-soft); }
.test-item { width: 100%; min-height: 47px; position: relative; display: grid; grid-template-columns: 10px minmax(0,1fr) auto; align-items: center; gap: 8px; margin: 2px 0; padding: 10px 11px; overflow: hidden; border: 1px solid transparent; border-radius: 10px; background: transparent; color: var(--text); text-align: left; cursor: pointer; }
.test-item:hover { background: var(--surface); }
.test-item.active { border-color: var(--red-line); background: linear-gradient(90deg, var(--red-soft), transparent 72%); }
.test-item.active::before { content: ""; position: absolute; left: 0; top: 8px; bottom: 8px; width: 3px; border-radius: 0 3px 3px 0; background: var(--red); }
.test-item.active.passed { border-color: rgba(53,209,126,.28); background: linear-gradient(90deg, var(--green-soft), transparent 72%); }
.test-item.active.passed::before { background: var(--green); }
.status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--faint); }
.status-dot.failed { background: var(--red); box-shadow: 0 0 0 3px var(--red-soft); }
.status-dot.passed { background: var(--green); }
.status-dot.skipped { background: var(--amber); }
.test-title { overflow: hidden; font-size: 12px; line-height: 1.35; text-overflow: ellipsis; }
.test-duration { color: var(--muted); font: 10px ui-monospace, SFMono-Regular, Consolas, monospace; }
.main { min-width: 0; padding: 26px 36px 54px; background: var(--shell); }
.empty { min-height: 50vh; display: grid; place-items: center; color: var(--muted); text-align: center; }
.detail-head { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 18px; }
.detail-title { min-width: 0; }
.detail-title h2 { margin: 0; font-size: clamp(21px, 2.1vw, 29px); line-height: 1.2; letter-spacing: -.025em; }
.detail-meta { gap: 9px; margin-top: 9px; color: var(--muted); font-size: 11px; flex-wrap: wrap; }
.detail-state { flex: 0 0 auto; align-self: flex-start; gap: 10px; }
.badge { padding: 4px 9px; border-radius: 6px; font-size: 10px; font-weight: 750; text-transform: uppercase; letter-spacing: .04em; }
.badge.failed { color: var(--red); background: var(--red-soft); border: 1px solid var(--red-line); }
.badge.passed { color: var(--green); background: var(--green-soft); border: 1px solid rgba(53,209,126,.28); }
.badge.skipped { color: var(--amber); background: rgba(239,173,79,.1); border: 1px solid rgba(239,173,79,.28); }
.detail-duration { padding: 4px 8px; color: var(--muted); border-radius: 6px; background: var(--surface); font: 10px ui-monospace, SFMono-Regular, Consolas, monospace; }
.endpoint { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
.endpoint .method { color: var(--text); font-weight: 700; }
.metrics-grid { display: grid; grid-template-columns: repeat(4, minmax(128px, 1fr)); gap: 14px; margin-bottom: 16px; }
.metric-card { min-height: 126px; padding: 18px 20px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); }
.metric-card.danger { border-color: var(--red-line); background: var(--red-soft); }
.metric-card > span { display: block; color: var(--muted); font-size: 10px; }
.metric-card strong { display: block; margin: 11px 0 3px; color: var(--text); font: 700 clamp(25px,2.4vw,32px) ui-monospace, SFMono-Regular, Consolas, monospace; }
.metric-card.danger strong { color: var(--red); }
.metric-card small { color: var(--muted); font-size: 10px; }
.analysis-grid { display: grid; grid-template-columns: minmax(0,1.25fr) minmax(290px,.85fr); gap: 14px; margin-bottom: 16px; }
.section-card, .panel { border: 1px solid var(--line); border-radius: 14px; background: var(--surface); }
.section-card { min-height: 218px; padding: 19px 20px; }
.section-card h3, .panel-title { margin: 0 0 13px; font-size: 13px; }
.failure-reason p { margin: 0; color: #aab2c2; font-size: 13px; line-height: 1.75; }
[data-theme="light"] .failure-reason p { color: var(--muted); }
.diagnosis-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 16px; }
.meta-tag { padding: 3px 7px; border-radius: 5px; color: var(--muted); background: var(--surface-raised); font: 9px ui-monospace, SFMono-Regular, Consolas, monospace; text-transform: uppercase; }
.suggested-action { margin-top: 15px !important; padding-top: 13px; border-top: 1px solid var(--line); }
.assertion-list { display: flex; flex-direction: column; gap: 8px; }
.assertion-item { display: grid; grid-template-columns: 20px minmax(0,1fr) auto; gap: 9px; align-items: center; padding: 10px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface-soft); }
.assertion-item.failed { border-color: var(--red-line); background: var(--red-soft); }
.assertion-icon { width: 18px; height: 18px; display: grid; place-items: center; border: 1px solid var(--faint); border-radius: 50%; color: var(--muted); font-size: 10px; }
.assertion-item.failed .assertion-icon { border: 0; color: var(--red); font-size: 16px; }
.assertion-copy { min-width: 0; color: var(--muted); font-size: 11px; line-height: 1.35; }
.assertion-item.failed .assertion-copy { color: var(--text); }
.assertion-status { color: var(--muted); font-size: 9px; }
.assertion-item.failed .assertion-status { color: var(--red); }
.failure-banner { margin-bottom: 16px; padding: 17px 20px; border: 1px solid var(--red-line); border-radius: 12px; background: var(--red-soft); }
.failure-banner-label { margin-bottom: 7px; color: var(--red); font: 700 10px ui-monospace, SFMono-Regular, Consolas, monospace; letter-spacing: .12em; text-transform: uppercase; }
.failure-message { color: var(--text); font: 12px/1.55 ui-monospace, SFMono-Regular, Consolas, monospace; overflow-wrap: anywhere; }
.failure-location { margin-top: 7px; color: var(--muted); font: 10px ui-monospace, SFMono-Regular, Consolas, monospace; }
.panel { margin-bottom: 16px; overflow: hidden; }
.panel-head { display: flex; justify-content: space-between; align-items: center; gap: 14px; padding: 15px 18px; border-bottom: 1px solid var(--line); }
.panel-head h3 { margin: 0; font-size: 13px; }
.panel-hint { color: var(--muted); font-size: 10px; }
.panel-body { padding: 18px; }
.comparison-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.comparison-card { min-width: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 11px; background: var(--surface-soft); }
.comparison-head { display: flex; align-items: center; gap: 8px; padding: 10px 13px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 9px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.comparison-card.received .comparison-head { color: var(--red); background: var(--red-soft); }
.status-token { padding: 2px 6px; border-radius: 5px; color: var(--green); background: var(--green-soft); font: 700 12px ui-monospace, SFMono-Regular, Consolas, monospace; letter-spacing: 0; }
.received .status-token { color: var(--red); background: rgba(255,92,114,.14); }
.comparison-card pre { min-height: 118px; border-radius: 0; }
.phase-guide { display: flex; align-items: center; gap: 6px; margin-bottom: 16px; color: var(--muted); font-size: 10px; }
.phase-guide span { padding: 4px 8px; border-radius: 999px; background: var(--surface-raised); }
.phase-guide i { flex: 1; height: 1px; background: var(--line); }
.sequence { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px,1fr)); gap: 10px; }
.request-card { position: relative; min-width: 0; padding: 13px; overflow: hidden; border: 1px solid var(--line); border-radius: 10px; background: var(--surface-soft); text-align: left; cursor: pointer; }
.request-card:hover, .request-card.active { border-color: var(--violet); background: var(--violet-soft); }
.request-card.active { box-shadow: inset 0 0 0 1px var(--violet); }
.request-top { justify-content: space-between; gap: 8px; }
.request-order { color: var(--muted); font: 10px ui-monospace, SFMono-Regular, Consolas, monospace; }
.request-method { color: var(--violet); font: 750 11px ui-monospace, SFMono-Regular, Consolas, monospace; }
.request-status { color: var(--green); font: 700 10px ui-monospace, SFMono-Regular, Consolas, monospace; }
.request-status.bad { color: var(--red); }
.request-url { margin: 9px 0 5px; overflow: hidden; color: var(--text); font: 11px ui-monospace, SFMono-Regular, Consolas, monospace; text-overflow: ellipsis; white-space: nowrap; }
.request-vars { min-height: 16px; color: var(--green); font: 9px ui-monospace, SFMono-Regular, Consolas, monospace; }
.request-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; color: var(--muted); font-size: 9px; text-transform: uppercase; }
.request-timebar { position: absolute; left: 0; bottom: 0; height: 2px; background: linear-gradient(90deg,var(--violet),var(--green)); }
.selected-grid { display: grid; grid-template-columns: minmax(0,1.15fr) minmax(300px,.85fr); gap: 14px; }
.code-panel { min-width: 0; position: relative; overflow: hidden; border: 1px solid var(--line); border-radius: 10px; background: var(--surface-soft); }
.code-panel.full-span { grid-column: 1 / -1; }
.code-head { justify-content: space-between; min-height: 42px; padding: 9px 12px; border-bottom: 1px solid var(--line); }
.code-title { color: var(--muted); font-size: 10px; }
.code-context { color: var(--muted); font: 9px ui-monospace, SFMono-Regular, Consolas, monospace; }
.copy-button { padding: 5px 8px; border: 1px solid var(--line); border-radius: 6px; background: transparent; color: var(--muted); font-size: 9px; cursor: pointer; }
.copy-button:hover { border-color: var(--violet); color: var(--text); }
pre { margin: 0; padding: 15px; overflow: auto; background: var(--code); color: #dce6f7; font: 11px/1.6 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
.code-panel pre { min-height: 155px; max-height: 340px; }
.reproduction pre { min-height: 180px; max-height: 430px; }
.empty-note { color: var(--muted); font-size: 11px; }
.toast { position: fixed; right: 24px; bottom: 24px; z-index: 50; padding: 10px 14px; border-radius: 8px; background: var(--text); color: var(--page); opacity: 0; transform: translateY(8px); pointer-events: none; transition: .18s ease; }
.toast.show { opacity: 1; transform: translateY(0); }
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
  .phase-guide { display: none; }
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
`;
