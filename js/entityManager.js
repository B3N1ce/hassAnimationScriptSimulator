// js/entityManager.js

import { t } from './i18n.js';

const lamps = new Map();
const otherEntities = {};
let selectedEntityCallback = null;
let currentColorCurve = 'linear';

// Groups & Visibility Storage
let groups = JSON.parse(localStorage.getItem('ha_simulator_groups')) || {};
let hiddenEntities = JSON.parse(localStorage.getItem('ha_simulator_hidden')) || {};
let storedPositions = JSON.parse(localStorage.getItem('ha_simulator_lamp_positions')) || {};

// Lightmap renders at this fraction of the main canvas resolution.
// Lower = faster gradient rendering, slightly softer lighting.
const LM_SCALE = 0.5;

// Canvas State
let canvas, ctx;
let lightMapCanvas, lmCtx;
let glowCanvas, glowCtx;
let bgOffscreenCanvas = null;
let canvasRect = null;
let bgDrawParams = null;
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
let backgroundChangeCallback = null;

function drawSingleGlow(targetCtx, x, y, r, g, b, glowRadius, maxAlpha) {
    const grad = targetCtx.createRadialGradient(x, y, 0, x, y, glowRadius);
    // Normalized inverse-square falloff: f(0)=1, f(1)=0, physically accurate light decay.
    // k controls tightness; stops are denser near the center where curvature is highest
    // to keep interpolation error < 2 gray levels everywhere (imperceptible banding).
    const k = 18;
    const edgeVal = 1 / (1 + k);
    const norm = 1 - edgeVal;
    const rr = Math.round(r), gg = Math.round(g), bb = Math.round(b);
    const stops = [0, 0.05, 0.10, 0.17, 0.25, 0.35, 0.50, 0.70, 1.0];
    for (const t of stops) {
        const alpha = maxAlpha * Math.max(0, (1 / (1 + k * t * t) - edgeVal) / norm);
        grad.addColorStop(t, `rgba(${rr}, ${gg}, ${bb}, ${alpha.toFixed(4)})`);
    }
    targetCtx.fillStyle = grad;
    targetCtx.fillRect(x - glowRadius, y - glowRadius, glowRadius * 2, glowRadius * 2);
}

function updateBgDrawParams() {
    if (!backgroundImage || !canvas) { bgDrawParams = null; bgOffscreenCanvas = null; return; }
    const ca = canvas.width / canvas.height;
    const ia = backgroundImage.width / backgroundImage.height;
    if (ca > ia) {
        bgDrawParams = { x: 0, y: (canvas.height - canvas.width / ia) / 2, w: canvas.width, h: canvas.width / ia };
    } else {
        bgDrawParams = { x: (canvas.width - canvas.height * ia) / 2, y: 0, w: canvas.height * ia, h: canvas.height };
    }
    // Pre-render at display resolution: drawLoop does a fast 1:1 pixel copy each frame
    // instead of re-scaling the (potentially large) source image every frame.
    bgOffscreenCanvas = document.createElement('canvas');
    bgOffscreenCanvas.width = canvas.width;
    bgOffscreenCanvas.height = canvas.height;
    bgOffscreenCanvas.getContext('2d').drawImage(backgroundImage, bgDrawParams.x, bgDrawParams.y, bgDrawParams.w, bgDrawParams.h);
    isDirty = true;
}

export function getGroups() { return groups; }
export function getAvailableEntities() { return Array.from(lamps.keys()); }

function saveGroups() { localStorage.setItem('ha_simulator_groups', JSON.stringify(groups)); }
function saveHidden() { localStorage.setItem('ha_simulator_hidden', JSON.stringify(hiddenEntities)); }
function savePositions() {
    const positions = {};
    lamps.forEach((lamp, id) => {
        positions[id] = { x: lamp.x, y: lamp.y };
    });
    localStorage.setItem('ha_simulator_lamp_positions', JSON.stringify(positions));
}

export function initEntityManager(callback) {
    selectedEntityCallback = callback;
    
    canvas = document.getElementById('simulation-canvas');
    if (canvas) {
        ctx = canvas.getContext('2d');
        
        // LightMap Buffer für Beleuchtungseffekte
        lightMapCanvas = document.createElement('canvas');
        lmCtx = lightMapCanvas.getContext('2d');

        // Half-res glow buffer for Pass 2 in multiply-glow mode
        glowCanvas = document.createElement('canvas');
        glowCtx = glowCanvas.getContext('2d');
        
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
        bgDrawParams = null;
        bgOffscreenCanvas = null;
        localStorage.removeItem('ha_simulator_bg');
        if (backgroundChangeCallback) backgroundChangeCallback();
        return;
    }
    const img = new Image();
    img.onload = () => {
        backgroundImage = img;
        updateBgDrawParams();
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
        fps:              rendering ? _statFps : 0,
        frameMs:          rendering ? _statFrameMs : 0,
        canvasW:          canvas ? canvas.width : 0,
        canvasH:          canvas ? canvas.height : 0,
        lmW:              lightMapCanvas ? lightMapCanvas.width : 0,
        lmH:              lightMapCanvas ? lightMapCanvas.height : 0,
        lampTotal:        lamps.size,
        lampActive:       [...lamps.values()].filter(l => !l.isOff).length,
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

export function hasBackgroundImage() {
    return backgroundImage !== null;
}

export function resizeCanvas() {
    if (!canvas) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    const oldWidth = canvas.width;
    const oldHeight = canvas.height;

    canvas.width = rect.width;
    canvas.height = rect.height;
    canvasRect = canvas.getBoundingClientRect();

    if (lightMapCanvas) {
        lightMapCanvas.width = Math.floor(canvas.width * LM_SCALE);
        lightMapCanvas.height = Math.floor(canvas.height * LM_SCALE);
    }
    if (glowCanvas) {
        glowCanvas.width = Math.floor(canvas.width * LM_SCALE);
        glowCanvas.height = Math.floor(canvas.height * LM_SCALE);
    }

    keepLampsInBounds();
    updateBgDrawParams();
    isDirty = true;
}

export function keepLampsInBounds() {
    if (!canvas) return;
    const margin = 40;
    lamps.forEach(lamp => {
        lamp.x = Math.max(margin, Math.min(lamp.x, canvas.width - margin));
        lamp.y = Math.max(margin, Math.min(lamp.y, canvas.height - margin));
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
    if (dragTarget) {
        savePositions();
    }
    dragTarget = null;
}

export function setColorCurve(curve) {
    currentColorCurve = curve;
    isDirty = true;
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

    const dt = (now - lastFrameTime) / 1000;
    lastFrameTime = now;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (lightMapCanvas) lmCtx.clearRect(0, 0, lightMapCanvas.width, lightMapCanvas.height);

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

    // Precompute curve-corrected RGB once per frame (avoids 6-9 applyCurve calls per lamp)
    const curvedRgb = new Map();
    lamps.forEach((lamp, id) => {
        curvedRgb.set(id, [
            Math.round(applyCurve(lamp.currentRgb[0], currentColorCurve)),
            Math.round(applyCurve(lamp.currentRgb[1], currentColorCurve)),
            Math.round(applyCurve(lamp.currentRgb[2], currentColorCurve)),
        ]);
    });

    // 1. Light Map generieren (Beleuchtungsstärke)
    lmCtx.globalCompositeOperation = 'source-over';
    const amb = ambientLevel;

    if (backgroundImage) {
        lmCtx.fillStyle = `rgb(${Math.round(255 * amb)}, ${Math.round(255 * amb)}, ${Math.round(255 * amb)})`;
    } else {
        lmCtx.fillStyle = `rgb(${Math.round(wallColor.r * amb)}, ${Math.round(wallColor.g * amb)}, ${Math.round(wallColor.b * amb)})`;
    }
    lmCtx.fillRect(0, 0, lightMapCanvas.width, lightMapCanvas.height);

    lmCtx.globalCompositeOperation = 'lighter';
    lamps.forEach(lamp => {
        if (lamp.isOff || hiddenEntities[lamp.id]) return;

        let [r, g, b] = curvedRgb.get(lamp.id);

        if (!backgroundImage) {
            r = (r * wallColor.r) / 255;
            g = (g * wallColor.g) / 255;
            b = (b * wallColor.b) / 255;
        }

        const baseRadius = 35 + (lamp.currentBrightness / 4);
        const glowRadius = baseRadius * 15 * Math.sqrt(lightInfluence);
        const maxAlpha = Math.min(1.0, 0.6 * lightInfluence);

        drawSingleGlow(lmCtx, lamp.x * LM_SCALE, lamp.y * LM_SCALE, r, g, b, glowRadius * LM_SCALE, maxAlpha);
    });

    // 2. Hintergrund zeichnen (Image oder Wall)
    if (backgroundImage && bgOffscreenCanvas) {
        ctx.globalCompositeOperation = 'source-over';
        // Fast 1:1 pixel copy — image was pre-scaled to canvas resolution in updateBgDrawParams
        ctx.drawImage(bgOffscreenCanvas, 0, 0);

        // Apply wall color tint: multiply blend so white = no change, any color tints the image
        if (wallColor.r < 255 || wallColor.g < 255 || wallColor.b < 255) {
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = `rgb(${wallColor.r}, ${wallColor.g}, ${wallColor.b})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Blending nach gewähltem Mischmodus
        if (blendMode === 'multiply-glow') {
            // Pass 1: Multiply lightmap (upscaled from half-res) to illuminate photo
            ctx.globalCompositeOperation = 'multiply';
            ctx.drawImage(lightMapCanvas, 0, 0, canvas.width, canvas.height);

            // Pass 2: Additive glow bloom — rendered at half-res to match lightmap cost
            if (glowCanvas && glowCtx) {
                glowCtx.clearRect(0, 0, glowCanvas.width, glowCanvas.height);
                glowCtx.globalCompositeOperation = 'lighter';
                lamps.forEach(lamp => {
                    if (lamp.isOff || hiddenEntities[lamp.id]) return;
                    const [r, g, b] = curvedRgb.get(lamp.id);
                    const baseRadius = 35 + (lamp.currentBrightness / 4);
                    const glowRadius = baseRadius * 15 * Math.sqrt(lightInfluence);
                    const maxAlpha = Math.min(1.0, 0.6 * lightInfluence) * 0.8;
                    drawSingleGlow(glowCtx, lamp.x * LM_SCALE, lamp.y * LM_SCALE, r, g, b, glowRadius * LM_SCALE, maxAlpha);
                });
                ctx.globalCompositeOperation = 'lighter';
                ctx.drawImage(glowCanvas, 0, 0, canvas.width, canvas.height);
            }
        } else if (blendMode === 'multiply') {
            ctx.globalCompositeOperation = 'multiply';
            ctx.drawImage(lightMapCanvas, 0, 0, canvas.width, canvas.height);
        } else if (blendMode === 'overlay') {
            ctx.globalCompositeOperation = 'overlay';
            ctx.drawImage(lightMapCanvas, 0, 0, canvas.width, canvas.height);
        } else if (blendMode === 'color-dodge') {
            ctx.globalCompositeOperation = 'color-dodge';
            ctx.drawImage(lightMapCanvas, 0, 0, canvas.width, canvas.height);
        }
    } else {
        // Simple background color fallback
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = `rgb(${wallColor.r}, ${wallColor.g}, ${wallColor.b})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.globalCompositeOperation = 'multiply';
        ctx.drawImage(lightMapCanvas, 0, 0, canvas.width, canvas.height);

        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(lightMapCanvas, 0, 0, canvas.width, canvas.height);
    }

    // 5. Lampen-Körper zeichnen
    ctx.globalCompositeOperation = 'source-over';
    if (entitiesVisible) {
        lamps.forEach(lamp => {
            const isHidden = hiddenEntities[lamp.id];
            ctx.save();
            if (isHidden) ctx.globalAlpha = 0.3;
 
            const [r, g, b] = curvedRgb.get(lamp.id);

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
            lamps.set(id, {
                id,
                x: stored ? stored.x : (100 + (lamps.size * 120)),
                y: stored ? stored.y : 100,
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
