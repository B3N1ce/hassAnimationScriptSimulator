// js/entityManager.js

import { t } from './i18n.js';
import { initWebGL, resizeWebGL, setBackgroundTexture, renderScene, isWebGLAvailable } from './webglRenderer.js';

const lamps = new Map();
const otherEntities = {};
let selectedEntityCallback = null;
let currentColorCurve = 'linear';

// Groups & Visibility Storage
let groups = JSON.parse(localStorage.getItem('ha_simulator_groups')) || {};
let hiddenEntities = JSON.parse(localStorage.getItem('ha_simulator_hidden')) || {};
let storedPositions = JSON.parse(localStorage.getItem('ha_simulator_lamp_positions')) || {};

// Canvas State
let canvas, ctx;
let canvasRect = null;
let isDirty = true;
let lastFrameTime = performance.now();

// FPS tracking (rendered frames only — skipped frames don't count)
let _fpsFrames = 0;
let _fpsWindowStart = 0;
let _lastFrameRenderTime = 0;
let _statFps = 0;
let _statFrameMs = 0;
let dragTarget = null;
let dragOffset = { x: 0, y: 0 };
let wallColor = { r: 255, g: 255, b: 255 };
let labelsVisible = localStorage.getItem('ha_simulator_labels_visible') !== 'false';
let entitiesVisible = localStorage.getItem('ha_simulator_entities_visible') !== 'false';
let backgroundImage = null;
let lightInfluence = parseFloat(localStorage.getItem('ha_simulator_light_influence')) || 1.0;
let blendMode = localStorage.getItem('ha_simulator_blend_mode') || 'multiply-glow';
let ambientLevel = parseFloat(localStorage.getItem('ha_simulator_ambient')) || 0.02;
let exposure = parseFloat(localStorage.getItem('ha_simulator_exposure')) || 1.0;
let backgroundChangeCallback = null;

// Uploads backgroundImage to WebGL as an aspect-ratio-correct cover crop
// at the current canvas resolution. Re-called on every canvas resize.
function uploadBgTexture() {
    if (!backgroundImage || !canvas) { setBackgroundTexture(null); return; }
    const ca = canvas.width / canvas.height;
    const ia = backgroundImage.width / backgroundImage.height;
    let sx, sy, sw, sh;
    if (ca > ia) {
        sw = canvas.width; sh = canvas.width / ia;
        sx = 0;           sy = (canvas.height - sh) / 2;
    } else {
        sh = canvas.height; sw = canvas.height * ia;
        sx = (canvas.width - sw) / 2; sy = 0;
    }
    const off = document.createElement('canvas');
    off.width  = canvas.width;
    off.height = canvas.height;
    off.getContext('2d').drawImage(backgroundImage, sx, sy, sw, sh);
    setBackgroundTexture(off);
}

export function getGroups() { return groups; }
export function getAvailableEntities() { return Array.from(lamps.keys()); }

function saveGroups() { localStorage.setItem('ha_simulator_groups', JSON.stringify(groups)); }
function saveHidden() { localStorage.setItem('ha_simulator_hidden', JSON.stringify(hiddenEntities)); }
function savePositions() {
    const positions = {};
    lamps.forEach((lamp, id) => {
        positions[id] = { nx: lamp.nx, ny: lamp.ny };
    });
    localStorage.setItem('ha_simulator_lamp_positions', JSON.stringify(positions));
}

export function initEntityManager(callback) {
    selectedEntityCallback = callback;

    canvas = document.getElementById('simulation-canvas');
    if (canvas) {
        ctx = canvas.getContext('2d');
        canvas.style.background = 'transparent';

        // Initialize WebGL renderer first (inserts WebGL canvas behind simulation-canvas)
        initWebGL(canvas.parentElement);

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        canvas.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        // Wall color picker init
        const wallPicker = document.getElementById('picker-wall-color');
        if (wallPicker) {
            wallPicker.addEventListener('input', (e) => {
                const hex = e.target.value;
                wallColor.r = parseInt(hex.slice(1, 3), 16);
                wallColor.g = parseInt(hex.slice(3, 5), 16);
                wallColor.b = parseInt(hex.slice(5, 7), 16);
                isDirty = true;
            });
        }

        requestAnimationFrame(drawLoop);
    }
}

export function setBackgroundImage(url) {
    if (!url) {
        backgroundImage = null;
        setBackgroundTexture(null);
        localStorage.removeItem('ha_simulator_bg');
        isDirty = true;
        if (backgroundChangeCallback) backgroundChangeCallback();
        return;
    }
    const img = new Image();
    img.onload = () => {
        backgroundImage = img;
        uploadBgTexture();
        isDirty = true;
        localStorage.setItem('ha_simulator_bg', url);
        if (backgroundChangeCallback) backgroundChangeCallback();
    };
    img.src = url;
}

export function setOnBackgroundChange(cb) {
    backgroundChangeCallback = cb;
}

export function markDirty() { isDirty = true; }

export function getDebugStats() {
    const now = performance.now();
    const rendering = now - _lastFrameRenderTime < 1200;
    return {
        fps:               rendering ? _statFps : 0,
        frameMs:           rendering ? _statFrameMs : 0,
        canvasW:           canvas ? canvas.width : 0,
        canvasH:           canvas ? canvas.height : 0,
        lmW:               0,
        lmH:               0,
        lampTotal:         lamps.size,
        lampActive:        [...lamps.values()].filter(l => !l.isOff).length,
        lampTransitioning: [...lamps.values()].filter(l => l.transitionEnd > now).length,
        rendering,
    };
}

export function toggleLabels() {
    labelsVisible = !labelsVisible;
    isDirty = true;
    localStorage.setItem('ha_simulator_labels_visible', labelsVisible);
    return labelsVisible;
}

export function getLabelsVisible() {
    return labelsVisible;
}

export function toggleEntities() {
    entitiesVisible = !entitiesVisible;
    isDirty = true;
    localStorage.setItem('ha_simulator_entities_visible', entitiesVisible);
    return entitiesVisible;
}

export function getEntitiesVisible() {
    return entitiesVisible;
}

export function setLightInfluence(val) {
    lightInfluence = parseFloat(val);
    isDirty = true;
    localStorage.setItem('ha_simulator_light_influence', val);
}

export function getLightInfluence() {
    return lightInfluence;
}

export function setBlendMode(mode) {
    blendMode = mode;
    isDirty = true;
    localStorage.setItem('ha_simulator_blend_mode', mode);
}

export function getBlendMode() {
    return blendMode;
}

export function setAmbientLevel(val) {
    ambientLevel = parseFloat(val);
    isDirty = true;
    localStorage.setItem('ha_simulator_ambient', val);
}

export function getAmbientLevel() {
    return ambientLevel;
}

export function setExposure(val) {
    exposure = parseFloat(val);
    isDirty = true;
    localStorage.setItem('ha_simulator_exposure', val);
}

export function getExposure() {
    return exposure;
}

export function hasBackgroundImage() {
    return backgroundImage !== null;
}

export function resizeCanvas() {
    if (!canvas) return;
    const rect = canvas.parentElement.getBoundingClientRect();

    canvas.width  = rect.width;
    canvas.height = rect.height;
    canvasRect = canvas.getBoundingClientRect();

    resizeWebGL(canvas.width, canvas.height);
    if (backgroundImage) uploadBgTexture();

    // Reproject lamp positions from normalized coords to new pixel dimensions
    lamps.forEach(lamp => {
        lamp.x = lamp.nx * canvas.width;
        lamp.y = lamp.ny * canvas.height;
    });

    isDirty = true;
}

export function keepLampsInBounds() {
    if (!canvas) return;
    const mx = 40 / canvas.width;
    const my = 40 / canvas.height;
    lamps.forEach(lamp => {
        lamp.nx = Math.max(mx, Math.min(lamp.nx, 1 - mx));
        lamp.ny = Math.max(my, Math.min(lamp.ny, 1 - my));
        lamp.x  = lamp.nx * canvas.width;
        lamp.y  = lamp.ny * canvas.height;
    });
    isDirty = true;
}

function handleMouseDown(e) {
    if (!entitiesVisible || !canvasRect) return;
    const x = e.clientX - canvasRect.left;
    const y = e.clientY - canvasRect.top;

    dragTarget = null;

    const lampList = [...lamps.values()].reverse();
    for (const lamp of lampList) {
        const dx = x - lamp.x;
        const dy = y - lamp.y;
        if (dx * dx + dy * dy < 35 * 35) {
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
    if (!canvas || !canvasRect) return;
    if (!entitiesVisible) {
        if (canvas.style.cursor !== 'default') {
            canvas.style.cursor = 'default';
        }
        return;
    }
    const mx = e.clientX - canvasRect.left;
    const my = e.clientY - canvasRect.top;

    if (dragTarget) {
        dragTarget.x = mx - dragOffset.x;
        dragTarget.y = my - dragOffset.y;
        canvas.style.cursor = 'grabbing';
    } else {
        let isHovering = false;
        for (const lamp of lamps.values()) {
            const dx = mx - lamp.x;
            const dy = my - lamp.y;
            if (dx * dx + dy * dy < 35 * 35) {
                isHovering = true;
                break;
            }
        }
        canvas.style.cursor = isHovering ? 'move' : 'default';
    }
}

function handleMouseUp() {
    if (dragTarget && canvas) {
        dragTarget.nx = dragTarget.x / canvas.width;
        dragTarget.ny = dragTarget.y / canvas.height;
        savePositions();
    }
    dragTarget = null;
}

export function setColorCurve(curve) {
    currentColorCurve = curve;
    isDirty = true;
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function drawLoop(now) {
    if (!ctx) { requestAnimationFrame(drawLoop); return; }

    const anyTransitioning = dragTarget !== null ||
        (lamps.size > 0 && [...lamps.values()].some(l => l.transitionEnd > now));

    if (!isDirty && !anyTransitioning) {
        requestAnimationFrame(drawLoop);
        return;
    }
    isDirty = false;

    // FPS measurement (only rendered frames, not skipped ones)
    _fpsFrames++;
    _lastFrameRenderTime = now;
    if (now - _fpsWindowStart >= 500) {
        if (_fpsWindowStart > 0) {
            const elapsed = now - _fpsWindowStart;
            _statFps = Math.round(_fpsFrames * 1000 / elapsed);
            _statFrameMs = Math.round(elapsed / _fpsFrames);
        }
        _fpsFrames = 0;
        _fpsWindowStart = now;
    }

    lastFrameTime = now;

    // Update lamp transition state
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

    // WebGL renders background + lighting (all lamps except visibility-hidden ones)
    if (isWebGLAvailable()) {
        renderScene({
            lamps: [...lamps.values()].filter(l => !hiddenEntities[l.id]),
            ambient: ambientLevel,
            wallColor,
            exposure,
            blendMode,
            lightInfluence,
            colorCurve: currentColorCurve,
        });
    } else {
        // Minimal fallback: plain wall color (no lighting)
        ctx.fillStyle = `rgb(${wallColor.r}, ${wallColor.g}, ${wallColor.b})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Entity bodies on the transparent Canvas 2D overlay
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';

    if (entitiesVisible) {
        lamps.forEach(lamp => {
            const isHidden = hiddenEntities[lamp.id];
            ctx.save();
            if (isHidden) ctx.globalAlpha = 0.3;

            const [r, g, b] = lamp.currentRgb;

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
            if (labelsVisible) {
                ctx.fillStyle = '#888';
                ctx.font = 'bold 10px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(lamp.id.replace('light.', ''), lamp.x, lamp.y + 40);
            }

            // Group Icon
            if (groups[lamp.id]) {
                ctx.fillText('📁', lamp.x + 20, lamp.y - 20);
            }

            ctx.restore();
        });
    }

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
            const stored = storedPositions[id];
            let nx, ny;
            if (stored && stored.nx !== undefined) {
                nx = stored.nx;
                ny = stored.ny;
            } else if (stored && canvas) {
                // Migrate old pixel-based format
                nx = stored.x / canvas.width;
                ny = stored.y / canvas.height;
            } else {
                nx = 0.1 + (lamps.size * 0.15);
                ny = 0.15;
            }
            nx = Math.max(0, Math.min(1, nx));
            ny = Math.max(0, Math.min(1, ny));
            lamps.set(id, {
                id,
                nx, ny,
                x: nx * (canvas ? canvas.width  : 600),
                y: ny * (canvas ? canvas.height : 400),
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

    keepLampsInBounds();
    renderEntityBrowser(uniqueIds);
}

export function setLampColor(id, rgbArray, transition, brightness, isOff) {
    const lamp = lamps.get(id);
    if (lamp) {
        isDirty = true;
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
    isDirty = true;
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

// Entity Browser rendering logic
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
    btnVis.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
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
        btnMakeGroup.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`;
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
        btnRemove.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`;
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
        btnUngroup.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
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
