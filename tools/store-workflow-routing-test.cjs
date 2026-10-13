// Isolated store-workflow RPC tests; uses an in-memory table store and fake KEDCO users.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('../backend/node_modules/typescript');
const rows = [];
const audits = [];
let rpc;
let nextId = 0;
const router = { get() {}, use() {}, delete() {}, patch() {}, put() {}, post(path, handler) { if (path === '/rpc/:name') rpc = handler; } };
const matches = (row, filters = []) => filters.every(filter => {
  if (filter.op === 'eq') return String(row[filter.column] ?? '') === String(filter.value ?? '');
  if (filter.op === 'gt') return Number(row[filter.column]) > Number(filter.value);
  return false;
});
const store = {
  tableRows: () => [],
  queryTable(table, filters = [], order, offset = 0, limit = 10000) {
    let result = rows.filter(row => row.__table === table && matches(row, filters));
    if (order?.column) result = result.sort((a, b) => String(a[order.column] ?? '').localeCompare(String(b[order.column] ?? '')) * (order.ascending === false ? -1 : 1));
    return result.slice(offset, offset + limit);
  },
  async insertTable(table, input) {
    const values = Array.isArray(input) ? input : [input];
    const saved = values.map(value => ({ ...value, __table: table, id: value.id || `row-${++nextId}` }));
    rows.push(...saved);
    return Array.isArray(input) ? saved : saved.slice(0, 1);
  },
  async updateTable(table, patch, filters = []) {
    const changed = rows.filter(row => row.__table === table && matches(row, filters));
    changed.forEach(row => Object.assign(row, patch));
    return changed;
  },
  async deleteTable() { return []; },
  async upsertTableByKeys() { return []; },
  currentSnapshotVersion() { return { version: 1 }; },
  currentVersion() { return { version: 1 }; },
  localRoot: process.cwd(),
  localSummary() { return {}; },
  safeRelativePath: value => value,
  safeSegment: value => value,
  storagePath: () => '',
  appendAudit(entry) { audits.push(entry); }
};
const staff = [
  { id: 'requester', email: 'requester@test.invalid', full_name: 'Test TE', roles: ['TE'], primary_role: 'TE' },
  { id: 'headpcm', email: 'headpcm@test.invalid', full_name: 'Test Head PC&M', roles: ['HEAD_PCM'], primary_role: 'HEAD_PCM' },
  { id: 'cto', email: 'cto@test.invalid', full_name: 'Test CTO', roles: ['CTO'], primary_role: 'CTO' },
  { id: 'store', email: 'store@test.invalid', full_name: 'Test Store Officer', roles: ['STORE_OFFICER'], primary_role: 'STORE_OFFICER' },
  { id: 'outsider', email: 'outsider@test.invalid', full_name: 'Unauthorized', roles: ['RE'], primary_role: 'RE' }
];
const regions = { findRegion: value => ({ id: value, name: value }), localRegions: () => [] };
const source = fs.readFileSync('backend/src/local/data-routes.ts', 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
vm.runInNewContext(code, { exports: {}, Buffer, process, console, URL, URLSearchParams, crypto: require('node:crypto'), require(name) {
  if (name === 'express') return { Router: () => router, raw: () => () => {} };
  if (name === './store.js') return store;
  if (name === './auth-store.js') return { users: () => staff };
  if (name === './regions.js') return regions;
  if (name === './middleware.js') return { requireLocalAuth() {} };
  return require(name);
} });
const user = id => staff.find(person => person.id === id);
async function call(name, body, userId) {
  let response, status = 200;
  const res = { locals: { kedcoUser: user(userId) }, status(value) { status = value; return this; }, json(value) { response = value; return this; } };
  await rpc({ params: { name }, body }, res, error => { throw error; });
  return { status, ...response };
}
(async () => {
  const approvalRoute = ['Technical Engineer (TE)', 'Head PC & M', 'CTO / Chief Technical Officer'];
  const payload = { reference: 'KEDCO-MR-TEST-001', requester: 'Test TE', sourceStore: 'Central Store', region: 'Kano Central', approvalRoute, lines: [{ itemId: 'I1', code: 'TRF-050', quantity: 2 }] };
  const draft = await call('kedco_save_operator_workflow_draft', { requested_submission_id: 'store-test', requested_form_code: 'store_requisition', requested_form_data: payload, requested_workflow_context: { region_name: payload.region } }, 'requester');
  assert.equal(draft.status, 200);
  assert.equal((await call('kedco_submit_operator_workflow', { requested_submission_id: 'store-test' }, 'requester')).data.submitted, true);
  let inbox = await call('kedco_list_workflow_inbox', {}, 'requester');
  assert.equal(inbox.data[0].task.step_code, 'STORE_APPROVAL_1');
  assert.equal((await call('kedco_approve_workflow_task', { requested_submission_id: 'store-test', requested_task_code: 'STORE_APPROVAL_1', requested_decision: 'APPROVE' }, 'outsider')).status, 403);
  assert.equal((await call('kedco_approve_workflow_task', { requested_submission_id: 'store-test', requested_task_code: 'STORE_APPROVAL_1', requested_decision: 'APPROVE', requested_comment: 'TE endorsed' }, 'requester')).data.next_task_code, 'STORE_APPROVAL_2');
  inbox = await call('kedco_list_workflow_inbox', {}, 'headpcm');
  assert.equal(inbox.data[0].task.step_code, 'STORE_APPROVAL_2');
  assert.equal((await call('kedco_approve_workflow_task', { requested_submission_id: 'store-test', requested_task_code: 'STORE_APPROVAL_2', requested_decision: 'APPROVE', requested_comment: 'Head PC&M approved' }, 'headpcm')).data.next_task_code, 'STORE_APPROVAL_3');
  inbox = await call('kedco_list_workflow_inbox', {}, 'cto');
  assert.equal(inbox.data[0].task.step_code, 'STORE_APPROVAL_3');
  assert.equal((await call('kedco_approve_workflow_task', { requested_submission_id: 'store-test', requested_task_code: 'STORE_APPROVAL_3', requested_decision: 'APPROVE', requested_comment: 'CTO approved' }, 'cto')).data.next_task_code, 'STORE_ISSUE');
  inbox = await call('kedco_list_workflow_inbox', {}, 'store');
  assert.equal(inbox.data[0].task.step_code, 'STORE_ISSUE');
  assert.equal((await call('kedco_approve_workflow_task', { requested_submission_id: 'store-test', requested_task_code: 'STORE_ISSUE', requested_decision: 'APPROVE', requested_comment: 'Issued' }, 'store')).data.status, 'APPROVED_FOR_ISSUE');
  const history = await call('kedco_list_store_requisition_history', { requested_submission_id: 'store-test' }, 'requester');
  assert.deepEqual(history.data.map(task => task.status), ['APPROVED', 'APPROVED', 'APPROVED', 'APPROVED']);
  assert.equal((await call('kedco_list_store_requisition_history', { requested_submission_id: 'store-test' }, 'outsider')).status, 403);
  assert.ok(audits.some(entry => entry.type === 'LOCAL_WORKFLOW_TASK_APPROVED'));

  const invalidRoute = ['Technical Engineer (TE)', 'Head PC & M', 'Head O & M'];
  const invalidDraft = await call('kedco_save_operator_workflow_draft', { requested_submission_id: 'store-invalid', requested_form_code: 'store_requisition', requested_form_data: { ...payload, approvalRoute: invalidRoute }, requested_workflow_context: {} }, 'requester');
  assert.equal(invalidDraft.status, 200);
  assert.equal((await call('kedco_submit_operator_workflow', { requested_submission_id: 'store-invalid' }, 'requester')).status, 400);
  console.log('PASS: authenticated four-step store requisition route, role-scoped approvals, CTO requirement, Store Officer issue handoff, and readable role-authorized approval history.');
})().catch(error => { console.error(error); process.exitCode = 1; });
