// js/app.js

import { initEntityManager, updateLampEntities, resetLamps, setColorCurve, renderVariables } from './entityManager.js';
import { ColorPicker } from './colorPicker.js';
import { startSimulation, stopSimulation, pauseSimulation, resumeSimulation } from './simulator.js';

let isPlaying = false;
let isPausedState = false;
let editor;
let colorPicker;

const toggleBtn = document.getElementById('toggle-btn');
const pauseBtn = document.getElementById('pause-btn');
const stopBtn = document.getElementById('stop-btn');
const errorBox = document.getElementById('error-msg');
const room = document.getElementById('room');
const btnToggleEntities = document.getElementById('btn-toggle-entities');
const btnCloseEntities = document.getElementById('btn-close-entities');
const entityBrowser = document.getElementById('entity-browser');
const selColorCurve = document.getElementById('sel-color-curve');
const btnCopyCode = document.getElementById('btn-copy-code');
const btnSaveCode = document.getElementById('btn-save-code');

function init() {
    // 1. Init CodeMirror
    editor = CodeMirror.fromTextArea(document.getElementById('code-editor'), {
        mode: 'yaml', 
        theme: 'dracula', 
        lineNumbers: true,
        tabSize: 2,
        extraKeys: {"Tab": function(cm){cm.replaceSelection("  ","end");}}
    });

    // 2. Init Color Picker
    colorPicker = new ColorPicker(editor);

    // 3. Init Entity Manager
    initEntityManager((entityId, bgColor) => {
        // Wenn eine Lampe angeklickt wird, füttere die Farbe in den Color Picker
        colorPicker.setColorFromExternal(bgColor);
    });

    // 4. Sidebar Resizer
    const resizer = document.getElementById('resizer');
    resizer.onmousedown = () => {
        document.onmousemove = (e) => {
            const newWidth = Math.max(300, e.clientX);
            document.getElementById('sidebar').style.width = newWidth + 'px';
            editor.refresh();
        };
        document.onmouseup = () => document.onmousemove = null;
    };

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
        
        const wrapper = editor.getWrapperElement();
        if (running) {
            wrapper.classList.add('disabled-dim');
            toggleBtn.style.display = 'none';
            pauseBtn.style.display = 'block';
            stopBtn.style.display = 'block';
            pauseBtn.innerHTML = paused ? '▶ Weiter' : '⏸ Pause';
        } else {
            wrapper.classList.remove('disabled-dim');
            toggleBtn.style.display = 'block';
            pauseBtn.style.display = 'none';
            stopBtn.style.display = 'none';
        }
    }

    toggleBtn.addEventListener('click', () => {
        if (isPlaying) return;
        
        const doc = validateAndSync();
        if (!doc) return;

        resetLamps();
        setUIRunning(true, false);

        startSimulation(doc, () => {
            setUIRunning(false, false);
            resetLamps();
        }, (err) => {
            showError("Skript Fehler: " + err.message);
            setUIRunning(false, false);
            resetLamps();
        });
    });

    pauseBtn.addEventListener('click', () => {
        if (isPausedState) {
            resumeSimulation();
            setUIRunning(true, false);
        } else {
            pauseSimulation();
            setUIRunning(true, true);
        }
    });

    stopBtn.addEventListener('click', () => {
        stopSimulation();
        resetLamps();
        setUIRunning(false, false);
    });
    
    // 7. Entity Browser Toggle
    btnToggleEntities.addEventListener('click', () => {
        entityBrowser.classList.add('open');
    });
    btnCloseEntities.addEventListener('click', () => {
        entityBrowser.classList.remove('open');
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
            const orig = btnCopyCode.innerText;
            btnCopyCode.innerText = "✅ Kopiert!";
            setTimeout(() => btnCopyCode.innerText = orig, 2000);
        });
    });

    btnSaveCode.addEventListener('click', () => {
        const code = editor.getValue();
        let filename = "animation.yaml";
        try {
            const doc = jsyaml.load(code);
            if (doc && doc.alias) {
                filename = doc.alias.replace(/[^a-z0-9_]/gi, '_').toLowerCase() + ".yaml";
            }
        } catch(e) {}
        
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

    // Initiale Synchronisation
    validateAndSync();
}

function validateAndSync() {
    const code = editor.getValue();
    updateLampEntities(code, room);
    
    // Wenn das Editor-Fenster komplett leer ist, verstecke Fehler und zeige nichts an.
    if (!code.trim()) {
        renderVariables({});
        showError(null);
        if (!isPlaying) {
            toggleBtn.disabled = false;
            toggleBtn.classList.remove('btn-disabled');
        }
        return null;
    }

    try {
        const doc = jsyaml.load(code);
        const vars = (doc && typeof doc === 'object') ? doc.variables : {};
        renderVariables(vars || {});
        showError(null);
        if (!isPlaying) {
            toggleBtn.disabled = false;
            toggleBtn.classList.remove('btn-disabled');
        }
        return doc;
    } catch (e) {
        showError("YAML Fehler:\n" + e.message);
        if (!isPlaying) {
            toggleBtn.disabled = true;
            toggleBtn.classList.add('btn-disabled');
        }
        return null;
    }
}

function showError(msg) {
    if (msg) {
        errorBox.innerText = msg;
        errorBox.style.display = 'block';
    } else {
        errorBox.style.display = 'none';
    }
}



// App starten, sobald DOM bereit
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
