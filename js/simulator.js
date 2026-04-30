// js/simulator.js
import { resolveTemplate } from './templateEngine.js';
import { setLampColor } from './entityManager.js';
import { calculateRgbFromInputs } from './colorPicker.js';

let playSessionId = 0;

export function stopSimulation() {
    playSessionId++; 
}

export function startSimulation(doc, onComplete, onError) {
    playSessionId++;
    const sid = playSessionId;
    
    const steps = doc.sequence || (Array.isArray(doc) ? doc : [doc]);
    let vars = {};
    
    if (doc.variables) {
        for (let [k, v] of Object.entries(doc.variables)) {
            vars[k] = resolveTemplate(v, vars);
        }
    }
    
    executeSteps(steps, sid, vars)
        .then(() => {
            if (sid === playSessionId && onComplete) onComplete();
        })
        .catch(err => {
            if (sid === playSessionId && onError) onError(err);
        });
}

// Hilfsfunktion für Bedingungen
function checkCondition(conds, vars) {
    if (!conds) return true;
    const list = Array.isArray(conds) ? conds : [conds];
    
    for (const c of list) {
        if (c.condition === 'template' || c.value_template) {
            const tmpl = c.value_template || c.template;
            const res = resolveTemplate(tmpl, vars);
            if (res !== true && res !== 'true' && res !== 'True' && res !== 1) {
                return false;
            }
        }
        // Weitere conditions wie state, numeric_state könnten hier mock-mäßig ergänzt werden
    }
    return true;
}

async function executeSteps(steps, sid, vars = {}) {
    if (!steps || sid !== playSessionId) return;
    const list = Array.isArray(steps) ? steps : [steps];

    for (const s of list) {
        if (sid !== playSessionId) return;

        try {
            // 1. Variablen verarbeiten
            if (s.variables) {
                for (let [k, v] of Object.entries(s.variables)) {
                    vars[k] = resolveTemplate(v, vars);
                }
            }

            // 2. Parallel
            if (s.parallel) {
                await Promise.all(s.parallel.map(b => executeSteps(b.sequence || b, sid, {...vars})));
            }
            
            // 3. Choose (If/Elseif)
            else if (s.choose) {
                const choices = Array.isArray(s.choose) ? s.choose : [s.choose];
                let matched = false;
                for (const choice of choices) {
                    if (checkCondition(choice.conditions, vars)) {
                        await executeSteps(choice.sequence, sid, vars);
                        matched = true;
                        break;
                    }
                }
                if (!matched && s.default) {
                    await executeSteps(s.default, sid, vars);
                }
            }
            
            // 4. If / Then / Else
            else if (s.if) {
                if (checkCondition(s.if, vars)) {
                    if (s.then) await executeSteps(s.then, sid, vars);
                } else {
                    if (s.else) await executeSteps(s.else, sid, vars);
                }
            }

            // 5. Repeat
            else if (s.repeat) {
                const r = s.repeat;
                let count = 0;
                
                while (sid === playSessionId) {
                    // While Loop
                    if (r.while) {
                        if (!checkCondition(r.while, vars)) break;
                        await executeSteps(r.sequence, sid, vars);
                    }
                    // For Each Loop
                    else if (r.for_each) {
                        const items = resolveTemplate(r.for_each, vars);
                        if (Array.isArray(items)) {
                            for (const item of items) {
                                if (sid !== playSessionId) return;
                                await executeSteps(r.sequence, sid, { ...vars, repeat: { item: item, index: count } });
                                count++;
                            }
                        }
                        break;
                    }
                    // Count Loop
                    else if (r.count !== undefined) {
                        const limit = parseInt(resolveTemplate(r.count, vars));
                        if (count >= limit) break;
                        await executeSteps(r.sequence, sid, { ...vars, repeat: { index: count } });
                        count++;
                    } else {
                        break; // Fallback
                    }
                    
                    // Safety Brake
                    await new Promise(res => setTimeout(res, 10)); 
                }
            }

            // 6. Delay
            else if (s.delay) {
                let ms = 0;
                if (typeof s.delay === 'object') {
                    if(s.delay.hours) ms += parseFloat(resolveTemplate(s.delay.hours, vars)) * 3600000;
                    if(s.delay.minutes) ms += parseFloat(resolveTemplate(s.delay.minutes, vars)) * 60000;
                    if(s.delay.seconds) ms += parseFloat(resolveTemplate(s.delay.seconds, vars)) * 1000;
                    if(s.delay.milliseconds) ms += parseFloat(resolveTemplate(s.delay.milliseconds, vars));
                } else {
                    let secRaw = resolveTemplate(s.delay, vars);
                    // Handle "HH:MM:SS"
                    if(typeof secRaw === 'string' && secRaw.includes(':')) {
                        const parts = secRaw.split(':').map(Number);
                        if(parts.length === 3) ms = (parts[0]*3600 + parts[1]*60 + parts[2]) * 1000;
                    } else {
                        ms = Math.max(0, parseFloat(secRaw) || 0) * 1000;
                    }
                }
                
                // Sleep with interrupt checks
                const end = Date.now() + ms;
                while(Date.now() < end) {
                    if (sid !== playSessionId) return;
                    await new Promise(r => setTimeout(r, Math.min(50, end - Date.now())));
                }
            }

            // 7. Actions / Services
            else if (s.action || s.service) {
                const actionName = s.action || s.service;
                const data = s.data || {};
                const target = s.target?.entity_id || s.entity_id || [];
                const ids = Array.isArray(target) ? target : [target];

                const transition = Math.max(0, parseFloat(resolveTemplate(data.transition || 0, vars)) || 0);
                
                const isOff = actionName.includes('turn_off');
                const { rgbString, brightness } = calculateRgbFromInputs(data, vars, resolveTemplate);

                ids.forEach(id => {
                    // Resolve Template on Entity IDs
                    const resolvedId = resolveTemplate(id, vars);
                    
                    if (Array.isArray(resolvedId)) {
                        resolvedId.forEach(rId => setLampColor(rId, rgbString, transition, brightness, isOff));
                    } else if (typeof resolvedId === 'string' && resolvedId.includes(',')) {
                        resolvedId.split(',').forEach(rId => setLampColor(rId.trim(), rgbString, transition, brightness, isOff));
                    } else {
                        setLampColor(resolvedId, rgbString, transition, brightness, isOff);
                    }
                });
            }
        } catch (err) {
            console.error("Fehler im Skript-Schritt:", err, s);
            throw err; // Werfe den Fehler weiter, um die UI zu benachrichtigen
        }
    }
}
