import { app } from './state.js';
import { SupabaseStore, DemoStore } from './store.js';
import { esc, $, $$, toast, modal, debounce, badge } from './ui.js';
import { computeAlerts } from './metrics.js';
import { runAutomation, clientForm, policyForm, taskForm, visitForm } from './actions.js';
import { mergeSettings } from './defaults.js';

const PAGES = {};
const NAV = [
  ['dashboard', '🏠', 'Dashboard'], ['grp', 'Clients'], ['clients', '👥', 'Clients'], ['policies', '📄', 'Policies'],
  ['grp', 'Money'], ['premiums', '💰', 'Premiums & reminders'], ['collections', '🚶', 'Collections & visits'], ['receipts', '🧾', 'Receipts'],
  ['grp', 'Service'], ['claims', '🎯', 'Maturity & claims'], ['tasks', '✅', 'Tasks'], ['whatsapp', '💬', 'WhatsApp centre'], ['relationships', '🤝', 'Relationships'],
  ['grp', 'Admin'], ['reports', '📊', 'Reports'], ['data', '⇅', 'Import / export'], ['settings', '⚙', 'Settings'], ['audit', '🛡', 'Audit trail']];
const LOADERS = {
  dashboard: () => import('./pages/dashboard.js'), clients: () => import('./pages/clients.js'), policies: () => import('./pages/policies.js'), premiums: () => import('./pages/premiums.js'),
  collections: () => import('./pages/collections.js'), receipts: () => import('./pages/receipts.js'), claims: () => import('./pages/claims.js'), tasks: () => import('./pages/tasks.js'),
  whatsapp: () => import('./pages/whatsapp.js'), relationships: () => import('./pages/relationships.js'), reports: () => import('./pages/reports.js'), data: () => import('./pages/data.js'),
  settings: () => import('./pages/settings.js'), audit: () => import('./pages/audit.js') };

const cfg = window.CRM_CONFIG || {};
const live = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
const root = () => $('#root');
const setTheme = t => { document.documentElement.dataset.theme = t; try { localStorage.setItem('crm_theme', t); } catch {} };
try { setTheme(localStorage.getItem('crm_theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')); } catch {}

function authScreen(msg = '') {
  $('#boot')?.remove();
  root().innerHTML = `<div class="auth"><div class="card"><h1>Advisor CRM</h1><p class="mut">Sign in to your private workspace.</p>${msg ? `<div class="banner warn">${esc(msg)}</div>` : ''}
  <form id="lf"><label class="f"><span>Email</span><input name="email" type="email" required autocomplete="username"></label><label class="f"><span>Password</span><input name="pw" type="password" required minlength="6" autocomplete="current-password"></label>
  <label class="f hide" id="nm"><span>Your name</span><input name="name" autocomplete="name"></label>
  <div class="row"><button class="primary grow" id="go">Sign in</button><button type="button" id="su">Create account</button></div><p class="sm"><a href="#" id="fp">Forgot password?</a></p></form>
  <p class="sm mut">The first account created becomes the administrator. Accounts created later stay inactive until the administrator approves them.</p></div></div>`;
  const f = $('#lf'); let signup = false;
  $('#su').onclick = () => { signup = !signup; $('#nm').classList.toggle('hide', !signup); $('#go').textContent = signup ? 'Create account' : 'Sign in'; $('#su').textContent = signup ? 'I have an account' : 'Create account'; };
  $('#fp').onclick = async e => { e.preventDefault(); const em = f.email.value; if (!em) return toast('Type your email first', 'bad'); try { await app.store.resetPassword(em); toast('Password reset email sent', 'good'); } catch (x) { toast(x.message, 'bad'); } };
  f.onsubmit = async e => { e.preventDefault(); $('#go').disabled = true; try { if (signup) { const j = await app.store.signUp(f.email.value, f.pw.value, f.name.value); if (!j.access_token) { toast('Account created. Check your email to confirm it, then sign in.', 'good'); return; } } else await app.store.signIn(f.email.value, f.pw.value); start(); } catch (x) { toast(x.message, 'bad'); } finally { $('#go').disabled = false; } };
}

async function start() {
  try {
    if (live && !app.store.session) return authScreen();
    if (live) { await app.store.loadProfile(); if (!app.store.profile) { await app.store.signOut(); return authScreen('Your profile could not be loaded. Please sign in again.'); } if (!app.store.profile.active) return pendingScreen(); }
    $('#boot').textContent = 'Loading your data…';
    await app.store.loadAll((n, t) => { $('#boot').textContent = `Loading your data… ${n}/${t}`; });
  } catch (e) { if (e.status === 401) { await app.store.signOut(); return authScreen('Session expired. Please sign in again.'); } $('#boot')?.remove(); root().innerHTML = `<div class="auth"><div class="card"><h2>Could not load data</h2><p>${esc(e.message)}</p><p class="sm mut">Check that schema.sql has been run in Supabase and that config.js has the right project URL and anon key.</p><button onclick="location.reload()">Retry</button></div></div>`; return; }
  app.reindex(); $('#boot')?.remove(); shell(); app.store.on(debounce(() => { app.reindex(); }, 50));
  window.addEventListener('hashchange', route); route();
  // run the daily engine once per day per browser (staff/admin only); the scheduled Edge Function does the same server-side
  try { const k = 'crm_auto_' + app.today; if (app.can('write') && !localStorage.getItem(k)) { await runAutomation({ silent: true, trigger: 'app-open' }); localStorage.setItem(k, '1'); route(); } } catch (e) { console.warn('automation', e); }
}
function pendingScreen() { $('#boot')?.remove(); root().innerHTML = `<div class="auth"><div class="card"><h2>Waiting for approval</h2><p>Your account (${esc(app.store.user.email)}) has been created, but the administrator has not activated it yet.</p><button id="so">Sign out</button></div></div>`; $('#so').onclick = async () => { await app.store.signOut(); location.reload(); }; }

function shell() {
  const demo = app.store.mode === 'demo';
  root().innerHTML = `<div class="app"><aside class="side" id="side"><div class="brand"><i>🛡</i><span id="brandName">${esc(app.settings.business.business_name || 'Advisor CRM')}</span></div><nav class="nav" id="nav"></nav><div class="spacer"></div><div class="sm mut" style="padding:8px 12px">${demo ? 'Demo mode' : esc(app.store.user?.email || '')}<br>${esc(app.store.role || '')}</div></aside>
  <header class="top"><button class="icon-btn menu-btn" id="mb" aria-label="Menu">☰</button><div class="search"><input id="gs" placeholder="Search clients, mobile, policy number…" autocomplete="off"><div class="results hide" id="gr"></div></div><span class="spacer"></span>
   <button class="icon-btn" id="qa" title="Quick actions">＋</button><button class="icon-btn" id="bell" title="Alerts">🔔<span class="dot hide" id="bd"></span></button><button class="icon-btn" id="th" title="Light / dark">◐</button><button class="icon-btn" id="pf" title="Profile">👤</button><div class="pop hide" id="pop"></div></header>
  <main class="main" id="view"></main></div>`;
  const nav = $('#nav'); nav.innerHTML = NAV.map(n => n[0] === 'grp' ? `<div class="grp">${n[1]}</div>` : `<a href="#/${n[0]}" data-p="${n[0]}"><span>${n[1]}</span>${n[2]}<span class="cnt hide" data-c="${n[0]}"></span></a>`).join('');
  $('#mb').onclick = () => { $('#side').classList.toggle('open'); toggleScrim(); };
  nav.addEventListener('click', () => { $('#side').classList.remove('open'); toggleScrim(); });
  $('#th').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  const pop = $('#pop'); const showPop = html => { pop.innerHTML = html; pop.classList.remove('hide'); }; document.addEventListener('click', e => { if (!e.target.closest('#pop,#qa,#bell,#pf')) pop.classList.add('hide'); if (!e.target.closest('.search')) $('#gr').classList.add('hide'); });
  $('#qa').onclick = () => { const items = [['👤 New client', () => clientForm()], ['📄 New policy', () => policyForm()], ['✅ New task', () => taskForm()], ['🚶 Schedule visit', () => visitForm()], ['💰 Record a payment', () => app.go('#/premiums?f=pending&pay=1')], ['💬 Send a message', () => app.go('#/whatsapp')], ['⇅ Import Excel', () => app.go('#/data')]]; showPop(items.map((x, i) => `<button class="item" data-i="${i}">${x[0]}</button>`).join('')); $$('.item', pop).forEach(b => b.onclick = () => { pop.classList.add('hide'); items[+b.dataset.i][1](); }); };
  $('#bell').onclick = () => { const al = computeAlerts(app.data, app.ix, app.today, app.settings); showPop(al.length ? al.map(a => `<a href="${a.link}"><span>${a.level === 'bad' ? '🔴' : a.level === 'warn' ? '🟠' : '🔵'}</span><span>${esc(a.text)}</span></a>`).join('') : '<div class="empty">No alerts 🎉</div>'); };
  $('#pf').onclick = () => { showPop(`<div style="padding:12px 14px"><b>${esc(app.store.profile?.full_name || app.store.user?.email || 'Demo user')}</b><div class="sm mut">${esc(app.store.role || '')}${app.store.mode === 'demo' ? ' · demo' : ''}</div></div>${app.store.mode === 'demo' ? '' : '<button class="item" id="so">Sign out</button>'}<button class="item" id="rf">Reload data</button><button class="item" id="th2">◐ Light / dark mode</button>`); $('#th2').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); $('#so')?.addEventListener('click', async () => { await app.store.signOut(); location.reload(); }); $('#rf').onclick = async () => { await app.store.loadAll(); app.reindex(); route(); pop.classList.add('hide'); toast('Data reloaded'); }; };
  const gs = $('#gs'), gr = $('#gr'); if (matchMedia('(max-width:860px)').matches) gs.placeholder = 'Search…';
  gs.oninput = debounce(() => {
    const q = gs.value.trim().toLowerCase(); if (q.length < 2) return gr.classList.add('hide'); const t = q.split(/\s+/), digits = q.replace(/\D/g, '');
    const cl = app.data.clients.filter(c => !c.archived && t.every(w => `${c.name} ${c.client_code} ${c.mobile || ''} ${c.whatsapp || ''} ${c.email || ''}`.toLowerCase().includes(w))).slice(0, 8);
    const po = app.data.policies.filter(p => t.every(w => `${p.policy_no} ${p.policy_code} ${p.plan_name || ''}`.toLowerCase().includes(w)) || (digits.length >= 4 && p.policy_no.includes(digits))).slice(0, 6);
    gr.innerHTML = (cl.length ? '<div class="grp">Clients</div>' + cl.map(c => `<a href="#/clients/${c.id}"><b>${esc(c.name)}</b> <span class="mut sm">${esc(c.client_code)} · ${esc(c.mobile || '')}</span></a>`).join('') : '') + (po.length ? '<div class="grp">Policies</div>' + po.map(p => `<a href="#/policies/${p.id}"><b>${esc(p.policy_no)}</b> <span class="mut sm">${esc(app.ix.clientById.get(p.client_id)?.name || '')} · ${esc(p.plan_name || '')}</span></a>`).join('') : '') || '<div class="empty">No match</div>';
    gr.classList.remove('hide'); }, 150);
  gr.addEventListener('click', () => { gr.classList.add('hide'); gs.value = ''; });
  document.addEventListener('keydown', e => { if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); gs.focus(); } });
}
function toggleScrim() { document.querySelector('.scrim')?.remove(); if ($('#side').classList.contains('open')) { const s = document.createElement('div'); s.className = 'scrim'; s.onclick = () => { $('#side').classList.remove('open'); s.remove(); }; document.body.append(s); } }

function parseHash() { const h = location.hash.replace(/^#\/?/, ''); const [path, qs] = h.split('?'); const [page, id] = path.split('/'); return { page: page || 'dashboard', id: id || null, q: Object.fromEntries(new URLSearchParams(qs || '')) }; }
let token = 0;
async function route() {
  if (!$('#view')) return; app.route = parseHash(); const my = ++token; const { page } = app.route;
  $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.p === page));
  const view = $('#view'); const load = LOADERS[page];
  if (!load) { view.innerHTML = '<div class="empty">Page not found. <a href="#/dashboard">Go to dashboard</a></div>'; return; }
  try {
    PAGES[page] ||= await load(); if (my !== token) return;
    view.innerHTML = (app.store.mode === 'demo' ? '<div class="banner demo"><b>DEMO MODE</b> – everything below is made-up sample data, kept only in this browser tab. Add your Supabase URL and key in <code>config.js</code> to use real data.</div>' : '') + '<div id="pg"></div>';
    await PAGES[page].render(app, $('#pg'));
    updateBadges(); view.scrollTop = 0;
  } catch (e) { console.error(e); $('#view').innerHTML = `<div class="banner bad"><b>Something went wrong on this page.</b> ${esc(e.message)}</div>`; }
}
function updateBadges() {
  const al = computeAlerts(app.data, app.ix, app.today, app.settings), bad = al.filter(a => a.level !== 'info').length; const d = $('#bd'); if (d) { d.textContent = bad; d.classList.toggle('hide', !bad); }
  const cnt = (k, n) => { const e = document.querySelector(`[data-c="${k}"]`); if (e) { e.textContent = n; e.classList.toggle('hide', !n); } };
  cnt('premiums', app.data.dues.filter(x => x.status === 'pending' && !x.verify_first && x.due_date < app.today && app.ix.policyById.get(x.policy_id)?.status === 'In force').length);
  cnt('tasks', app.data.tasks.filter(t => ['Open', 'In Progress', 'Waiting'].includes(t.status) && (t.next_action_date || t.due_date) < app.today).length);
}
app.rerender = debounce(() => { app.reindex(); route(); }, 30);

(async function boot() {
  app.store = live ? new SupabaseStore(cfg) : new DemoStore();
  window.__app = app;
  await start();
})();
