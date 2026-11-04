import { mergeSettings } from './defaults.js';
import { todayISO } from './dates.js';
import { indexData } from './metrics.js';
export const app = {
  store: null, settings: mergeSettings({}), today: todayISO('Asia/Kolkata'), ix: null, route: { page:'', id:null, q:{} },
  can(p) { const r = this.store?.role; if (!r) return false; if (r === 'admin') return true; if (r === 'staff') return p === 'write'; return p === 'read'; },
  get data() { return this.store.data; },
  reindex() { this.settings = mergeSettings(this.store.settingsValue || {}); this.today = todayISO(this.settings.business?.timezone || 'Asia/Kolkata'); this.ix = indexData(this.store.data); },
  go(hash) { if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = hash; },
  rerender: () => {},
};
export const clientName = (id) => { const c = app.ix.clientById.get(id); return c ? c.name : ''; };
export const policyLabel = (p) => p ? `${p.policy_no}${p.plan_name ? ' · ' + p.plan_name : ''}` : '';
