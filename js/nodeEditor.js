// js/nodeEditor.js — Bidirectional Node Editor for Aurora Studio

let _editor = null;
let _isSyncing = false;
let _currentDoc = null; // live JS object (source of truth for nodes→YAML)

export function initNodeEditor(cmEditor) {
    _editor = cmEditor;
}

// Called when switching TO the Nodes tab
export function syncYamlToNodes() {
    if (_isSyncing) return;
    const code = _editor.getValue().trim();
    const container = document.getElementById('node-container');
    if (!container) return;
    container.innerHTML = '';

    if (!code) {
        renderEmpty(container);
        return;
    }
    try {
        _currentDoc = jsyaml.load(code);
        if (!_currentDoc || typeof _currentDoc !== 'object') {
            _currentDoc = { sequence: [] };
        }
    } catch (e) {
        container.innerHTML = `<div class="node-empty"><span style="color:#ff5555">YAML error: ${e.message}</span></div>`;
        return;
    }
    renderGraph(container, _currentDoc);
}

// Called after any node edit to push back to CodeMirror
function pushToYaml() {
    if (_isSyncing || !_currentDoc) return;
    _isSyncing = true;
    try {
        const yaml = jsyaml.dump(_currentDoc, { lineWidth: 120, noRefs: true });
        _editor.setValue(yaml);
    } finally {
        _isSyncing = false;
    }
}

// ─── TOP LEVEL RENDERING ───────────────────────────────────────────────────

function renderGraph(container, doc) {
    const graph = el('div', 'node-graph');

    // Header node (alias / mode / icon)
    graph.appendChild(renderHeaderNode(doc));

    // Variables (top-level)
    if (doc.variables) {
        graph.appendChild(connector());
        graph.appendChild(renderVariablesNode(doc, 'variables', doc.variables));
    }

    // Main sequence
    const seq = doc.sequence || [];
    graph.appendChild(connector());
    const seqEl = renderSequence(seq, doc, 'sequence');
    graph.appendChild(seqEl);

    container.appendChild(graph);
}

function renderEmpty(container) {
    const empty = el('div', 'node-empty');
    empty.innerHTML = '<span>No script yet. Start by adding a step.</span>';
    const addBtn = makeAddBtn(() => {
        _currentDoc = { alias: 'My Script', sequence: [] };
        showAddMenu(addBtn, _currentDoc.sequence, null, () => {
            syncYamlToNodes();
            pushToYaml();
        });
    });
    empty.appendChild(addBtn);
    container.appendChild(empty);
}

// ─── SEQUENCE ──────────────────────────────────────────────────────────────

function renderSequence(steps, parentObj, key) {
    const seqEl = el('div', 'node-sequence');

    const rebuild = () => {
        const container = document.getElementById('node-container');
        const graph = container.firstChild;
        // re-render this sequence in place
        const newSeq = renderSequence(parentObj[key], parentObj, key);
        seqEl.parentNode.replaceChild(newSeq, seqEl);
        pushToYaml();
    };

    // Add button at top of empty sequence
    if (steps.length === 0) {
        const addBtn = makeAddBtn(() => showAddMenu(addBtn, steps, null, () => rebuild()));
        seqEl.appendChild(addBtn);
        return seqEl;
    }

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const wrapper = el('div', 'step-wrapper');

        const nodeEl = renderStepNode(step, steps, i, () => rebuild());
        wrapper.appendChild(nodeEl);

        // Connector + add button between steps
        wrapper.appendChild(connector());
        const addBtn = makeAddBtn(() => showAddMenu(addBtn, steps, i + 1, () => rebuild()));
        wrapper.appendChild(addBtn);
        if (i < steps.length - 1) wrapper.appendChild(connector());

        seqEl.appendChild(wrapper);
    }

    return seqEl;
}

// ─── STEP NODE DISPATCH ────────────────────────────────────────────────────

function renderStepNode(step, steps, index, onRebuild) {
    const type = detectType(step);
    const renderers = {
        action:    renderActionNode,
        delay:     renderDelayNode,
        parallel:  renderParallelNode,
        repeat:    renderRepeatNode,
        choose:    renderChooseNode,
        if:        renderIfNode,
        wait:      renderWaitNode,
        variables: renderStepVariablesNode,
    };
    const renderer = renderers[type] || renderUnknownNode;
    return renderer(step, steps, index, onRebuild);
}

function detectType(step) {
    if (step.action || step.service) return 'action';
    if (step.delay !== undefined) return 'delay';
    if (step.parallel) return 'parallel';
    if (step.repeat) return 'repeat';
    if (step.choose) return 'choose';
    if (step.if) return 'if';
    if (step.wait_template || step.wait_for_trigger) return 'wait';
    if (step.variables) return 'variables';
    return 'unknown';
}

// ─── HEADER NODE ───────────────────────────────────────────────────────────

function renderHeaderNode(doc) {
    const node = makeNode('node-type-header', '◈', 'Script');
    const body = node.querySelector('.node-body');

    body.appendChild(makeField('Alias', makeInput(doc.alias || '', v => { doc.alias = v || undefined; pushToYaml(); })));
    body.appendChild(makeField('Mode', (() => {
        const sel = el('select', 'node-select');
        ['single','restart','queued','parallel'].forEach(m => {
            const o = document.createElement('option');
            o.value = m; o.textContent = m;
            if (doc.mode === m) o.selected = true;
            sel.appendChild(o);
        });
        sel.addEventListener('change', () => { doc.mode = sel.value || undefined; pushToYaml(); });
        return sel;
    })()));

    return node;
}

// ─── ACTION NODE ───────────────────────────────────────────────────────────

function renderActionNode(step, steps, index, onRebuild) {
    const node = makeNode('node-type-action', '⚡', 'Action');
    addNodeControls(node, steps, index, onRebuild);
    const body = node.querySelector('.node-body');

    // Action name
    body.appendChild(makeField('Action', makeInput(step.action || step.service || '', v => {
        delete step.service;
        step.action = v;
        pushToYaml();
    }, 'e.g. light.turn_on')));

    // Entity ID
    const entityVal = step.target?.entity_id || step.entity_id || '';
    body.appendChild(makeField('Entity', makeInput(Array.isArray(entityVal) ? entityVal.join(', ') : entityVal, v => {
        const ids = v.split(',').map(s => s.trim()).filter(Boolean);
        step.target = step.target || {};
        step.target.entity_id = ids.length === 1 ? ids[0] : ids;
        pushToYaml();
    }, 'entity_id')));

    // Data fields
    const dataSection = el('div');
    dataSection.appendChild(makeSectionLabel('Data'));
    const dataObj = step.data || {};
    step.data = dataObj;
    renderDataFields(dataSection, dataObj, () => pushToYaml());
    body.appendChild(dataSection);

    return node;
}

// ─── DELAY NODE ────────────────────────────────────────────────────────────

function renderDelayNode(step, steps, index, onRebuild) {
    const node = makeNode('node-type-delay', '⏱', 'Delay');
    addNodeControls(node, steps, index, onRebuild);
    const body = node.querySelector('.node-body');

    let displayVal = '';
    if (typeof step.delay === 'object' && step.delay !== null) {
        displayVal = JSON.stringify(step.delay);
    } else {
        displayVal = String(step.delay ?? '');
    }

    body.appendChild(makeField('Duration', makeInput(displayVal, v => {
        // Try to parse as number, object, or leave as string (HH:MM:SS)
        if (v.startsWith('{')) {
            try { step.delay = JSON.parse(v); } catch { step.delay = v; }
        } else if (!isNaN(parseFloat(v)) && !v.includes(':')) {
            step.delay = parseFloat(v);
        } else {
            step.delay = v;
        }
        pushToYaml();
    }, 'seconds, HH:MM:SS, or {seconds: 2}')));

    return node;
}

// ─── PARALLEL NODE ─────────────────────────────────────────────────────────

function renderParallelNode(step, steps, index, onRebuild) {
    const node = makeNode('node-type-parallel', '⫴', 'Parallel');
    addNodeControls(node, steps, index, onRebuild);
    const body = node.querySelector('.node-body');

    const branches = Array.isArray(step.parallel) ? step.parallel : [step.parallel];
    step.parallel = branches;

    const branchesEl = el('div', 'node-branches');

    const rebuildBranches = () => {
        branchesEl.innerHTML = '';
        renderBranchColumns(branchesEl, branches, onRebuild);
    };

    renderBranchColumns(branchesEl, branches, onRebuild);
    body.appendChild(branchesEl);

    // Add branch button
    const addBranchBtn = el('button', 'btn-add-field');
    addBranchBtn.textContent = '+ Add branch';
    addBranchBtn.onclick = () => {
        branches.push({ sequence: [] });
        rebuildBranches();
        pushToYaml();
    };
    body.appendChild(addBranchBtn);

    return node;
}

function renderBranchColumns(container, branches, onRebuild) {
    branches.forEach((branch, i) => {
        const branchEl = el('div', 'node-branch');
        const label = el('div', 'node-branch-label');
        label.textContent = `Branch ${i + 1}`;

        if (branches.length > 1) {
            const rmBtn = document.createElement('button');
            rmBtn.textContent = ' ✕';
            rmBtn.style.cssText = 'background:none;border:none;color:#ff5555;cursor:pointer;font-size:10px;';
            rmBtn.onclick = () => { branches.splice(i, 1); onRebuild(); pushToYaml(); };
            label.appendChild(rmBtn);
        }

        branchEl.appendChild(label);
        const seq = branch.sequence || [];
        branch.sequence = seq;
        branchEl.appendChild(renderSequence(seq, branch, 'sequence'));
        container.appendChild(branchEl);
    });
}

// ─── REPEAT NODE ───────────────────────────────────────────────────────────

function renderRepeatNode(step, steps, index, onRebuild) {
    const node = makeNode('node-type-repeat', '🔁', 'Repeat');
    addNodeControls(node, steps, index, onRebuild);
    const body = node.querySelector('.node-body');
    const r = step.repeat || {};
    step.repeat = r;

    // Mode selector
    const modeMap = { count: 'Count', while: 'While', for_each: 'For Each' };
    let currentMode = r.count !== undefined ? 'count' : r.while ? 'while' : r.for_each ? 'for_each' : 'count';

    const modeEl = makeField('Mode', (() => {
        const sel = el('select', 'node-select');
        Object.entries(modeMap).forEach(([v, l]) => {
            const o = document.createElement('option');
            o.value = v; o.textContent = l;
            if (v === currentMode) o.selected = true;
            sel.appendChild(o);
        });
        sel.addEventListener('change', () => {
            const m = sel.value;
            delete r.count; delete r.while; delete r.for_each;
            if (m === 'count') r.count = 1;
            else if (m === 'while') r.while = '';
            else r.for_each = '';
            onRebuild(); pushToYaml();
        });
        return sel;
    })());
    body.appendChild(modeEl);

    if (currentMode === 'count') {
        body.appendChild(makeField('Count', makeInput(String(r.count ?? 1), v => { r.count = parseInt(v) || 1; pushToYaml(); })));
    } else if (currentMode === 'while') {
        body.appendChild(makeField('While', makeInput(String(r.while || ''), v => { r.while = v; pushToYaml(); }, '{{ condition }}')));
    } else {
        body.appendChild(makeField('For Each', makeInput(typeof r.for_each === 'string' ? r.for_each : JSON.stringify(r.for_each), v => { r.for_each = v; pushToYaml(); })));
    }

    // Nested sequence
    body.appendChild(makeSectionLabel('Sequence'));
    r.sequence = r.sequence || [];
    body.appendChild(renderSequence(r.sequence, r, 'sequence'));

    return node;
}

// ─── CHOOSE NODE ───────────────────────────────────────────────────────────

function renderChooseNode(step, steps, index, onRebuild) {
    const node = makeNode('node-type-choose', '🔀', 'Choose');
    addNodeControls(node, steps, index, onRebuild);
    const body = node.querySelector('.node-body');
    const choices = Array.isArray(step.choose) ? step.choose : [step.choose].filter(Boolean);
    step.choose = choices;

    const rebuildChoices = () => { onRebuild(); pushToYaml(); };

    choices.forEach((choice, i) => {
        const sec = el('div');
        sec.appendChild(makeSectionLabel(`Option ${i + 1}`));
        choice.conditions = choice.conditions || [];
        const condVal = Array.isArray(choice.conditions)
            ? choice.conditions.map(c => c.value_template || JSON.stringify(c)).join('\n')
            : String(choice.conditions);
        sec.appendChild(makeField('Condition', makeInput(condVal, v => {
            choice.conditions = [{ condition: 'template', value_template: v }];
            pushToYaml();
        }, '{{ template }}')));
        choice.sequence = choice.sequence || [];
        sec.appendChild(renderSequence(choice.sequence, choice, 'sequence'));

        if (choices.length > 1) {
            const rmBtn = el('button', 'btn-add-field');
            rmBtn.textContent = `Remove Option ${i + 1}`;
            rmBtn.style.color = '#ff5555';
            rmBtn.onclick = () => { choices.splice(i, 1); rebuildChoices(); };
            sec.appendChild(rmBtn);
        }
        body.appendChild(sec);
    });

    const addChoiceBtn = el('button', 'btn-add-field');
    addChoiceBtn.textContent = '+ Add option';
    addChoiceBtn.onclick = () => { choices.push({ conditions: [], sequence: [] }); rebuildChoices(); };
    body.appendChild(addChoiceBtn);

    // Default sequence
    body.appendChild(makeSectionLabel('Default (fallback)'));
    step.default = step.default || [];
    body.appendChild(renderSequence(step.default, step, 'default'));

    return node;
}

// ─── IF/THEN/ELSE NODE ─────────────────────────────────────────────────────

function renderIfNode(step, steps, index, onRebuild) {
    const node = makeNode('node-type-if', '↕', 'If / Then / Else');
    addNodeControls(node, steps, index, onRebuild);
    const body = node.querySelector('.node-body');

    const condVal = Array.isArray(step.if)
        ? step.if.map(c => c.value_template || JSON.stringify(c)).join('\n')
        : String(step.if || '');

    body.appendChild(makeField('If', makeInput(condVal, v => {
        step.if = [{ condition: 'template', value_template: v }];
        pushToYaml();
    }, '{{ template }}')));

    body.appendChild(makeSectionLabel('Then'));
    step.then = step.then || [];
    body.appendChild(renderSequence(step.then, step, 'then'));

    body.appendChild(makeSectionLabel('Else'));
    step.else = step.else || [];
    body.appendChild(renderSequence(step.else, step, 'else'));

    return node;
}

// ─── WAIT NODE ─────────────────────────────────────────────────────────────

function renderWaitNode(step, steps, index, onRebuild) {
    const node = makeNode('node-type-wait', '⌛', 'Wait');
    addNodeControls(node, steps, index, onRebuild);
    const body = node.querySelector('.node-body');

    const val = step.wait_template || step.wait_for_trigger || '';
    body.appendChild(makeField('Template', makeInput(String(val), v => {
        delete step.wait_for_trigger;
        step.wait_template = v;
        pushToYaml();
    }, '{{ template }}')));

    if (step.timeout !== undefined) {
        body.appendChild(makeField('Timeout', makeInput(String(step.timeout), v => { step.timeout = v; pushToYaml(); })));
    }

    return node;
}

// ─── VARIABLES NODES ───────────────────────────────────────────────────────

function renderVariablesNode(parentObj, key, vars) {
    const node = makeNode('node-type-variables', '📦', 'Variables');
    const body = node.querySelector('.node-body');
    renderDataFields(body, vars, () => { parentObj[key] = vars; pushToYaml(); });
    return node;
}

function renderStepVariablesNode(step, steps, index, onRebuild) {
    const node = makeNode('node-type-variables', '📦', 'Set Variables');
    addNodeControls(node, steps, index, onRebuild);
    const body = node.querySelector('.node-body');
    step.variables = step.variables || {};
    renderDataFields(body, step.variables, () => pushToYaml());
    return node;
}

function renderUnknownNode(step, steps, index, onRebuild) {
    const node = makeNode('node-type-variables', '?', 'Unknown Step');
    addNodeControls(node, steps, index, onRebuild);
    const body = node.querySelector('.node-body');
    body.innerHTML = `<span style="color:#888;font-size:10px">${JSON.stringify(step)}</span>`;
    return node;
}

// ─── DATA FIELDS (key-value) ───────────────────────────────────────────────

function renderDataFields(container, obj, onChange) {
    const list = el('div');
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = '4px';

    const rebuild = () => {
        list.innerHTML = '';
        renderRows();
    };

    const renderRows = () => {
        Object.keys(obj).forEach(k => {
            const row = el('div', 'node-data-row');
            const keyIn = el('input', 'node-input node-input-key');
            keyIn.placeholder = 'key';
            keyIn.value = k;
            keyIn.addEventListener('change', () => {
                const oldVal = obj[k];
                delete obj[k];
                obj[keyIn.value] = oldVal;
                onChange();
            });

            const valIn = el('input', 'node-input');
            valIn.placeholder = 'value';
            valIn.value = typeof obj[k] === 'object' ? JSON.stringify(obj[k]) : String(obj[k] ?? '');
            valIn.addEventListener('change', () => {
                const v = valIn.value;
                let parsed = v;
                if (!isNaN(parseFloat(v)) && String(parseFloat(v)) === v) parsed = parseFloat(v);
                else if (v === 'true') parsed = true;
                else if (v === 'false') parsed = false;
                else if (v.startsWith('[') || v.startsWith('{')) { try { parsed = JSON.parse(v); } catch {} }
                obj[keyIn.value] = parsed;
                onChange();
            });

            const rm = el('button', 'btn-remove-field');
            rm.textContent = '✕';
            rm.addEventListener('click', () => { delete obj[k]; rebuild(); onChange(); });

            row.appendChild(keyIn);
            row.appendChild(valIn);
            row.appendChild(rm);
            list.appendChild(row);
        });

        const addBtn = el('button', 'btn-add-field');
        addBtn.textContent = '+ Add field';
        addBtn.onclick = () => {
            let newKey = 'key';
            let n = 1;
            while (obj[newKey]) newKey = `key_${n++}`;
            obj[newKey] = '';
            rebuild();
            onChange();
        };
        list.appendChild(addBtn);
    };

    renderRows();
    container.appendChild(list);
}

// ─── ADD STEP MENU ─────────────────────────────────────────────────────────

const STEP_TYPES = [
    { type: 'action',    icon: '⚡', label: 'Action',    template: () => ({ action: 'light.turn_on', target: { entity_id: '' }, data: {} }) },
    { type: 'delay',     icon: '⏱', label: 'Delay',     template: () => ({ delay: 1 }) },
    { type: 'parallel',  icon: '⫴', label: 'Parallel',  template: () => ({ parallel: [{ sequence: [] }, { sequence: [] }] }) },
    { type: 'repeat',    icon: '🔁', label: 'Repeat',    template: () => ({ repeat: { count: 1, sequence: [] } }) },
    { type: 'choose',    icon: '🔀', label: 'Choose',    template: () => ({ choose: [{ conditions: [], sequence: [] }], default: [] }) },
    { type: 'if',        icon: '↕',  label: 'If/Then/Else', template: () => ({ if: [], then: [], else: [] }) },
    { type: 'wait',      icon: '⌛', label: 'Wait',      template: () => ({ wait_template: '{{ true }}' }) },
    { type: 'variables', icon: '📦', label: 'Variables', template: () => ({ variables: {} }) },
];

function showAddMenu(anchorBtn, steps, insertAt, onAdded) {
    // Close any open menus
    document.querySelectorAll('.node-add-menu.open').forEach(m => {
        m.classList.remove('open');
        m.remove();
    });

    const menu = el('div', 'node-add-menu open');
    STEP_TYPES.forEach(({ type, icon, label, template }) => {
        const item = el('div', 'node-add-menu-item');
        item.innerHTML = `<span class="menu-icon">${icon}</span>${label}`;
        item.onclick = () => {
            const newStep = template();
            if (insertAt === null || insertAt === undefined) {
                steps.push(newStep);
            } else {
                steps.splice(insertAt, 0, newStep);
            }
            menu.remove();
            onAdded();
        };
        menu.appendChild(item);
    });

    anchorBtn.style.position = 'relative';
    anchorBtn.appendChild(menu);

    // Close on outside click
    setTimeout(() => {
        document.addEventListener('click', function close(e) {
            if (!menu.contains(e.target) && e.target !== anchorBtn) {
                menu.remove();
                document.removeEventListener('click', close);
            }
        });
    }, 0);
}

// ─── NODE CONTROLS (move up/down, delete) ──────────────────────────────────

function addNodeControls(node, steps, index, onRebuild) {
    const actions = node.querySelector('.node-header-actions');

    if (index > 0) {
        const upBtn = document.createElement('button');
        upBtn.textContent = '↑';
        upBtn.title = 'Move up';
        upBtn.onclick = () => {
            [steps[index], steps[index - 1]] = [steps[index - 1], steps[index]];
            onRebuild(); pushToYaml();
        };
        actions.appendChild(upBtn);
    }

    if (index < steps.length - 1) {
        const downBtn = document.createElement('button');
        downBtn.textContent = '↓';
        downBtn.title = 'Move down';
        downBtn.onclick = () => {
            [steps[index], steps[index + 1]] = [steps[index + 1], steps[index]];
            onRebuild(); pushToYaml();
        };
        actions.appendChild(downBtn);
    }

    const delBtn = document.createElement('button');
    delBtn.textContent = '✕';
    delBtn.title = 'Delete step';
    delBtn.style.color = '#ff5555aa';
    delBtn.onclick = () => {
        steps.splice(index, 1);
        onRebuild(); pushToYaml();
    };
    actions.appendChild(delBtn);
}

// ─── DOM HELPERS ───────────────────────────────────────────────────────────

function el(tag, className) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    return e;
}

function connector() {
    return el('div', 'step-connector');
}

function makeNode(typeClass, icon, title) {
    const node = el('div', `node-item ${typeClass}`);
    node.innerHTML = `
        <div class="node-header">
            <div class="node-header-title">
                <span class="node-header-icon">${icon}</span>
                <span>${title}</span>
            </div>
            <div class="node-header-actions"></div>
        </div>
        <div class="node-body"></div>
    `;
    return node;
}

function makeField(label, inputEl) {
    const field = el('div', 'node-field');
    const lbl = el('span', 'node-field-label');
    lbl.textContent = label;
    field.appendChild(lbl);
    field.appendChild(inputEl);
    return field;
}

function makeInput(value, onChange, placeholder) {
    const inp = el('input', 'node-input');
    inp.type = 'text';
    inp.value = value;
    if (placeholder) inp.placeholder = placeholder;
    inp.addEventListener('change', () => onChange(inp.value));
    return inp;
}

function makeAddBtn(onClick) {
    const btn = el('button', 'node-add-btn');
    btn.textContent = '+';
    btn.title = 'Add step';
    btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(btn); });
    return btn;
}

function makeSectionLabel(text) {
    const s = el('div', 'node-section-label');
    s.textContent = text;
    return s;
}
