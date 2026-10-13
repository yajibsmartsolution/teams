/* Additive RE/TE form assistance. Existing controls, names, listeners and
   workflows remain the source of saved and sent values. */
(function (global) {
  'use strict';
  if (global.KEDCO_RETE_FORM_USABILITY) return;
  const VERSION = '20261002-network-v1';
  const bound = new WeakSet();
  const fieldLists = new WeakMap();
  let personnel = [], directoryLoaded = false, directoryRequest = null;
  let sequence = 0, mountQueued = false;
  const byName = (form, name) => Array.from(form.elements).find(control => control.name === name);
  const list = value => Array.isArray(value) ? value : [];
  const unique = values => [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const key = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const stationKey = value => key(String(value || '').replace(/\b\d+(?:\/\d+)*\s*K[Vv]\b/gi, '').replace(/\b(?:INJECTION SUBSTATION|SUBSTATION|STATION)\b/gi, ''));
  const valueOf = (form, name) => byName(form, name)?.value || '';
  const constants = {
    maintenance: () => typeof ACTIVE_MAINTENANCE_DATA !== 'undefined' ? list(ACTIVE_MAINTENANCE_DATA) : [],
    stations: () => typeof SUBSTATION_DATA !== 'undefined' ? list(SUBSTATION_DATA) : [],
    injection: () => typeof INJECTION_STATIONS !== 'undefined' ? list(INJECTION_STATIONS) : [],
    transmission: () => typeof TRANSMISSION_FEEDERS !== 'undefined' ? list(TRANSMISSION_FEEDERS) : [],
    jobs: () => typeof FORM_JOB_TITLES !== 'undefined' ? list(FORM_JOB_TITLES) : [],
    hazards: () => typeof HAZARDS !== 'undefined' ? list(HAZARDS) : []
  };

  function networkCatalog() {
    if (global.KEDCO_RETE_SCOPED_NETWORK?.catalog) return global.KEDCO_RETE_SCOPED_NETWORK.catalog();
    return constants.maintenance().filter(row => row.feeder && !/^(?:No\s|[—-]\s*Blank)/i.test(row.feeder))
      .map(row => ({ ...row, links: [] }));
  }

  function options(control, items, placeholder, preserve = true) {
    if (!control) return;
    const current = control.value;
    const normalized = items.map(item => typeof item === 'string' ? { value: item, label: item } : item);
    const entries = [{ value: '', label: placeholder }, ...normalized];
    if (preserve && current && !entries.some(item => item.value === current)) entries.push({ value: current, label: current + ' (saved / custom)' });
    const same = control.options.length === entries.length && entries.every((item, index) =>
      control.options[index].value === item.value && control.options[index].textContent === item.label);
    if (!same) {
      const fragment = document.createDocumentFragment();
      for (const item of entries) {
        const option = document.createElement('option');
        option.value = item.value; option.textContent = item.label;
        fragment.appendChild(option);
      }
      control.replaceChildren(fragment);
    }
    control.value = entries.some(item => item.value === current) ? current : '';
  }

  function appendOptions(control, values) {
    if (!control) return;
    for (const value of values) if (!Array.from(control.options).some(option => option.value === value)) {
      const option = document.createElement('option'); option.value = value; option.textContent = value; control.appendChild(option);
    }
  }

  function message(form, text, kind = 'info') {
    const status = form.querySelector('[data-rete-ux-message]');
    if (!status) return;
    if (status.textContent !== text) status.textContent = text;
    status.dataset.kind = kind; status.hidden = !text;
  }

  function networkFields(form) {
    return { state: byName(form, 'state'), region: byName(form, 'region'),
      station: byName(form, 'station') || byName(form, 'location'),
      voltage: byName(form, 'voltage') || form.querySelector('[data-rete-ux-voltage]'),
      feeder: byName(form, 'feeder'), tsp: byName(form, 'tsp') };
  }

  function refreshNetwork(form, changed = '', preserve = true) {
    const controls = networkFields(form), catalog = networkCatalog();
    options(controls.state, unique(constants.maintenance().map(row => row.state)), 'Select State', preserve || changed !== 'state');
    const state = controls.state?.value || '';
    let rows = catalog.filter(row => !state || row.state === state);
    options(controls.region, unique(constants.maintenance().filter(row => !state || row.state === state).map(row => row.region)), 'Select Region', preserve || changed !== 'state');
    const region = controls.region?.value || '';
    rows = rows.filter(row => !region || row.region === region);
    options(controls.tsp, unique(rows.filter(row => row.voltage === '11 kV').map(row => row.maintenanceOffice)),
      'Select TSP / 11 kV Location', preserve || !['state', 'region'].includes(changed));
    const linkedStations = unique(rows.flatMap(row => row.links.flatMap(link => [link.station, link.source])));
    const stations = unique([...linkedStations, ...rows.map(row => row.maintenanceOffice)]);
    options(controls.station, stations, 'Select Station / Source', preserve || !['state', 'region'].includes(changed));
    for (const control of form.querySelectorAll('[data-op-substation]')) if (control !== controls.station) {
      options(control, stations, 'Select Station / Location', true);
    }
    if (controls.voltage) appendOptions(controls.voltage,
      ['33 kV', '11 kV', '0.415 kV', '11/0.415 kV', '33/0.415 kV', '132 kV', '330 kV']);
    const station = controls.station?.value || '', voltage = controls.voltage?.value || '', tsp = controls.tsp?.value || '';
    if (tsp) rows = rows.filter(row => row.maintenanceOffice === tsp);
    if (station) rows = rows.filter(row => stationKey(row.maintenanceOffice) === stationKey(station) || row.links.some(link =>
      stationKey(link.station) === stationKey(station) || stationKey(link.source) === stationKey(station)));
    if (voltage) rows = rows.filter(row => row.voltage === voltage);
    const names = unique(rows.map(row => row.feeder));
    const choices = names.map(name => ({ value: name,
      label: unique(rows.filter(row => row.feeder === name).map(row => row.voltage)).join(' / ') + ' · ' + name }));
    const previous = controls.feeder?.value || '';
    options(controls.feeder, choices, choices.length ? 'Select Feeder / Apparatus' : 'No mapped feeder — use Specify', preserve);
    const missingTopology = !!region && !linkedStations.length;
    const retained = preserve && previous && !choices.some(item => item.value === previous);
    message(form, retained ? 'The saved/custom feeder value is retained. Check it against the selected network.' :
      !choices.length ? 'No matching feeder is recorded for this selection. Adjust the filters or specify the apparatus.' :
      missingTopology ? 'These are registered feeders for the active assignment. Their upstream station/source links are not recorded.' :
      choices.length + ' matching feeder(s) for the active RE/TE region and unit. Choose Station → Voltage → Feeder.');
  }

  function addCustomEntry(control) {
    if (!control || control.dataset.reteUxSpecify) return;
    control.dataset.reteUxSpecify = '1';
    const bar = document.createElement('div'); bar.className = 'rete-ux-custom no-print'; bar.dataset.centralRouting = '';
    const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Specify another';
    const input = document.createElement('input'); input.type = 'text'; input.hidden = true;
    input.placeholder = 'Enter the verified station / apparatus'; input.setAttribute('aria-label', 'Specify ' + control.name);
    const use = document.createElement('button'); use.type = 'button'; use.textContent = 'Use'; use.hidden = true;
    button.addEventListener('click', () => { input.hidden = !input.hidden; use.hidden = input.hidden; if (!input.hidden) input.focus(); });
    use.addEventListener('click', () => {
      const value = input.value.trim(); if (!value) { input.focus(); return; }
      appendOptions(control, [value]); control.value = value;
      control.dispatchEvent(new Event('change', { bubbles: true }));
      input.hidden = true; use.hidden = true;
    });
    bar.append(button, input, use); control.after(bar);
  }

  function suggestions(control, values) {
    if (!control || control.readOnly || control.disabled || control.type !== 'text') return;
    let datalist = fieldLists.get(control);
    if (!datalist) {
      // Reuse the input node and its value, name, ID and existing listeners.
      datalist = document.createElement('datalist'); datalist.id = 'rete-ux-list-' + ++sequence; datalist.dataset.centralRouting = '';
      control.setAttribute('list', datalist.id); control.after(datalist); fieldLists.set(control, datalist);
    }
    const next = unique(values);
    if (datalist.options.length === next.length && next.every((value, index) => datalist.options[index].value === value)) return;
    datalist.replaceChildren(...next.map(value => { const option = document.createElement('option'); option.value = value; return option; }));
    if (!control.placeholder) control.placeholder = 'Choose a suggestion or type';
  }

  function narrativeSuggestions(control, values, label) {
    if (!control || control.dataset.reteUxNarrative) return;
    control.dataset.reteUxNarrative = '1';
    const select = document.createElement('select'); select.className = 'rete-ux-suggestion no-print'; select.dataset.centralRouting = '';
    select.setAttribute('aria-label', label); select.dataset.reteUxSuggestion = '';
    options(select, values, label);
    select.addEventListener('change', () => {
      if (!select.value) return;
      control.value = control.value.trim() ? control.value.trimEnd() + '\n' + select.value : select.value;
      control.dispatchEvent(new Event('input', { bubbles: true }));
      control.dispatchEvent(new Event('change', { bubbles: true }));
      select.value = '';
    });
    control.before(select);
  }

  function officerNames(form, control) {
    const prefix = control.name.replace(/Name$/, '');
    const role = valueOf(form, prefix + 'Role'), region = valueOf(form, prefix + 'Region') || valueOf(form, 'region');
    const normalized = role.toUpperCase();
    const wanted = /REGIONAL ENGINEER|^RE$/.test(normalized) ? 'RE' : /TECHNICAL ENGINEER|^TE$/.test(normalized) ? 'TE' :
      /STORE/.test(normalized) ? 'STORE' : '';
    return personnel.filter(person => {
      const roles = list(person.roles).length ? person.roles : [person.primary_role || person.role];
      const personRegion = person.region_name || person.region || '';
      return (!wanted || roles.some(item => wanted === 'STORE' ? String(item).toUpperCase().includes('STORE') : String(item).toUpperCase() === wanted)) &&
        (!region || !personRegion || /^(?:all(?: regions)?|corporate|head office)$/i.test(personRegion) || key(personRegion) === key(region));
    }).map(person => person.full_name || person.name).filter(Boolean);
  }

  function refreshSuggestions(form) {
    for (const control of form.querySelectorAll('input[type="text"]')) {
      const name = control.name;
      if (/^(?:teamLeader|presenter|supervisor|review|employee|applicant|issuedTo|requestedByName|name_\d+)$/.test(name) || /Name$/.test(name)) {
        suggestions(control, officerNames(form, control));
      } else if (name === 'jobDescription') suggestions(control, constants.jobs());
      else if (/^ppeRemarks_\d+$/.test(name)) suggestions(control, ['Serviceable', 'Replace before use', 'Not required for this task', 'Issued to crew', 'Returned to store', 'Requires inspection']);
      else if (/^reenergise_comment_\d+$/.test(name)) suggestions(control, ['Confirmed by responsible officer', 'Pending verification', 'Not applicable — specify reason']);
      else if (name === 'storePoint') suggestions(control, ['Central Store', 'Headquarters Store', 'Regional Store']);
      else if (/^reqSpec_\d+$/.test(name)) {
        const row = name.split('_').at(-1), category = valueOf(form, 'reqCategory_' + row);
        suggestions(control, category === 'PPE / Safety' ? ['Small', 'Medium', 'Large', 'Extra Large', 'Pair', 'Set'] :
          category === 'Equipment' || category === 'Spare Part' ? ['11 kV', '33 kV', '0.415 kV', '11/0.415 kV', '100 kVA', '200 kVA', '300 kVA', '500 kVA', '15 MVA'] :
          category === 'Material' ? ['11 kV', '33 kV', '50 mm²', '70 mm²', '95 mm²', '150 mm²', '185 mm²', '240 mm²'] : []);
      }
    }
  }

  function relevantChoices(form) {
    const type = form.dataset.formType;
    if (['trouble', 'requisition'].includes(type)) appendOptions(byName(form, 'priority'), ['Normal', 'Urgent', 'Emergency']);
    if (type === 'trouble') {
      appendOptions(byName(form, 'status'), ['Pending', 'In Progress', 'Completed']);
      narrativeSuggestions(byName(form, 'apparatusTrouble'), ['Power transformer', 'Distribution transformer', 'Circuit breaker', 'Isolator / switch', 'RMU', 'Protection relay', 'CT / VT', '33 kV overhead feeder', '11 kV overhead feeder', 'Underground cable'], 'Add apparatus suggestion');
    }
    if (type === 'toolbox') narrativeSuggestions(byName(form, 'talkPoints'), ['Task scope and work limits', 'Site hazards and controls', 'PPE and equipment condition', 'Communication and supervision', 'Emergency contacts and response', 'Permit conditions and clearance'], 'Add a briefing topic');
    if (type === 'risk') for (let index = 0; index < 5; index++) {
      narrativeSuggestions(byName(form, 'ra_source_' + index), ['Live electrical apparatus', 'Overhead conductor', 'Underground cable', 'Work at height', 'Moving traffic', 'Tools / material handling', 'Weather conditions'], 'Add hazard source');
      narrativeSuggestions(byName(form, 'ra_consequence_' + index), ['Electric shock', 'Arc-flash burns', 'Fall injury', 'Equipment damage', 'Traffic injury', 'Manual handling injury', 'Fire'], 'Add possible consequence');
      narrativeSuggestions(byName(form, 'ra_control_' + index), ['Authorised isolation and clearance', 'PPE selected for the task', 'Work area barriers and signage', 'Supervisor briefing', 'Testing / inspection plan', 'Emergency arrangements'], 'Add control to review');
    }
    // Existing safety confirmations and approval statuses remain unchanged.
  }

  function checkForm(form, show = false) {
    let valid = true;
    for (const [startName, endName] of [['from', 'to'], ['approvedFrom', 'approvedTo']]) {
      const start = byName(form, startName), end = byName(form, endName);
      if (!start || !end) continue;
      const invalid = !!start.value && !!end.value && new Date(end.value) <= new Date(start.value);
      end.setCustomValidity(invalid ? 'The end of the period must be after its start.' : '');
      if (invalid) valid = false;
    }
    if (show && !form.reportValidity()) valid = false;
    if (!valid && show) message(form, 'Check the highlighted field before sending. You can still save a draft.', 'error');
    return valid;
  }

  function enhance(form) {
    if (!form || !form.classList.contains('ops-form')) return;
    if (!bound.has(form)) {
      bound.add(form); form.dataset.reteUxVersion = VERSION;
      const note = document.createElement('div'); note.className = 'rete-ux-guide no-print'; note.dataset.centralRouting = '';
      note.textContent = 'Select network details in order. Suggestions stay editable; review them for the work being recorded.';
      form.querySelector('.op-paper')?.prepend(note);
      const status = document.createElement('div'); status.className = 'rete-ux-message no-print'; status.dataset.reteUxMessage = ''; status.dataset.centralRouting = '';
      status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
      form.querySelector('.op-smart-grid')?.after(status);
      const controls = networkFields(form);
      if (!controls.voltage && controls.feeder) {
        const field = document.createElement('div'); field.className = 'op-smart-field rete-ux-filter no-print'; field.dataset.centralRouting = '';
        const label = document.createElement('label'); label.textContent = 'Voltage level · feeder filter';
        const select = document.createElement('select'); select.dataset.reteUxVoltage = ''; select.id = 'rete-ux-voltage-' + ++sequence;
        label.htmlFor = select.id; options(select, ['33 kV', '11 kV', '0.415 kV', '11/0.415 kV', '132 kV', '330 kV'], 'All voltage levels');
        field.append(label, select);
        controls.feeder.closest('.op-smart-field')?.before(field);
      }
      for (const control of [controls.station, controls.feeder]) addCustomEntry(control);
      form.addEventListener('change', event => {
        const control = event.target;
        if (control.matches('[data-rete-ux-suggestion]')) return;
        const name = control.matches('[data-rete-ux-voltage]') ? 'voltage' : control.name;
        if (['state', 'region', 'station', 'location', 'voltage', 'tsp'].includes(name)) refreshNetwork(form, name === 'location' ? 'station' : name, false);
        else if (name === 'feeder') refreshNetwork(form, '', true);
        refreshSuggestions(form); updateOtherInputs(form); checkForm(form);
      });
      form.addEventListener('input', () => checkForm(form));
      form.addEventListener('invalid', event => {
        event.target.setAttribute('aria-invalid', 'true');
        message(form, event.target.validationMessage || 'Check this value.', 'error');
      }, true);
      form.addEventListener('input', event => { if (event.target.validity?.valid) event.target.removeAttribute('aria-invalid'); });
      form.addEventListener('click', event => {
        if (!event.target.closest('[data-send-form]')) return;
        if (!checkForm(form, true)) { event.preventDefault(); event.stopImmediatePropagation(); }
      }, true);
    }
    refreshNetwork(form); relevantChoices(form); refreshSuggestions(form); updateOtherInputs(form);
    if (form.__kedcoReteUxNetworkRestore) restoreNetworkValues(form, form.__kedcoReteUxNetworkRestore);
  }

  function restoreNetworkValues(form, data) {
    if (!form || !data) return;
    delete form.__kedcoReteUxNetworkRestore;
    if (!bound.has(form)) enhance(form);
    for (const name of ['state', 'region', 'station', 'location', 'voltage', 'feeder', 'tsp']) {
      if (data[name] === undefined) continue;
      const control = byName(form, name) || (name === 'voltage' ? form.querySelector('[data-rete-ux-voltage]') : null);
      if (!control) continue;
      const value = String(Array.isArray(data[name]) ? data[name][0] ?? '' : data[name] ?? '');
      if (control.tagName === 'SELECT' && value) appendOptions(control, [value]);
      control.value = value;
    }
    refreshNetwork(form, '', true);
  }

  function updateOtherInputs(form) {
    for (const select of form.querySelectorAll('[data-other-select]')) {
      const target = document.getElementById(select.dataset.otherSelect);
      if (target && form.contains(target)) target.classList.toggle('show', /^Other(?:\s|$)/i.test(select.value));
    }
  }

  async function loadDirectory() {
    if (directoryLoaded || directoryRequest || !global.KEDCO_CENTRAL_EFORM_WORKFLOW?.rpc) return;
    directoryRequest = (async () => {
      try {
        const result = await global.KEDCO_CENTRAL_EFORM_WORKFLOW.rpc('kedco_list_eform_personnel', {});
        if (!result.error && Array.isArray(result.data)) { personnel = result.data; directoryLoaded = true; }
      } catch (_) { /* Forms remain editable while the personnel directory is offline. */ }
      finally { directoryRequest = null; document.querySelectorAll('#formWorkspace .ops-form').forEach(refreshSuggestions); }
    })();
    await directoryRequest;
  }

  function mount() {
    document.querySelectorAll('#formWorkspace .ops-form').forEach(enhance);
    void loadDirectory();
  }
  function scheduleMount() {
    if (mountQueued) return;
    mountQueued = true;
    global.queueMicrotask(() => { mountQueued = false; mount(); });
  }
  async function start() {
    if (global.KEDCO_RETE_PORTAL_READY && await global.KEDCO_RETE_PORTAL_READY === false) return;
    const sheet = document.createElement('link'); sheet.rel = 'stylesheet';
    const scriptUrl = document.currentScript?.src || new URL('../../assets/kedco-rete-form-usability.js', document.baseURI).href;
    sheet.href = new URL('kedco-rete-form-usability.css?v=' + VERSION, scriptUrl).href;
    sheet.dataset.reteUxStyles = ''; document.head.appendChild(sheet);
    mount();
    const workspace = document.getElementById('formWorkspace');
    // Only form replacement is observed. Dropdown writes are outside the
    // observed depth and cannot trigger an enhancement loop.
    if (workspace) new MutationObserver(scheduleMount).observe(workspace, { childList: true });
    global.addEventListener('kedco:rete-shared-ready', () => { void loadDirectory(); });
  }
  global.KEDCO_RETE_FORM_USABILITY = { version: VERSION, mount, enhance, refreshNetwork, restoreNetworkValues, checkForm,
    catalog: networkCatalog, regions: () => unique(constants.maintenance().map(row => row.region)) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { void start(); }, { once: true });
  else void start();
})(window);
