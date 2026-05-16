// js/entityManager.js

import { t } from './i18n.js';

const lamps = new Map();
const otherEntities = {};
let selectedEntityCallback = null;
let currentColorCurve = 'linear';

// Groups & Visibility Storage
let groups = JSON.parse(localStorage.getItem('ha_simulator_groups')) || {};
let hiddenEntities = JSON.parse(localStorage.getItem('ha_simulator_hidden')) || {};

// Canvas State
let canvas, ctx;
let lastFrameTime = performance.now();
let dragTarget = null;
let dragOffset = { x: 0, y: 0 };

export function getGroups() { return groups; }
export function getAvailableEntities() { return Array.from(lamps.keys()); }

function saveGroups() { localStorage.setItem('ha_simulator_groups', JSON.stringify(groups)); }
function saveHidden() { localStorage.setItem('ha_simulator_hidden', JSON.stringify(hiddenEntities)); }

export function initEntityManager(callback) {
    selectedEntityCallback = callback;
    
    canvas = document.getElementById('simulation-canvas');
    if (canvas) {
        ctx = canvas.getContext('2d');
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        
        canvas.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        
        requestAnimationFrame(drawLoop);
    }
}

function resizeCanvas() {
    if (!canvas) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
}

function handleMouseDown(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    dragTarget = null;
    
    // Hit test from top to bottom (reverse order of drawing)
    const lampList = Array.from(lamps.values()).reverse();
    for (const lamp of lampList) {
        const dx = x - lamp.x;
        const dy = y - lamp.y;
        if (Math.sqrt(dx*dx + dy*dy) < 35) { // Lamp radius hit box
            dragTarget = lamp;
            dragOffset.x = dx;
            dragOffset.y = dy;
            
            if (selectedEntityCallback) {
                const rgb = lamp.currentRgb;
                const rgbString = `rgb(${Math.round(rgb[0])}, ${Math.round(rgb[1])}, ${Math.round(rgb[2])})`;
                selectedEntityCallback(lamp.id, rgbString);
            }
            break;
        }
    }
}

function handleMouseMove(e) {
    if (dragTarget && canvas) {
        const rect = canvas.getBoundingClientRect();
        dragTarget.x = e.clientX - rect.left - dragOffset.x;
        dragTarget.y = e.clientY - rect.top - dragOffset.y;
    }
}

function handleMouseUp() {
    dragTarget = null;
}

export function setColorCurve(curve) {
    currentColorCurve = curve;
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

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function drawLoop(now) {
    if (!ctx) return;
    const dt = (now - lastFrameTime) / 1000;
    lastFrameTime = now;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Update State
    lamps.forEach(lamp => {
        if (lamp.transitionEnd > now) {
            const total = lamp.transitionEnd - lamp.transitionStart;
            const elapsed = now - lamp.transitionStart;
            const t = Math.min(1, elapsed / total);
            
            lamp.currentRgb[0] = lerp(lamp.startRgb[0], lamp.targetRgb[0], t);
            lamp.currentRgb[1] = lerp(lamp.startRgb[1], lamp.targetRgb[1], t);
            lamp.currentRgb[2] = lerp(lamp.startRgb[2], lamp.targetRgb[2], t);
            lamp.currentBrightness = lerp(lamp.startBrightness, lamp.targetBrightness, t);
        } else {
            lamp.currentRgb = [...lamp.targetRgb];
            lamp.currentBrightness = lamp.targetBrightness;
        }
    });

    // 1. Draw Glow (Additive)
    ctx.globalCompositeOperation = 'lighter';
    lamps.forEach(lamp => {
        if (lamp.isOff || hiddenEntities[lamp.id]) return;

        const r = applyCurve(lamp.currentRgb[0], currentColorCurve);
        const g = applyCurve(lamp.currentRgb[1], currentColorCurve);
        const b = applyCurve(lamp.currentRgb[2], currentColorCurve);
        
        const baseRadius = 30 + (lamp.currentBrightness / 5);
        const glowRadius = baseRadius * 6; // Grösserer Radius für sanfteren Ausklang
        
        const grad = ctx.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, glowRadius);
        const colorFull = `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, 0.3)`;
        const colorMid = `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, 0.08)`;
        const transparent = `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, 0)`;
        
        grad.addColorStop(0, colorFull);
        grad.addColorStop(0.15, colorFull); // Kleiner Kern
        grad.addColorStop(0.4, colorMid);   // Sanfter Übergang im Mittelfeld
        grad.addColorStop(1, transparent);  // Ganz weiches Auslaufen am Rand
        
        ctx.fillStyle = grad;
        ctx.fillRect(lamp.x - glowRadius, lamp.y - glowRadius, glowRadius * 2, glowRadius * 2);
    });

    // 2. Draw Lamp Bodies (Normal)
    ctx.globalCompositeOperation = 'source-over';
    lamps.forEach(lamp => {
        const isHidden = hiddenEntities[lamp.id];
        ctx.save();
        if (isHidden) ctx.globalAlpha = 0.3;

        const r = applyCurve(lamp.currentRgb[0], currentColorCurve);
        const g = applyCurve(lamp.currentRgb[1], currentColorCurve);
        const b = applyCurve(lamp.currentRgb[2], currentColorCurve);
        
        // Body
        ctx.beginPath();
        ctx.arc(lamp.x, lamp.y, 25, 0, Math.PI * 2);
        ctx.fillStyle = lamp.isOff ? '#222' : `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
        ctx.fill();
        
        // Border
        ctx.strokeStyle = groups[lamp.id] ? '#bd93f9' : '#444';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Label
        ctx.fillStyle = '#888';
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(lamp.id.replace('light.', ''), lamp.x, lamp.y + 40);

        // Group Icon
        if (groups[lamp.id]) {
            ctx.fillText('📁', lamp.x + 20, lamp.y - 20);
        }

        ctx.restore();
    });

    requestAnimationFrame(drawLoop);
}

export function updateLampEntities(doc, roomElement) {
    const foundIds = new Set();

    function findEntities(obj) {
        if (!obj || typeof obj !== 'object') return;
        if (obj.entity_id) {
            const ids = Array.isArray(obj.entity_id) ? obj.entity_id : [obj.entity_id];
            ids.forEach(id => {
                if (typeof id === 'string' && !id.includes('{{')) {
                    let cleanId = id.trim();
                    if (!cleanId.includes('.')) cleanId = "light." + cleanId;
                    foundIds.add(cleanId);
                }
            });
        }
        if (typeof obj === 'string' && obj.includes('.') && !obj.includes('{{') && !obj.includes(' ')) {
            const parts = obj.split('.');
            if (parts.length === 2 && !['action', 'service', 'condition'].includes(parts[1])) {
                 foundIds.add(obj.trim());
            }
        }
        Object.values(obj).forEach(val => findEntities(val));
    }

    findEntities(doc);
    const uniqueIds = Array.from(foundIds).filter(id => id.startsWith('light.'));

    // Remove old lamps
    const currentKeys = Array.from(lamps.keys());
    currentKeys.forEach(id => {
        if (!uniqueIds.includes(id)) lamps.delete(id);
    });

    // Add new lamps
    uniqueIds.forEach((id, index) => {
        if (!lamps.has(id)) {
            lamps.set(id, {
                id,
                x: 100 + (lamps.size * 120),
                y: 100,
                currentRgb: [255, 255, 255],
                startRgb: [255, 255, 255],
                targetRgb: [255, 255, 255],
                currentBrightness: 0,
                startBrightness: 0,
                targetBrightness: 0,
                transitionStart: 0,
                transitionEnd: 0,
                isOff: true
            });
        }
    });

    renderEntityBrowser(uniqueIds);
}

export function setLampColor(id, rgbArray, transition, brightness, isOff) {
    const lamp = lamps.get(id);
    if (lamp) {
        const now = performance.now();
        lamp.startRgb = [...lamp.currentRgb];
        lamp.targetRgb = [...rgbArray];
        lamp.startBrightness = lamp.currentBrightness;
        lamp.targetBrightness = brightness;
        lamp.transitionStart = now;
        lamp.transitionEnd = now + (transition * 1000);
        lamp.isOff = isOff;

        // Update Browser Badge
        const rgbString = `rgb(${Math.round(rgbArray[0])}, ${Math.round(rgbArray[1])}, ${Math.round(rgbArray[2])})`;
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
    lamps.forEach(lamp => {
        lamp.targetRgb = [255, 255, 255];
        lamp.targetBrightness = 0;
        lamp.transitionEnd = 0;
        lamp.isOff = true;
    });

    // Reset browser states
    document.querySelectorAll('.entity-body span').forEach(s => s.innerText = t('off'));
    document.querySelectorAll('.entity-badge').forEach(b => {
        b.style.backgroundColor = '#222';
        b.style.boxShadow = 'none';
    });
}

export function hasModifiedLamps() {
    return Array.from(lamps.values()).some(l => !l.isOff);
}

export function snapLampsToTarget() {
    lamps.forEach(l => l.transitionEnd = 0);
}

// Entity Browser rendering logic (remains mostly same, but uses Map keys)
function renderEntityBrowser(uniqueIds) {
    const list = document.getElementById('entity-list');
    if (!list) return;
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
    item.draggable = !isGroup;

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
            renderEntityBrowser(Array.from(lamps.keys()));
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
            renderEntityBrowser(Array.from(lamps.keys()));
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
            renderEntityBrowser(Array.from(lamps.keys()));
        };
        actions.appendChild(btnUngroup);
    }

    header.appendChild(actions);
    item.appendChild(header);

    const body = document.createElement('div');
    body.className = 'entity-body';
    body.id = 'state-' + id.replace(/\./g, '-');
    body.innerHTML = `
        <div class="entity-badge"></div>
        <span>${t('off')}</span>
    `;
    item.appendChild(body);

    const lamp = lamps.get(id);
    if (lamp && !lamp.isOff) {
        setTimeout(() => setLampColor(id, lamp.currentRgb, 0, lamp.currentBrightness, false), 10);
    }

    return item;
}

function setupDragAndDrop() {
    const items = document.querySelectorAll('.entity-item');
    const lampsList = Array.from(lamps.keys());

    items.forEach(item => {
        if (item.draggable) {
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', item.dataset.id);
                item.style.opacity = '0.5';
            });
            item.addEventListener('dragend', () => {
                item.style.opacity = '1';
                document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
            });
        }
        
        if (item.dataset.isGroup === 'true') {
            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                item.classList.add('drag-over');
            });
            item.addEventListener('dragleave', () => {
                item.classList.remove('drag-over');
            });
            item.addEventListener('drop', (e) => {
                e.preventDefault();
                item.classList.remove('drag-over');
                const childId = e.dataTransfer.getData('text/plain');
                const groupId = item.dataset.id;
                if (childId && groupId && childId !== groupId) {
                    Object.keys(groups).forEach(g => groups[g] = groups[g].filter(c => c !== childId));
                    if (!groups[groupId].includes(childId)) {
                        groups[groupId].push(childId);
                        saveGroups();
                        renderEntityBrowser(Array.from(lamps.keys()));
                    }
                }
            });
        }
    });
}
