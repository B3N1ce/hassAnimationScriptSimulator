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

    try {
        let rendered = env.renderString(templateString, vars);
        
        rendered = rendered.trim();
        if (rendered.toLowerCase() === 'true') return true;
        if (rendered.toLowerCase() === 'false') return false;
        // Float conversion if it's purely a number
        if (!isNaN(rendered) && rendered !== "") return parseFloat(rendered);
        
        return rendered;
    } catch (e) {
        console.error("Template Rendering Error in:", templateString, "\nError:", e.message);
        return val;
    }
}
