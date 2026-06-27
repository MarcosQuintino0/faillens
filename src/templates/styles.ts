export const styles = String.raw`
:root {
  color-scheme: dark;
  --bg: #080d16;
  --surface: #101827;
  --surface-2: #162235;
  --surface-3: #1d2b40;
  --text: #edf3ff;
  --muted: #91a1b9;
  --line: #26364e;
  --accent: #7c6cff;
  --accent-2: #35d0ba;
  --danger: #ff667d;
  --danger-soft: rgba(255, 102, 125, .12);
  --success: #45d483;
  --warning: #ffbd59;
  --shadow: 0 18px 45px rgba(0, 0, 0, .24);
  --code: #070b12;
}
[data-theme="light"] {
  color-scheme: light;
  --bg: #f3f6fb;
  --surface: #ffffff;
  --surface-2: #f7f9fd;
  --surface-3: #edf2fa;
  --text: #172033;
  --muted: #647087;
  --line: #dbe2ed;
  --accent: #6554e8;
  --accent-2: #087f70;
  --danger: #d93652;
  --danger-soft: rgba(217, 54, 82, .09);
  --success: #14854b;
  --warning: #9b6500;
  --shadow: 0 14px 36px rgba(34, 51, 84, .12);
  --code: #111827;
}
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; background: var(--bg); color: var(--text); }
body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 14px; }
button, input { font: inherit; }
button { color: inherit; }
.app { min-height: 100vh; }
.topbar {
  height: 78px; display: flex; align-items: center; gap: 24px; padding: 0 24px;
  border-bottom: 1px solid var(--line); background: color-mix(in srgb, var(--surface) 92%, transparent);
  position: sticky; top: 0; z-index: 20; backdrop-filter: blur(12px);
}
.brand { display: flex; align-items: center; gap: 12px; min-width: 280px; }
.brand-mark { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; font-weight: 900; background: linear-gradient(145deg, var(--accent), #aa72ff); box-shadow: 0 8px 24px rgba(124,108,255,.35); }
.brand h1 { font-size: 16px; margin: 0; letter-spacing: .1px; }
.brand p { font-size: 12px; color: var(--muted); margin: 3px 0 0; }
.run-stats { display: flex; gap: 18px; flex: 1; align-items: center; }
.run-stat { min-width: 74px; }
.run-stat strong { display: block; font-size: 16px; }
.run-stat span { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
.top-actions { display: flex; gap: 8px; }
.button { border: 1px solid var(--line); background: var(--surface-2); border-radius: 9px; padding: 9px 12px; cursor: pointer; transition: .16s ease; }
.button:hover { border-color: var(--accent); transform: translateY(-1px); }
.button.primary { background: var(--accent); border-color: var(--accent); color: white; }
.workspace { display: grid; grid-template-columns: 340px minmax(0, 1fr); min-height: calc(100vh - 78px); }
.sidebar { border-right: 1px solid var(--line); background: var(--surface); padding: 18px 14px; overflow: auto; height: calc(100vh - 78px); position: sticky; top: 78px; }
.search { width: 100%; padding: 11px 12px; background: var(--surface-2); color: var(--text); border: 1px solid var(--line); border-radius: 9px; outline: none; }
.search:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(124,108,255,.12); }
.chips { display: flex; gap: 7px; margin: 12px 0 18px; }
.chip { border: 1px solid var(--line); background: transparent; color: var(--muted); padding: 6px 10px; border-radius: 999px; cursor: pointer; }
.chip.active { background: var(--accent); border-color: var(--accent); color: #fff; }
.spec-group { margin-bottom: 18px; }
.spec-title { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; padding: 0 8px 7px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.test-item { width: 100%; border: 1px solid transparent; background: transparent; color: var(--text); padding: 10px; border-radius: 10px; display: grid; grid-template-columns: 10px 1fr auto; gap: 9px; text-align: left; cursor: pointer; margin: 2px 0; }
.test-item:hover { background: var(--surface-2); }
.test-item.active { background: var(--surface-3); border-color: var(--line); box-shadow: inset 3px 0 var(--accent); }
.status-dot { width: 8px; height: 8px; margin-top: 5px; border-radius: 50%; background: var(--muted); }
.status-dot.failed { background: var(--danger); box-shadow: 0 0 0 4px var(--danger-soft); }
.status-dot.passed { background: var(--success); }
.test-title { line-height: 1.35; font-size: 13px; }
.test-duration { font-size: 11px; color: var(--muted); white-space: nowrap; }
.main { min-width: 0; padding: 28px clamp(20px, 3vw, 48px) 64px; }
.empty { min-height: 55vh; display: grid; place-items: center; color: var(--muted); text-align: center; }
.test-head { display: flex; gap: 20px; align-items: flex-start; justify-content: space-between; margin-bottom: 22px; }
.eyebrow { color: var(--accent-2); font-size: 11px; text-transform: uppercase; letter-spacing: .1em; font-weight: 700; }
.test-head h2 { margin: 7px 0 8px; font-size: clamp(22px, 3vw, 32px); line-height: 1.2; }
.meta-row { display: flex; gap: 9px; align-items: center; flex-wrap: wrap; color: var(--muted); }
.badge { border-radius: 999px; padding: 5px 9px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; }
.badge.failed { color: var(--danger); background: var(--danger-soft); }
.badge.passed { color: var(--success); background: color-mix(in srgb, var(--success) 13%, transparent); }
.endpoint { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; color: var(--text); }
.method { color: var(--accent-2); font-weight: 800; }
.cards { display: grid; grid-template-columns: repeat(4, minmax(120px, 1fr)); gap: 12px; margin-bottom: 20px; }
.metric, .panel { background: var(--surface); border: 1px solid var(--line); box-shadow: var(--shadow); border-radius: 14px; }
.metric { padding: 15px 16px; }
.metric span { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .07em; }
.metric strong { display: block; font-size: 22px; margin-top: 8px; }
.panel { margin-top: 14px; overflow: hidden; }
.panel-head { display: flex; justify-content: space-between; align-items: center; padding: 15px 18px; border-bottom: 1px solid var(--line); }
.panel-head h3 { margin: 0; font-size: 14px; }
.panel-body { padding: 18px; }
.diagnosis { border-left: 3px solid var(--warning); }
.diagnosis h4 { margin: 0 0 7px; font-size: 17px; }
.diagnosis p { margin: 0; color: var(--muted); line-height: 1.6; }
.confidence { color: var(--warning); font-size: 11px; text-transform: uppercase; font-weight: 800; }
.evidence { margin: 14px 0 0; padding-left: 18px; color: var(--muted); }
.evidence li { margin: 5px 0; }
.suggestion { margin-top: 14px !important; padding-top: 14px; border-top: 1px solid var(--line); color: var(--text) !important; }
.assertion { padding: 13px; background: var(--danger-soft); border: 1px solid color-mix(in srgb, var(--danger) 35%, transparent); border-radius: 9px; color: var(--danger); line-height: 1.55; }
.compare { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.compare-card { padding: 14px; background: var(--surface-2); border-radius: 10px; }
.compare-card span { display: block; color: var(--muted); font-size: 11px; text-transform: uppercase; margin-bottom: 8px; }
.compare-card strong { font: 700 19px ui-monospace, SFMono-Regular, Consolas, monospace; overflow-wrap: anywhere; }
.sequence { display: flex; flex-direction: column; gap: 7px; }
.request-row { display: grid; grid-template-columns: 30px 66px minmax(150px, 1fr) 72px 74px 90px 86px; gap: 9px; align-items: center; padding: 10px; border: 1px solid var(--line); background: var(--surface-2); border-radius: 10px; cursor: pointer; text-align: left; position: relative; overflow: hidden; }
.request-row:hover, .request-row.active { border-color: var(--accent); }
.time-bar { position: absolute; left: 0; bottom: 0; height: 2px; background: linear-gradient(90deg, var(--accent), var(--accent-2)); }
.req-order { color: var(--muted); }
.req-url { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.req-phase { color: var(--muted); font-size: 11px; text-transform: uppercase; }
.req-status.ok { color: var(--success); }
.req-status.bad { color: var(--danger); }
.mini { padding: 5px 7px; font-size: 11px; }
.vars { display: block; margin-top: 4px; color: var(--accent-2); font-size: 10px; }
.request-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.code-block { position: relative; min-width: 0; }
.code-block.full { grid-column: 1 / -1; }
.code-label { color: var(--muted); font-size: 11px; text-transform: uppercase; margin: 0 0 7px; }
pre { margin: 0; background: var(--code); color: #d9e6ff; border-radius: 10px; padding: 14px; overflow: auto; max-height: 390px; line-height: 1.5; font: 12px/1.55 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
.copy { position: absolute; right: 8px; top: 26px; z-index: 2; }
.no-diagnosis { color: var(--muted); }
.toast { position: fixed; right: 22px; bottom: 22px; background: var(--text); color: var(--bg); padding: 10px 14px; border-radius: 9px; opacity: 0; transform: translateY(8px); pointer-events: none; transition: .2s; z-index: 50; }
.toast.show { opacity: 1; transform: translateY(0); }
@media (max-width: 980px) {
  .topbar { height: auto; min-height: 78px; flex-wrap: wrap; padding: 14px 18px; }
  .run-stats { order: 3; flex-basis: 100%; }
  .workspace { grid-template-columns: 280px minmax(0, 1fr); }
  .sidebar { top: 112px; height: calc(100vh - 112px); }
  .cards { grid-template-columns: 1fr 1fr; }
  .request-row { grid-template-columns: 25px 56px 1fr 65px; }
  .request-row .req-phase, .request-row .req-time, .request-row .mini { display: none; }
}
@media (max-width: 720px) {
  .workspace { display: block; }
  .sidebar { position: static; height: auto; max-height: 360px; border-right: 0; border-bottom: 1px solid var(--line); }
  .brand { min-width: 0; flex: 1; }
  .run-stats { overflow-x: auto; }
  .main { padding: 22px 14px 50px; }
  .request-tabs { grid-template-columns: 1fr; }
  .code-block.full { grid-column: auto; }
}
`;
