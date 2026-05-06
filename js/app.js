// js/app.js

import { initEntityManager, updateLampEntities, resetLamps, hasModifiedLamps, setColorCurve } from './entityManager.js';
import { ColorPicker } from './colorPicker.js';
import { startSimulation, stopSimulation, pauseSimulation, resumeSimulation } from './simulator.js';
import { t, setLang, getLang, applyTranslations } from './i18n.js';
import { initNodeEditor, syncYamlToNodes, updateVariablePanel } from './nodeEditor.js';

let isPlaying = false;
let isPausedState = false;
let editor;
let colorPicker;

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

function init() {
    // 1. Init CodeMirror
    editor = CodeMirror.fromTextArea(document.getElementById('code-editor'), {
        mode: 'yaml',
        theme: 'dracula',
        lineNumbers: true,
        tabSize: 2,
        extraKeys: { "Tab": function (cm) { cm.replaceSelection("  ", "end"); } }
    });

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
            } else if (tab.dataset.tab === 'nodes') {
                syncYamlToNodes();
            }
        });
    });

    // Initial apply translations
    applyTranslations();

    // 3. Init Entity Manager
    initEntityManager((entityId, bgColor) => {
        // Wenn eine Lampe angeklickt wird, füttere die Farbe in den Color Picker
        colorPicker.setColorFromExternal(bgColor);
    });

    // 4. Desktop Resizer Logic
    const appContainer = document.getElementById('app-container');
    const resizerLeft = document.getElementById('resizer-left');
    const resizerRight = document.getElementById('resizer-right');

    // Fix initial layout glitch by setting explicit columns
    if (window.innerWidth > 900) {
        appContainer.style.gridTemplateColumns = "350px 8px 1fr 8px 320px";
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
        } else if (isResizingRight) {
            let newRightW = containerRect.right - e.clientX;
            newRightW = Math.max(200, Math.min(newRightW, containerRect.width - leftW - 100));
            appContainer.style.gridTemplateColumns = `${leftW}px 8px 1fr 8px ${newRightW}px`;
        }
    });

    document.addEventListener('mouseup', () => {
        if (isResizingLeft) resizerLeft.classList.remove('dragging');
        if (isResizingRight) resizerRight.classList.remove('dragging');
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
        if (!isPlaying) {
            validateAndSync();
        }
    });

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

    toggleBtn.addEventListener('click', () => {
        if (isPlaying) {
            // Wenn es läuft, dann Pause/Resume
            if (isPausedState) {
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
        } else {
            resetLamps();
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
        setColorCurve(e.target.value);
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
        labelsVisible = !labelsVisible;
        document.querySelectorAll('.lamp-label').forEach(l => {
            l.classList.toggle('hidden', !labelsVisible);
        });
        btnToggleLabels.style.color = labelsVisible ? '#f8f8f2' : '#555';
    });

    btnSaveCode.addEventListener('click', () => {
        const code = editor.getValue();
        let filename = "animation.yaml";
        try {
            const doc = jsyaml.load(code);
            if (doc && doc.alias) {
                filename = doc.alias.replace(/[^a-z0-9_]/gi, '_').toLowerCase() + ".yaml";
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
        updateLampEntities(doc || {}, room);

        // Update Global Variable Panel with full discovery
        updateVariablePanel(doc);

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



// App starten, sobald DOM bereit
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
