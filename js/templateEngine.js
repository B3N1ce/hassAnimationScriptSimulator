// js/templateEngine.js

// Nunjucks Environment instanziieren
const env = new nunjucks.Environment();

// --- HA Filter nachbauen ---

env.addFilter('float', function(val, defaultVal) {
    const res = parseFloat(val);
    return isNaN(res) ? (defaultVal !== undefined ? defaultVal : 0.0) : res;
});

env.addFilter('int', function(val, defaultVal) {
    const res = parseInt(val, 10);
    return isNaN(res) ? (defaultVal !== undefined ? defaultVal : 0) : res;
});

env.addFilter('round', function(val, precision) {
    precision = precision || 0;
    const factor = Math.pow(10, precision);
    return Math.round(parseFloat(val) * factor) / factor;
});

env.addFilter('random', function(val) {
    if (Array.isArray(val)) {
        return val[Math.floor(Math.random() * val.length)];
    }
    return val;
});

// Enforce a 'dump' filter (equivalent to HA's to_json)
env.addFilter('dump', function(val) {
    return JSON.stringify(val);
});


// --- HA Globals (Mocking) ---

env.addGlobal('state_attr', function(entity_id, attr) {
    console.warn(`Simuliere state_attr(${entity_id}, ${attr}) - Dummy Data`);
    return null; 
});

env.addGlobal('states', function(entity_id) {
    console.warn(`Simuliere states(${entity_id}) - Gebe 'on' zurück.`);
    return "on"; 
});

env.addGlobal('is_state', function(entity_id, state) {
    return true; 
});

export function resolveTemplate(val, vars = {}) {
    // Array rekursiv auflösen
    if (Array.isArray(val)) {
        return val.map(v => resolveTemplate(v, vars));
    }
    
    // Objekte rekursiv auflösen
    if (typeof val === 'object' && val !== null) {
        let res = {};
        for(let k in val) { 
            res[k] = resolveTemplate(val[k], vars); 
        }
        return res;
    }
    
    if (typeof val !== 'string') return val;

    let templateString = val;
    
    // Spezieller Hack für "range(x, y) | random"
    // In Nunjucks gibt es 'range', aber in HA wird es oft wie in Python genutzt
    templateString = templateString.replace(/range\((\d+),\s*(\d+)\)\s*\|\s*random/g, function(match, p1, p2) {
        return `range(${p1}, ${p2}) | random`; 
    });

    // NEU: Wenn das Template exakt ein Ausdruck ist (z.B. "{{ farbliste }}")
    // Nutzen wir den "dump" filter, um Arrays/Objekte als JSON-String zu erhalten 
    // und stellen so den ursprünglichen Typen wieder her.
    const exactMatch = templateString.match(/^\{\{\s*(.*?)\s*\}\}$/);
    if (exactMatch) {
        try {
            // Wichtig: In Klammern setzen, damit Operatoren (+, -) vor dem | dump Filter ausgeführt werden!
            // Sonst wird aus "1 | int + 1 | dump" -> 1 + "1" -> "11" -> 11 Sekunden Delay
            let dumped = env.renderString(`{{ (${exactMatch[1]}) | dump | safe }}`, vars);
            if (dumped && dumped.trim() !== '') {
                let parsed = JSON.parse(dumped);
                // Wenn es kein String ist (also Array, Object, Number, Boolean), direkt zurückgeben
                if (typeof parsed !== 'string') {
                    return parsed;
                } else {
                    // Bei Strings geben wir den String in die normale Evaluierung (für true/false/float fallback)
                    templateString = parsed;
                }
            }
        } catch (e) {
            // Ignorieren und Fallback auf normalen Render
        }
    }

    try {
        let rendered = env.renderString(templateString, vars);
        
        if (typeof rendered === 'string') {
            rendered = rendered.trim();
            // Fallback: If it looks like a JSON array/object that wasn't caught by the exactMatch
            if ((rendered.startsWith('[') && rendered.endsWith(']')) || (rendered.startsWith('{') && rendered.endsWith('}'))) {
                try { return JSON.parse(rendered); } catch(e) {}
            }
            if (rendered.toLowerCase() === 'true') return true;
            if (rendered.toLowerCase() === 'false') return false;
            // Float conversion if it's purely a number
            if (!isNaN(rendered) && rendered !== "") return parseFloat(rendered);
        }
        
        return rendered;
    } catch (e) {
        console.error("Template Rendering Error in:", templateString, "\nError:", e.message);
        return val;
    }
}
