// js/entityManager.js

const lamps = {};
const otherEntities = {};
const lampStates = {}; // Speichert die rohen Werte für sofortiges Curve-Switching
import { t } from './i18n.js';
let selectedEntityCallback = null;
let currentColorCurve = 'linear';

// Groups & Visibility Storage
let groups = JSON.parse(localStorage.getItem('ha_simulator_groups')) || {};
let hiddenEntities = JSON.parse(localStorage.getItem('ha_simulator_hidden')) || {};

function saveGroups() { localStorage.setItem('ha_simulator_groups', JSON.stringify(groups)); }
function saveHidden() { localStorage.setItem('ha_simulator_hidden', JSON.stringify(hiddenEntities)); }

export function getGroups() { return groups; }

export function initEntityManager(callback) {
    selectedEntityCallback = callback;
}

export function setColorCurve(curve) {
    currentColorCurve = curve;
    
    // Allen Lampen sofort das neue Farbprofil überstülpen (ohne Transition)
    Object.keys(lampStates).forEach(id => {
        const state = lampStates[id];
        if (lamps[id]) {
            const el = lamps[id];
            let r = applyCurve(state.rgbArray[0], currentColorCurve);
            let g = applyCurve(state.rgbArray[1], currentColorCurve);
            let b = applyCurve(state.rgbArray[2], currentColorCurve);
            const rgbString = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
            el.style.transition = `background-color 0s linear, box-shadow 0s linear`;
            el.style.backgroundColor = state.isOff ? '#222' : rgbString;
            el.style.boxShadow = state.isOff ? 'none' : `0 0 ${20 + state.brightness / 2}px ${state.brightness / 5}px ${rgbString}`;
        }
    });
}

function applyCurve(c, curve) {
    let norm = c / 255;
    if (curve === 'gamma22') {
        return Math.pow(norm, 2.2) * 255;
    } else if (curve === 'gamma28') {
        return Math.pow(norm, 2.8) * 255;
    } else if (curve === 'cie') {
        return (norm <= 0.08) ? (100 * norm / 903.3) * 255 : Math.pow((norm + 0.16) / 1.16, 3) * 255;
    }
    return c;
}

function updateRoomVisibility() {
    Object.keys(lamps).forEach(id => {
        // Hide if it's a group OR explicitly hidden
        if (groups[id] || hiddenEntities[id]) {
            lamps[id].style.display = 'none';
        } else {
            lamps[id].style.display = 'flex';
        }
    });
}

export function updateLampEntities(code, roomElement) {
    const regex = /entity_id:\s*([a-zA-Z0-9_\.]+)|(?:^|\s)-?\s*([a-zA-Z0-9_]+\.[a-zA-Z0-9_]+)/g;
    let match;
    const foundIds = new Set();
    
    while ((match = regex.exec(code)) !== null) {
        let id = match[1] || match[2];
        if (id) {
            id = id.trim();
            // Ignoriere reine Zahlen (wie 0.68 aus dem feuer Skript)
            if (!isNaN(id)) continue; 
            if (id.endsWith('.turn_on') || id.endsWith('.turn_off') || id.endsWith('.toggle')) continue;
            if (!id.includes('.')) id = "light." + id;
            foundIds.add(id);
        }
    }
    
    const uniqueIds = Array.from(foundIds);

    Object.keys(lamps).forEach(id => {
        if (!uniqueIds.includes(id)) {
            lamps[id].remove();
            delete lamps[id];
        }
    });

    uniqueIds.forEach((id, index) => {
        if (id.startsWith('light.')) {
            if (!lamps[id]) {
                const el = document.createElement('div');
                el.className = 'lamp';
                el.style.left = (40 + (Object.keys(lamps).length * 100)) + 'px';
                el.style.top = '50px';
                el.innerHTML = `<div class="lamp-label">${id.replace('light.', '')}</div>`;
                
                el.addEventListener('click', () => {
                    if (selectedEntityCallback) selectedEntityCallback(id, el.style.backgroundColor);
                });

                el.onmousedown = (e) => {
                    let ox = e.clientX - el.offsetLeft;
                    let oy = e.clientY - el.offsetTop;
                    const move = (ev) => {
                        el.style.left = (ev.clientX - ox) + "px";
                        el.style.top = (ev.clientY - oy) + "px";
                    };
                    const up = () => {
                        document.removeEventListener('mousemove', move);
                        document.removeEventListener('mouseup', up);
                    };
                    document.addEventListener('mousemove', move);
                    document.addEventListener('mouseup', up);
                };
                
                roomElement.appendChild(el);
                lamps[id] = el;
                // Initialize default state
                lampStates[id] = { rgbArray: [255,255,255], brightness: 100, isOff: true };
            }
        } else {
            if(!otherEntities[id]) {
                otherEntities[id] = { state: 'off' };
            }
        }
    });

    updateRoomVisibility();
    renderEntityBrowser(uniqueIds);
}

export function setLampColor(id, rgbArray, transition, brightness, isOff) {
    if(lamps[id]) {
        const el = lamps[id];
        lampStates[id] = { rgbArray, brightness, isOff };
        
        let r = applyCurve(rgbArray[0], currentColorCurve);
        let g = applyCurve(rgbArray[1], currentColorCurve);
        let b = applyCurve(rgbArray[2], currentColorCurve);
        
        const rgbString = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
        
        el.style.transition = `background-color ${transition}s linear, box-shadow ${transition}s linear`;
        el.style.backgroundColor = isOff ? '#222' : rgbString;
        el.style.boxShadow = isOff ? 'none' : `0 0 ${20 + brightness / 2}px ${brightness / 5}px ${rgbString}`;
        
        // Update Browser Badge
        const stateBody = document.getElementById('state-' + id.replace(/\./g, '-'));
        if (stateBody) {
            const badge = stateBody.querySelector('.entity-badge');
            const span = stateBody.querySelector('span');
            badge.style.backgroundColor = isOff ? '#222' : rgbString;
            badge.style.boxShadow = isOff ? 'none' : `0 0 5px ${rgbString}`;
            span.innerText = isOff ? t('off') : `${Math.round(brightness)}% | RGB(${Math.round(rgbArray[0])},${Math.round(rgbArray[1])},${Math.round(rgbArray[2])})`;
        }
    }
}

export function resetLamps() {
    Object.values(lamps).forEach(l => {
        l.style.backgroundColor = '#222';
        l.style.boxShadow = 'none';
        l.style.transition = 'background-color 0s linear, box-shadow 0s linear';
    });
    
    // Wichtig: Auch den gespeicherten Zustand zurücksetzen!
    Object.keys(lampStates).forEach(id => {
        lampStates[id].isOff = true;
        lampStates[id].brightness = 0;
    });

    // Reset browser states
    document.querySelectorAll('.entity-body span').forEach(s => s.innerText = t('off'));
    document.querySelectorAll('.entity-badge').forEach(b => {
        b.style.backgroundColor = '#222';
        b.style.boxShadow = 'none';
    });
}

export function snapLampsToTarget() {
    Object.values(lamps).forEach(l => {
        l.style.transition = 'background-color 0s linear, box-shadow 0s linear';
    });
}

function renderEntityBrowser(uniqueIds) {
    const list = document.getElementById('entity-list');
    if(!list) return;
    list.innerHTML = '';
    
    if (uniqueIds.length === 0) {
        list.innerHTML = `<div style="color: #888; font-size: 11px; padding: 10px;">${t('no_entities')}</div>`;
        return;
    }
    
    const standalone = [];
    const groupNodes = {}; 
    
    uniqueIds.forEach(id => {
        if (groups[id]) {
            groupNodes[id] = groups[id]; 
        }
        
        let isChildOf = [];
        Object.keys(groups).forEach(g => {
            if (groups[g].includes(id)) isChildOf.push(g);
        });
        
        if (isChildOf.length > 0) {
            isChildOf.forEach(g => {
                if (!groupNodes[g]) {
                    groupNodes[g] = groups[g];
                }
            });
        } else if (!groups[id]) {
            standalone.push(id);
        }
    });
    
    Object.keys(groupNodes).forEach(g => {
        list.appendChild(createEntityNode(g, true, false));
        groupNodes[g].forEach(child => {
            list.appendChild(createEntityNode(child, false, true, g));
        });
    });
    
    standalone.forEach(id => {
        list.appendChild(createEntityNode(id, false, false));
    });
    
    setupDragAndDrop();
}

function createEntityNode(id, isGroup, isChild, parentId = null) {
    const item = document.createElement('div');
    item.className = 'entity-item' + (isGroup ? ' entity-group' : '') + (isChild ? ' entity-child' : '');
    item.dataset.id = id;
    if (isGroup) item.dataset.isGroup = 'true';
    if (isChild) item.dataset.parentId = parentId;
    item.draggable = !isGroup; // Gruppen können nicht gedraggt werden
    
    const header = document.createElement('div');
    header.className = 'entity-header';
    header.innerHTML = `<div class="entity-id">${id}</div>`;
    
    const actions = document.createElement('div');
    actions.className = 'entity-actions';
    
    const btnVis = document.createElement('button');
    btnVis.className = 'btn-icon' + (!hiddenEntities[id] ? ' active' : '');
    btnVis.innerHTML = '👁';
    btnVis.title = t('toggle_vis');
    btnVis.onclick = () => {
        hiddenEntities[id] = !hiddenEntities[id];
        saveHidden();
        btnVis.classList.toggle('active', !hiddenEntities[id]);
        updateRoomVisibility();
    };
    actions.appendChild(btnVis);
    
    if (!isGroup && !isChild) {
        const btnMakeGroup = document.createElement('button');
        btnMakeGroup.className = 'btn-icon';
        btnMakeGroup.innerHTML = '⊞';
        btnMakeGroup.title = t('mark_group');
        btnMakeGroup.onclick = () => {
            groups[id] = [];
            saveGroups();
            updateRoomVisibility();
            renderEntityBrowser(Object.keys(lamps));
        };
        actions.appendChild(btnMakeGroup);
    }
    
    if (isChild) {
        const btnRemove = document.createElement('button');
        btnRemove.className = 'btn-icon';
        btnRemove.innerHTML = '✖';
        btnRemove.title = t('remove_group');
        btnRemove.onclick = () => {
            groups[parentId] = groups[parentId].filter(c => c !== id);
            saveGroups();
            updateRoomVisibility();
            renderEntityBrowser(Object.keys(lamps));
        };
        actions.appendChild(btnRemove);
    }
    
    if (isGroup) {
        const btnUngroup = document.createElement('button');
        btnUngroup.className = 'btn-icon';
        btnUngroup.innerHTML = '✖';
        btnUngroup.title = t('ungroup');
        btnUngroup.onclick = () => {
            delete groups[id];
            saveGroups();
            updateRoomVisibility();
            renderEntityBrowser(Object.keys(lamps));
        };
        actions.appendChild(btnUngroup);
    }
    
    header.appendChild(actions);
    item.appendChild(header);
    
    // Body (State)
    const body = document.createElement('div');
    body.className = 'entity-body';
    body.id = 'state-' + id.replace(/\./g, '-');
    body.innerHTML = `
        <div class="entity-badge"></div>
        <span>${t('off')}</span>
    `;
    item.appendChild(body);
    
    // Aktuellen Status wiederherstellen falls er schon existiert
    if (lampStates[id] && !lampStates[id].isOff) {
        setTimeout(() => setLampColor(id, lampStates[id].rgbArray, 0, lampStates[id].brightness, false), 10);
    }
    
    return item;
}

let draggedId = null;

function setupDragAndDrop() {
    const items = document.querySelectorAll('.entity-item');
    
    items.forEach(item => {
        if (item.draggable) {
            item.addEventListener('dragstart', (e) => {
                draggedId = item.dataset.id;
                e.dataTransfer.setData('text/plain', draggedId);
                item.style.opacity = '0.5';
            });
            item.addEventListener('dragend', () => {
                item.style.opacity = '1';
                draggedId = null;
                document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
            });
        }
        
        if (item.dataset.isGroup === 'true') {
            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (draggedId && draggedId !== item.dataset.id) {
                    item.classList.add('drag-over');
                }
            });
            item.addEventListener('dragleave', () => {
                item.classList.remove('drag-over');
            });
            item.addEventListener('drop', (e) => {
                e.preventDefault();
                item.classList.remove('drag-over');
                const childId = draggedId || e.dataTransfer.getData('text/plain');
                const groupId = item.dataset.id;
                
                if (childId && groupId && childId !== groupId) {
                    // Von alten Gruppen entfernen
                    Object.keys(groups).forEach(g => {
                        groups[g] = groups[g].filter(c => c !== childId);
                    });
                    
                    if (!groups[groupId].includes(childId)) {
                        groups[groupId].push(childId);
                        saveGroups();
                        renderEntityBrowser(Object.keys(lamps));
                    }
                }
            });
        }
    });
}

export function renderVariables(varsObj) {
    const list = document.getElementById('variable-list');
    if(!list) return;
    list.innerHTML = '';
    
    const keys = Object.keys(varsObj);
    if (keys.length === 0) {
        list.innerHTML = `<div style="color: #888; font-size: 11px; padding: 10px;">${t('no_vars')}</div>`;
        return;
    }
    
    keys.forEach(key => {
        let val = varsObj[key];
        let valStr = typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val);
        
        const item = document.createElement('div');
        item.className = 'var-item';
        item.innerHTML = `
            <div class="var-key">${key}</div>
            <div class="var-val">${valStr}</div>
        `;
        list.appendChild(item);
    });
}

// Re-render when language changes
document.addEventListener('languageChanged', () => {
    // We need the last uniqueIds to re-render. 
    // For simplicity, we just clear and wait for next sync or use a hack.
    // Actually, since app.js calls validateAndSync() which calls this, 
    // we can just wait for the next call or manually trigger it.
});
