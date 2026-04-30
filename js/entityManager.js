// js/entityManager.js

const lamps = {};
const otherEntities = {};
let selectedEntityCallback = null;

export function initEntityManager(callback) {
    selectedEntityCallback = callback;
}

export function updateLampEntities(code, roomElement) {
    // Sicherere Regex, die "action: light.turn_on" ignoriert
    const regex = /entity_id:\s*([a-zA-Z0-9_\.]+)|(?:^|\s)-?\s*([a-zA-Z0-9_]+\.[a-zA-Z0-9_]+)/g;
    let match;
    const foundIds = new Set();
    
    while ((match = regex.exec(code)) !== null) {
        let id = match[1] || match[2];
        if (id) {
            id = id.trim();
            // Filtern von Services/Actions
            if (id.endsWith('.turn_on') || id.endsWith('.turn_off') || id.endsWith('.toggle')) {
                continue;
            }
            // Wenn kein Domain-Prefix (z.B. grp_badezimmer) => als light. annehmen
            if(!id.includes('.')) id = "light." + id;
            foundIds.add(id);
        }
    }
    
    const uniqueIds = Array.from(foundIds);

    // Alte entfernen
    Object.keys(lamps).forEach(id => {
        if (!uniqueIds.includes(id)) {
            lamps[id].remove();
            delete lamps[id];
        }
    });

    // Neue anlegen
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

                // Drag & Drop ohne CSS Transition Bug (nur left/top manipulieren)
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
            }
        } else {
            if(!otherEntities[id]) {
                otherEntities[id] = { state: 'off' };
            }
        }
    });

    renderEntityBrowser(uniqueIds);
}

export function setLampColor(id, rgbString, transition, brightness, isOff) {
    if(lamps[id]) {
        const el = lamps[id];
        // WICHTIG: Explizit nur background-color und box-shadow animieren!
        // Verhindert das langsame Hinterherziehen beim Drag&Drop
        el.style.transition = `background-color ${transition}s linear, box-shadow ${transition}s linear`;
        el.style.backgroundColor = isOff ? '#222' : rgbString;
        el.style.boxShadow = isOff ? 'none' : `0 0 ${20 + brightness / 2}px ${brightness / 5}px ${rgbString}`;
    }
}

export function resetLamps() {
    Object.values(lamps).forEach(l => {
        l.style.backgroundColor = '#222';
        l.style.boxShadow = 'none';
        l.style.transition = 'background-color 0s linear, box-shadow 0s linear';
    });
}

function renderEntityBrowser(uniqueIds) {
    const list = document.getElementById('entity-list');
    if(!list) return;
    list.innerHTML = '';
    
    if (uniqueIds.length === 0) {
        list.innerHTML = '<div style="color: #888; font-size: 11px; padding: 10px;">Keine Entitäten im Skript gefunden.</div>';
        return;
    }
    
    uniqueIds.forEach(id => {
        const item = document.createElement('div');
        item.className = 'entity-item';
        
        const nameDiv = document.createElement('div');
        nameDiv.className = 'entity-id';
        nameDiv.innerText = id;
        
        const actionDiv = document.createElement('div');
        actionDiv.className = 'entity-actions';
        
        const toggleBtn = document.createElement('button');
        toggleBtn.innerText = 'Toggle';
        toggleBtn.onclick = () => {
            // Simulativer Toggle (eigentlich müsste er sich den State merken)
            console.log(`Toggle ${id}`);
        };
        
        actionDiv.appendChild(toggleBtn);
        item.appendChild(nameDiv);
        item.appendChild(actionDiv);
        list.appendChild(item);
    });
}
