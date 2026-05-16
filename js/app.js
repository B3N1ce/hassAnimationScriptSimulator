// js/app.js

import { initEntityManager, updateLampEntities, resetLamps, hasModifiedLamps, setColorCurve, resizeCanvas, toggleLabels, setBackgroundImage } from './entityManager.js';
import { ColorPicker } from './colorPicker.js';
import { startSimulation, stopSimulation, pauseSimulation, resumeSimulation, setVarUpdateCallback, toggleBreakpoint, breakpoints } from './simulator.js';
import { t, setLang, getLang, applyTranslations } from './i18n.js';
import { initNodeEditor, syncYamlToNodes, updateVariablePanel, updateRuntimeVariablesUI, resetRuntimeVariablesUI, getCurrentRuntimeVars, getCurrentDoc, assignPaths, setCurrentDoc, highlightExecutingNode } from './nodeEditor.js';
import { resolveTemplate } from './templateEngine.js';

let isPlaying = false;
let isPausedState = false;
let editor;
let colorPicker;
let activeLineHandle = null;

const toggleBtn = document.getElementById('toggle-btn');
const stopBtn = document.getElementById('stop-btn');
const btnValidate = document.getElementById('btn-validate');
const room = document.getElementById('room');
const selColorCurve = document.getElementById('sel-color-curve');
const btnCopyCode = document.getElementById('btn-copy-code');
const btnSaveCode = document.getElementById('btn-save-code');
const toastContainer = document.getElementById('toast-container');

const btnNotifications = document.getElementById('btn-notifications');
const notifModal = document.getElementById('notif-modal');
const btnCloseNotifs = document.getElementById('btn-close-notifs');
const btnClearNotifs = document.getElementById('btn-clear-notifs');
const notifBadge = document.getElementById('notif-badge');
const notifList = document.getElementById('notif-list');

let notifications = [];

let labelsVisible = true;

function updateNotifUI() {
    if (notifications.length > 0) {
        notifBadge.style.display = 'block';
        notifBadge.innerText = notifications.length;
    } else {
        notifBadge.style.display = 'none';
    }

    notifList.innerHTML = '';
    if (notifications.length === 0) {
        notifList.innerHTML = `<div style="color: #888; text-align: center; padding: 20px;">${t('no_messages')}</div>`;
        return;
    }

    notifications.forEach(n => {
        const div = document.createElement('div');
        div.className = `notif-item ${n.type}`;
        div.innerHTML = `
            <button class="notif-delete" data-id="${n.id}">&times;</button>
            <div class="notif-time">${n.time}</div>
            <div class="notif-text">${n.msg}</div>
        `;
        notifList.appendChild(div);
    });

    document.querySelectorAll('.notif-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = parseInt(e.target.dataset.id);
            notifications = notifications.filter(n => n.id !== id);
            updateNotifUI();
        });
    });
}

let colorMarks = [];
function updateColorPreviews(cm) {
    colorMarks.forEach(m => m.clear());
    colorMarks = [];
    
    const doc = cm.getDoc();
    const rgbRegex = /\[\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\]/g;
    
    for (let i = 0; i < doc.lineCount(); i++) {
        const text = doc.getLine(i);
        let match;
        while ((match = rgbRegex.exec(text)) !== null) {
            const r = parseInt(match[1]);
            const g = parseInt(match[2]);
            const b = parseInt(match[3]);
            if (r <= 255 && g <= 255 && b <= 255) {
                const marker = document.createElement('span');
                marker.style.display = 'inline-block';
                marker.style.width = '12px';
                marker.style.height = '12px';
                marker.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
                marker.style.border = '1px solid #000';
                marker.style.marginRight = '6px';
                marker.style.verticalAlign = 'middle';
                marker.style.borderRadius = '2px';
                marker.style.boxShadow = '0 0 2px rgba(0,0,0,0.5)';
                marker.title = `RGB: ${r}, ${g}, ${b}`;
                
                const mark = doc.setBookmark({line: i, ch: match.index}, {
                    widget: marker,
                    insertLeft: true
                });
                colorMarks.push(mark);
            }
        }
    }
}

function init() {
    const appContainer = document.getElementById('app-container');
    const resizerLeft = document.getElementById('resizer-left');
    const resizerRight = document.getElementById('resizer-right');

    // 1. Init CodeMirror
    editor = CodeMirror.fromTextArea(document.getElementById('code-editor'), {
        mode: 'yaml',
        theme: 'dracula',
        lineNumbers: true,
        gutters: ["CodeMirror-linenumbers", "breakpoints"],
        tabSize: 2,
        extraKeys: { "Tab": function (cm) { cm.replaceSelection("  ", "end"); } }
    });

    // 1.1 Persistenz: Gespeichertes Skript laden
    const savedScript = localStorage.getItem('ha_animation_script');
    if (savedScript) {
        editor.setValue(savedScript);
    }

    // 1.2 Persistenz: Layout laden (Bereits oben initialisiert)

    // 1.3 Persistenz: Farbraum laden
    const savedCurve = localStorage.getItem('ha_simulator_color_curve');
    if (savedCurve) {
        const selColorCurve = document.getElementById('sel-color-curve');
        if (selColorCurve) {
            selColorCurve.value = savedCurve;
            setColorCurve(savedCurve);
        }
    }

    // Fix: Remove trailing newlines on paste (avoids issues on some mobile devices/HASS copy)
    editor.on('paste', (cm, e) => {
        const text = e.clipboardData.getData('text/plain');
        if (text && text.endsWith('\n')) {
            e.preventDefault();
            const trimmed = text.trimEnd();
            cm.replaceSelection(trimmed);
        }
    });

    // 2. Init Color Picker
    colorPicker = new ColorPicker(editor);

    // 3. Init Node Editor
    initNodeEditor(editor);

    // 4. Set Runtime Variable Callback
    setVarUpdateCallback(updateRuntimeVariablesUI);

    editor.on('change', () => {
        updateColorPreviews(editor);
        if (!isPlaying) {
            validateAndSync();
        }
    });
    
    // Initial call
    updateColorPreviews(editor);

    editor.on("gutterClick", (cm, n) => {
        const result = mapLineToPath(cm, n);
        
        if (!result || !result.path) {
            showToast("Kein gültiger Breakpoint-Schritt gefunden.", "warning");
            return;
        }

        toggleBreakpoint(result.path);
        refreshBreakpointMarkers();
        
        // Push the state to node editor to update its buttons visually
        syncYamlToNodes();
    });

        // Template Resolution Hover & Gutter Highlighting
        document.addEventListener('mousemove', (e) => {
            // Only if YAML view is active
            const yamlView = document.getElementById('view-yaml');
            if (!yamlView || !yamlView.classList.contains('active')) return;

            // Clear all previous force-hovers
            document.querySelectorAll('.breakpoint-hint.force-hover').forEach(el => el.classList.remove('force-hover'));

            const tooltip = document.getElementById('template-tooltip');
            if (!tooltip) return;

            const vars = getCurrentRuntimeVars() || {};

            // Check if mouse is over the editor
            const wrapper = editor.getWrapperElement();
            const rect = wrapper.getBoundingClientRect();
            if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
                tooltip.style.display = 'none';
                return;
            }

            const pos = editor.coordsChar({left: e.clientX, top: e.clientY}, "window");
            
            // 1. Gutter Parent Highlighting
            const mapResult = mapLineToPath(editor, pos.line);
            if (mapResult && mapResult.line !== undefined) {
                const info = editor.lineInfo(mapResult.line);
                if (info && info.gutterMarkers && info.gutterMarkers.breakpoints) {
                    info.gutterMarkers.breakpoints.classList.add('force-hover');
                }
            }

            // 2. Tooltip Logic
            const line = editor.getLine(pos.line);
            if (line && line.includes('{{')) {
                const regex = /\{\{.*?\}\}/g;
                let match;
                let found = false;
                while ((match = regex.exec(line)) !== null) {
                    if (pos.ch >= match.index && pos.ch <= match.index + match[0].length) {
                        try {
                            const resolved = resolveTemplate(match[0], vars);
                            let repeatText = "";
                            if (vars.repeat) {
                                const idx = (vars.repeat.index !== undefined) ? (vars.repeat.index + 1) : "?";
                                repeatText = `[Iter: ${idx}] `;
                            }

                            if (String(resolved) !== String(match[0])) {
                                tooltip.textContent = `↳ ${repeatText}${typeof resolved === 'object' ? JSON.stringify(resolved) : String(resolved)}`;
                            } else {
                                tooltip.textContent = `↳ ${repeatText}(Vorschau: Keine Laufzeitdaten)`;
                            }
                            tooltip.style.display = 'block';
                            tooltip.style.left = (e.clientX + 15) + 'px';
                            tooltip.style.top = (e.clientY + 15) + 'px';
                            found = true;
                            break;
                        } catch(err) {}
                    }
                }
                if (found) return;
            }
            tooltip.style.display = 'none';
        });

    // Tab switching
    document.querySelectorAll('#panel-editor .panel-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('#panel-editor .panel-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.editor-view').forEach(v => v.classList.remove('active'));
            tab.classList.add('active');
            const view = document.getElementById('view-' + tab.dataset.tab);
            if (view) view.classList.add('active');
            if (tab.dataset.tab === 'yaml') {
                editor.refresh();
                refreshBreakpointMarkers();
            } else if (tab.dataset.tab === 'nodes') {
                syncYamlToNodes();
            }
        });
    });

    document.addEventListener('breakpointsChanged', () => {
        refreshBreakpointMarkers();
    });

    // Initial apply translations
    applyTranslations();

    // 3. Init Entity Manager
    initEntityManager((entityId, bgColor) => {
        // Wenn eine Lampe angeklickt wird, füttere die Farbe in den Color Picker
        colorPicker.setColorFromExternal(bgColor);
    });

    // 4. Desktop Resizer Logic
    // Fix initial layout glitch by setting explicit columns
    if (window.innerWidth > 900) {
        const savedLayout = localStorage.getItem('ha_simulator_layout');
        appContainer.style.gridTemplateColumns = savedLayout || "350px 8px 1fr 8px 320px";
        
        // WICHTIG: Canvas nach Layout-Wiederherstellung neu berechnen
        setTimeout(resizeCanvas, 50); 
    }

    let isResizingLeft = false;
    let isResizingRight = false;

    if (resizerLeft) {
        resizerLeft.addEventListener('mousedown', (e) => {
            isResizingLeft = true;
            resizerLeft.classList.add('dragging');
            e.preventDefault();
        });
    }

    if (resizerRight) {
        resizerRight.addEventListener('mousedown', (e) => {
            isResizingRight = true;
            resizerRight.classList.add('dragging');
            e.preventDefault();
        });
    }

    document.addEventListener('mousemove', (e) => {
        if (!isResizingLeft && !isResizingRight) return;

        const containerRect = appContainer.getBoundingClientRect();
        const cols = window.getComputedStyle(appContainer).gridTemplateColumns.split(' ');
        let leftW = parseFloat(cols[0]);
        let rightW = parseFloat(cols[4]);

        if (isResizingLeft) {
            let newLeftW = e.clientX - containerRect.left;
            newLeftW = Math.max(200, Math.min(newLeftW, containerRect.width - rightW - 100));
            appContainer.style.gridTemplateColumns = `${newLeftW}px 8px 1fr 8px ${rightW}px`;
            editor.refresh();
            resizeCanvas();
        } else if (isResizingRight) {
            let newRightW = containerRect.right - e.clientX;
            newRightW = Math.max(200, Math.min(newRightW, containerRect.width - leftW - 100));
            appContainer.style.gridTemplateColumns = `${leftW}px 8px 1fr 8px ${newRightW}px`;
            resizeCanvas();
        }
    });

    document.addEventListener('mouseup', () => {
        if (isResizingLeft) resizerLeft.classList.remove('dragging');
        if (isResizingRight) resizerRight.classList.remove('dragging');
        if (isResizingLeft || isResizingRight) {
            // Layout speichern
            localStorage.setItem('ha_simulator_layout', appContainer.style.gridTemplateColumns);
        }
        isResizingLeft = false;
        isResizingRight = false;
    });

    // 5. Mobile Tabs Logic
    document.querySelectorAll('.mobile-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.mobile-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));

            tab.classList.add('active');
            const targetId = tab.dataset.target;
            document.getElementById(targetId).classList.add('active');

            if (targetId === 'panel-editor') {
                setTimeout(() => editor.refresh(), 50);
            }
        });
    });

    // 5. Editor Change Event
    editor.on('change', () => {
        updateColorPreviews(editor);
        if (!isPlaying) {
            validateAndSync();
        }
        // Persistenz: Script speichern
        localStorage.setItem('ha_animation_script', editor.getValue());
    });

    // 6. New Script Dropdown Logic
    const btnNewScript = document.getElementById('btn-new-script');
    const newScriptMenu = document.getElementById('new-script-menu');

    if (btnNewScript && newScriptMenu) {
        // Toggle Menu
        btnNewScript.addEventListener('click', (e) => {
            e.stopPropagation();
            newScriptMenu.classList.toggle('active');
        });

        // Close when clicking outside
        document.addEventListener('click', () => {
            newScriptMenu.classList.remove('active');
        });

        // Handle Item Clicks
        newScriptMenu.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', () => {
                const action = item.dataset.action;
                
                if (action === 'scratch' || action === 'template') {
                    let content = "";
                    if (action === 'scratch') {
                        content = `alias: New Animation\ndescription: "Clean slate"\nmode: single\nsequence:\n  - `;
                    } else {
                        content = `alias: New Animation\ndescription: "A fresh start"\nmode: single\nsequence:\n  - service: light.turn_on\n    target:\n      entity_id: light.living_room\n    data:\n      rgb_color: [255, 255, 255]\n      brightness_pct: 100`;
                    }

                    // Editor leeren und Template setzen
                    editor.setValue(content);
                    
                    // Lokalen Speicher bereinigen
                    localStorage.setItem('ha_animation_script', content);
                    localStorage.removeItem('ha_simulator_breakpoints');
                    
                    // Simulator State resetten
                    if (breakpoints) breakpoints.clear();
                    refreshBreakpointMarkers();
                    
                    // UI Sync
                    if (typeof validateAndSync === 'function') validateAndSync();
                    
                    showToast(t('new_script_created') || "Neues Skript erstellt", "success");
                }
                
                newScriptMenu.classList.remove('active');
            });
        });
    }

    // 6. Toggle Play/Stop/Pause
    function setUIRunning(running, paused = false) {
        isPlaying = running;
        isPausedState = paused;
        editor.setOption('readOnly', running);
        
        if (running) document.body.classList.add('simulation-running');
        else document.body.classList.remove('simulation-running');

        const wrapper = editor.getWrapperElement();
        if (running) {
            wrapper.classList.add('disabled-dim');
            toggleBtn.innerHTML = paused ? t('resume') : t('pause');
            toggleBtn.className = 'btn-header btn-pause-style';

            stopBtn.innerHTML = t('stop');
            stopBtn.className = 'btn-header btn-stop-style';
            stopBtn.disabled = false;
            stopBtn.classList.remove('btn-disabled');
        } else {
            wrapper.classList.remove('disabled-dim');
            toggleBtn.innerHTML = t('start');
            toggleBtn.className = 'btn-header btn-start';

            stopBtn.innerHTML = t('reset');
            stopBtn.className = 'btn-header btn-reset-style';

            // Reset Button nur aktivieren wenn Lampen modifiziert sind
            const canReset = hasModifiedLamps();
            stopBtn.disabled = !canReset;
            if (canReset) stopBtn.classList.remove('btn-disabled');
            else stopBtn.classList.add('btn-disabled');
        }
    }

    window.onBreakpointHit = (path) => {
        setUIRunning(true, true);
        showToast(`Breakpoint erreicht: ${path}`, 'info');
        highlightExecutingNode(path);
        highlightLineByPath(path);
    };

    toggleBtn.addEventListener('click', () => {
        if (isPlaying) {
            // Wenn es läuft, dann Pause/Resume
            if (isPausedState) {
                highlightExecutingNode(null);
                highlightLineByPath(null);
                resumeSimulation();
                setUIRunning(true, false);
            } else {
                pauseSimulation();
                setUIRunning(true, true);
            }
            return;
        }

        const doc = validateAndSync();
        if (!doc) return;

        resetLamps();
        resetRuntimeVariablesUI();
        setUIRunning(true, false);

        startSimulation(doc, () => {
            setUIRunning(false, false);
        }, (err) => {
            showToast(t('script_error') + err.message, 'error');
            setUIRunning(false, false);
        });
    });

    stopBtn.addEventListener('click', () => {
        if (isPlaying || isPausedState) {
            stopSimulation();
            setUIRunning(false, false);
            highlightExecutingNode(null);
            highlightLineByPath(null);
        } else {
            resetLamps();
            resetRuntimeVariablesUI();
            setUIRunning(false, false); // Update Button State
        }
    });

    // 7. Standalone YAML Validate
    btnValidate.addEventListener('click', () => {
        const code = editor.getValue();
        if (!code.trim()) {
            showToast(t('enter_code'), 'error');
            return;
        }
        try {
            jsyaml.load(code);
            showToast(t('yaml_correct'), 'success');
        } catch (e) {
            showToast(t('yaml_error') + e.message, 'error');
        }
    });

    // 8. Color Curve Selector
    selColorCurve.addEventListener('change', (e) => {
        const val = e.target.value;
        setColorCurve(val);
        localStorage.setItem('ha_simulator_color_curve', val);
        if (!isPlaying) {
            validateAndSync();
        }
    });

    // 9. Copy & Save
    btnCopyCode.addEventListener('click', () => {
        navigator.clipboard.writeText(editor.getValue()).then(() => {
            showToast(t('code_copied'), 'success');
        });
    });

    // 10. Label Toggle
    const btnToggleLabels = document.getElementById('btn-toggle-labels');
    btnToggleLabels.addEventListener('click', () => {
        const isVisible = toggleLabels();
        btnToggleLabels.style.color = isVisible ? '#f8f8f2' : '#555';
    });

    // 11. Background Menu Logic
    const btnBgMenu = document.getElementById('btn-bg-menu');
    const bgDropdownMenu = document.getElementById('bg-dropdown-menu');
    const inputRoomImage = document.getElementById('input-room-image');

    if (btnBgMenu && bgDropdownMenu) {
        // Toggle Menu
        btnBgMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            bgDropdownMenu.classList.toggle('active');
        });

        // Close when clicking outside
        document.addEventListener('click', () => {
            bgDropdownMenu.classList.remove('active');
        });

        // Handle Item Clicks
        bgDropdownMenu.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', () => {
                const action = item.dataset.action;
                const bgUrl = item.dataset.bg;
                
                if (bgUrl) {
                    // Demo-Bild laden
                    setBackgroundImage(bgUrl);
                    bgDropdownMenu.classList.remove('active');
                } else if (action === 'upload') {
                    // Eigenes Bild Trigger
                    inputRoomImage.click();
                    bgDropdownMenu.classList.remove('active');
                } else if (action === 'cancel') {
                    bgDropdownMenu.classList.remove('active');
                }
            });
        });

        // Handle Custom Upload Input
        inputRoomImage.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    setBackgroundImage(ev.target.result);
                };
                reader.readAsDataURL(file);
            }
        });
        
        // Restore from localStorage
        const savedBg = localStorage.getItem('ha_simulator_bg');
        if (savedBg) setBackgroundImage(savedBg);
    }

    btnSaveCode.addEventListener('click', () => {
        const code = editor.getValue();
        let filename = "animation.yaml";
        try {
            const doc = jsyaml.load(code);
            if (doc && doc.alias) {
                filename = doc.alias.replace(/[^a-z0-9_]/gi, '_').toLowerCase() + ".yaml";
            } else {
                // Zeitstempel als Backup
                const now = new Date();
                const ts = now.toISOString().split('T')[0] + "_" + now.getHours() + now.getMinutes();
                filename = `animation_${ts}.yaml`;
            }
        } catch (e) { }

        const blob = new Blob([code], { type: "text/yaml" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    // 10. Notifications Modal
    btnNotifications.addEventListener('click', () => {
        notifModal.style.display = 'flex';
        updateNotifUI();
    });
    btnCloseNotifs.addEventListener('click', () => {
        notifModal.style.display = 'none';
    });
    btnClearNotifs.addEventListener('click', () => {
        notifications = [];
        updateNotifUI();
    });

    // 11. Language Toggle
    const btnLanguage = document.getElementById('btn-language');
    if (btnLanguage) {
        btnLanguage.addEventListener('click', () => {
            const nextLang = getLang() === 'de' ? 'en' : 'de';
            setLang(nextLang);
        });
    }

    document.addEventListener('languageChanged', () => {
        validateAndSync();
    });

    // Initiale Synchronisation
    validateAndSync();
}

function validateAndSync() {
    const code = editor.getValue();

    // Wenn das Editor-Fenster komplett leer ist
    if (!code.trim()) {
        updateLampEntities({}, room);
        updateVariablePanel({});
        if (!isPlaying) {
            toggleBtn.disabled = true;
            toggleBtn.classList.add('btn-disabled');
        }
        return null;
    }

    try {
        const doc = jsyaml.load(code);
        if (doc) setCurrentDoc(doc);
        updateLampEntities(doc || {}, room);

        // Update Global Variable Panel with full discovery
        updateVariablePanel(doc);
        
        // Update Breakpoint Markers in YAML Gutter
        refreshBreakpointMarkers();

        // Prüfen ob das Skript ausführbaren Inhalt hat (sequence nicht leer)
        const hasContent = doc && doc.sequence && Array.isArray(doc.sequence) && doc.sequence.length > 0;

        if (!isPlaying) {
            toggleBtn.disabled = !hasContent;
            if (hasContent) toggleBtn.classList.remove('btn-disabled');
            else toggleBtn.classList.add('btn-disabled');
        }
        return doc;
    } catch (e) {
        if (!isPlaying) {
            toggleBtn.disabled = true;
            toggleBtn.classList.add('btn-disabled');
        }
        return null;
    }
}

window.showToast = function (msg, type = 'success') {
    // Add to notification log
    const time = new Date().toLocaleTimeString();
    notifications.unshift({ id: Date.now() + Math.floor(Math.random() * 1000), time, msg, type });
    if (notifications.length > 10) notifications.pop();
    updateNotifUI();

    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerText = msg;
    toastContainer.appendChild(t);

    // Trigger Reflow for animation
    void t.offsetWidth;
    t.classList.add('show');

    setTimeout(() => {
        t.classList.remove('show');
        setTimeout(() => t.remove(), 300);
    }, 4000);
}

function mapLineToPath(cm, startLine) {
    let targetLine = startLine;
    let m = null;
    let key = null;

    const allowedKeys = ['action', 'service', 'delay', 'parallel', 'repeat', 'choose', 'if', 'wait_template', 'wait_for_trigger', 'variables'];

    while (targetLine >= 0) {
        const text = cm.getLine(targetLine);
        const match = text.match(/^\s*-?\s*([a-z_]+):/);
        if (match && allowedKeys.includes(match[1])) {
            m = match;
            key = match[1];
            break;
        }
        targetLine--;
    }

    if (!m) return { path: null, line: startLine };
    
    let occurrence = 0;
    for (let i = 0; i <= targetLine; i++) {
        const l = cm.getLine(i);
        const match = l.match(/^\s*-?\s*([a-z_]+):/);
        if (match && match[1] === key) {
            occurrence++;
        }
    }
    
    let currentOccurrence = 0;
    let foundPath = null;
    
    function traverse(obj) {
        if (!obj || typeof obj !== 'object' || foundPath) return;
        if (Array.isArray(obj)) {
            obj.forEach(traverse);
        } else {
            if (obj[key] !== undefined && obj.__path) {
                currentOccurrence++;
                if (currentOccurrence === occurrence) {
                    foundPath = obj.__path;
                    return;
                }
            }
            Object.values(obj).forEach(traverse);
        }
    }
    
    traverse(getCurrentDoc());
    return { path: foundPath, line: targetLine };
}

function refreshBreakpointMarkers() {
    if (!editor) return;
    editor.clearGutter("breakpoints");
    const lineCount = editor.lineCount();
    const allowedKeys = ['action', 'service', 'delay', 'parallel', 'repeat', 'choose', 'if', 'wait_template', 'wait_for_trigger', 'variables'];

    for (let i = 0; i < lineCount; i++) {
        const line = editor.getLine(i);
        const match = line.match(/^\s*-?\s*([a-z_]+):/);
        if (match && allowedKeys.includes(match[1])) {
            const result = mapLineToPath(editor, i);
            if (result && result.path) {
                const isActive = breakpoints.has(result.path);
                const marker = document.createElement("div");
                if (isActive) {
                    marker.className = "breakpoint-marker";
                    marker.innerHTML = "●";
                } else {
                    marker.className = "breakpoint-hint";
                    marker.innerHTML = "○";
                    marker.title = "Breakpoint hier setzen";
                }
                editor.setGutterMarker(i, "breakpoints", marker);
            }
        }
    }
}

function highlightLineByPath(path) {
    if (activeLineHandle) {
        editor.removeLineClass(activeLineHandle, "background", "cm-active-step-line");
        activeLineHandle = null;
    }
    
    if (!path) return;
    
    const lineCount = editor.lineCount();
    for (let i = 0; i < lineCount; i++) {
        const result = mapLineToPath(editor, i);
        if (result && result.path === path) {
            activeLineHandle = editor.addLineClass(i, "background", "cm-active-step-line");
            editor.scrollIntoView({line: i, ch: 0}, 200);
            break;
        }
    }
}



// App starten, sobald DOM bereit
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
