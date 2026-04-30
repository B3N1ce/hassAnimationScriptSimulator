// js/app.js

import { initEntityManager, updateLampEntities, resetLamps } from './entityManager.js';
import { ColorPicker } from './colorPicker.js';
import { startSimulation, stopSimulation } from './simulator.js';

let isPlaying = false;
let editor;
let colorPicker;

const toggleBtn = document.getElementById('toggle-btn');
const errorBox = document.getElementById('error-msg');
const room = document.getElementById('room');
const btnToggleEntities = document.getElementById('btn-toggle-entities');
const btnCloseEntities = document.getElementById('btn-close-entities');
const entityBrowser = document.getElementById('entity-browser');

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

    // 6. Toggle Play/Stop
    toggleBtn.addEventListener('click', togglePlayState);
    
    // 7. Entity Browser Toggle
    btnToggleEntities.addEventListener('click', () => {
        entityBrowser.classList.add('open');
    });
    btnCloseEntities.addEventListener('click', () => {
        entityBrowser.classList.remove('open');
    });

    // Initiale Synchronisation
    validateAndSync();
}

function validateAndSync() {
    const code = editor.getValue();
    updateLampEntities(code, room);
    
    try {
        const doc = jsyaml.load(code);
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

function togglePlayState() {
    if (!isPlaying) {
        const doc = validateAndSync();
        if (!doc) return;
        
        isPlaying = true;
        toggleBtn.innerText = "◼ Stoppen";
        toggleBtn.className = "btn-stop";
        editor.setOption("readOnly", "nocursor"); // Editor sperren
        
        startSimulation(doc, 
            () => { // onComplete
                resetPlayState();
            },
            (err) => { // onError
                resetPlayState();
                showError("Laufzeitfehler:\n" + err.message);
            }
        );
    } else {
        stopSimulation();
        resetPlayState();
        resetLamps();
    }
}

function resetPlayState() {
    isPlaying = false;
    toggleBtn.innerText = "▶ Animation Starten";
    toggleBtn.className = "btn-start";
    toggleBtn.disabled = false;
    editor.setOption("readOnly", false);
}

// App starten, sobald DOM bereit
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
