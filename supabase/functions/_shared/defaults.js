// Default (editable) settings. Everything here can be changed from Settings inside the app – no code editing needed.
export const FREQ_MONTHS = { 'Monthly':1, 'Quarterly':3, 'Half-yearly':6, 'Yearly':12, 'Single':0 };
export const FREQ_PER_YEAR = { 'Monthly':12, 'Quarterly':4, 'Half-yearly':2, 'Yearly':1, 'Single':0 };
export const OPEN_TASK = ['Open','In Progress','Waiting'];
export const CLAIM_STAGES = ['Maturity Approaching','Client Informed','Documents Required','Documents Collected','Claim Submitted','Claim Under Process','Payment Received','Completed'];
export const RECEIPT_STATUSES = ['Awaiting Receipt','Receipt Received','Dispatch Pending','Dispatched','Client Confirmation Pending','Completed'];
export const VISIT_STATUSES = ['Scheduled','Client Confirmed','Visit Pending','Collected','Payment Not Received','Rescheduled','Cancelled','Completed','Not Met'];
export const VISIT_PURPOSES = ['Premium collection','Document collection','Service visit','Claim documents','Client meeting','Other'];
export const PAY_METHODS = ['Cash','Cheque','Bank Transfer','UPI','Online (LIC portal)','Other'];
export const COLLECTION_METHODS = ['Cash','Cheque','Bank Transfer','UPI','Other'];
export const TASK_STATUSES = ['Open','In Progress','Waiting','Done','Cancelled'];
export const PRIORITIES = ['Critical','High','Medium','Low'];
export const PRIORITY_RANK = { Critical:0, High:1, Medium:2, Low:3 };
export const CLAIM_TYPES = ['Maturity','Survival Benefit','Death','Health','General Insurance','Other'];
export const CHANNELS = ['WhatsApp','Call','SMS','Email','Visit'];
export const CATEGORIES = ['VIP','Regular','New','Dormant'];
export const REL_STATUSES = ['Active','Needs attention','Prospect','Inactive'];
export const PREFERRED = ['WhatsApp','Call','Email','Visit','SMS'];
export const FREQUENCIES = ['Monthly','Quarterly','Half-yearly','Yearly','Single'];
export const POLICY_STATUSES = ['In force','Fully paid-up','Reduced paid-up','Lapsed','Matured','Surrendered','Death claim','Cancelled'];
export const ACTIVE_POLICY = ['In force','Fully paid-up','Reduced paid-up'];

export const DEFAULT_SETTINGS = {
  business: { advisor_name:'', business_name:'', phone:'', email:'', address:'', logo:'', signature:'' },
  reminder: { before:[15,7,3,1], on_due:true, after:[1,3,7,15,30], due_soon_days:15, lookahead_days:7, include_verify:false },
  automation: { A:true, B:true, C:true, D:true, E:true, F:true, G:true, H:true, receipt_alert_days:2, maturity_milestones:[180,90,60,30,15], run_on_open:true, auto_next_due:true, lapse_warning_days:5 },
  late_fee: { rate_pct:11.2, min_fee:6 },
  lists: {
    insurers:['LIC of India','HDFC Life','SBI Life','ICICI Prudential Life','Max Life','Bajaj Allianz Life','Star Health','Niva Bupa','HDFC ERGO','ICICI Lombard','New India Assurance','Other'],
    policy_types:['Endowment','Money Back','Whole Life','Term','Unit Linked','Pension / Annuity','Health','Motor','Home / Property','Travel','Life (Traditional)','Other'],
    task_categories:['Premium Reminder','Premium Collection','Receipt Dispatch','Maturity Claim','Document Collection','Policy Correction','Nominee Update','Address Update','Client Meeting','New Business','Customer Complaint','Other Service'],
    collection_methods: COLLECTION_METHODS.slice()
  },
  targets: { monthly_collection: 0, monthly: {} },
  engagement: { w_policies:5, max_policies:25, w_ontime:30, w_contact:20, w_tenure:10, w_family:10, p_pending:5, p_overdue:10, base:20 },
  dashboard: { show_charts:true },
  templates: {},          // per-template overrides: { key: { en:'...', gu:'...' } }
  wa_api: { enabled:false, note:'Not connected. See SETUP.md – needs a Meta WhatsApp Business account, approved templates and the send-whatsapp Edge Function.' }
};
export function mergeSettings(saved){
  const out = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  for (const k of Object.keys(saved||{})) {
    const v = saved[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k]==='object' && !Array.isArray(out[k])) out[k] = { ...out[k], ...v };
    else out[k] = v;
  }
  return out;
}
