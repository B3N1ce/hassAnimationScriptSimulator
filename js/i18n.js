// js/i18n.js

const translations = {
    de: {
        title: "Aurora Studio",
        subheadline: "Licht-Animationen entwerfen und simulieren – maßgeschneidert für Home Assistant.",
        validate_yaml: "✔ YAML Prüfen",
        start: "▶ Starten",
        pause: "⏸ Pause",
        stop: "⏹ Stopp",
        resume: "▶ Weiter",
        yaml_script: "YAML Skript",
        copy_code: "Code kopieren",
        save_yaml: "Als .yaml speichern",
        simulation: "Simulation",
        toggle_labels: "Labels ein/ausblenden",
        inspector: "Inspector",
        color_picker: "Color Picker",
        insert_editor: "In Editor einfügen",
        save_color: "Aktuelle Farbe speichern",
        env_groups: "Umgebung & Gruppen",
        global_vars: "Globale Variablen",
        tab_editor: "Editor",
        tab_preview: "Vorschau",
        tab_tools: "Tools",
        system_log: "System Log",
        clear_all: "Alle löschen",
        no_messages: "Keine Nachrichten",
        enter_code: "Bitte Code eingeben.",
        yaml_correct: "YAML Syntax ist korrekt! ✅",
        yaml_error: "YAML Fehler: ",
        code_copied: "Code kopiert!",
        script_error: "Skript Fehler:\n",
        off: "Aus",
        no_entities: "Keine Entitäten im Skript gefunden.",
        toggle_vis: "Sichtbarkeit umschalten",
        mark_group: "Als Gruppe markieren",
        remove_group: "Aus Gruppe entfernen",
        ungroup: "Gruppe auflösen",
        no_vars: "Keine Variablen definiert.",
        gamma_linear: "Linear (Raw)",
        gamma_22: "Gamma 2.2",
        gamma_28: "Gamma 2.8",
        gamma_cie: "CIE L* (Wahrnehmung)",
        fav_tooltip: "Klicken zum Anwenden, Doppelklick zum Löschen",
        node_editor: "Nodes"
    },
    en: {
        title: "Aurora Studio",
        subheadline: "Design and simulate light animations – tailor-made for Home Assistant.",
        validate_yaml: "✔ Validate YAML",
        start: "▶ Start",
        pause: "⏸ Pause",
        stop: "⏹ Stop",
        resume: "▶ Resume",
        yaml_script: "YAML Script",
        copy_code: "Copy code",
        save_yaml: "Save as .yaml",
        simulation: "Simulation",
        toggle_labels: "Toggle labels",
        inspector: "Inspector",
        color_picker: "Color Picker",
        insert_editor: "Insert into editor",
        save_color: "Save current color",
        env_groups: "Environment & Groups",
        global_vars: "Global Variables",
        tab_editor: "Editor",
        tab_preview: "Preview",
        tab_tools: "Tools",
        system_log: "System Log",
        clear_all: "Clear all",
        no_messages: "No messages",
        enter_code: "Please enter code.",
        yaml_correct: "YAML syntax is correct! ✅",
        yaml_error: "YAML error: ",
        code_copied: "Code copied!",
        script_error: "Script error:\n",
        off: "Off",
        no_entities: "No entities found in script.",
        toggle_vis: "Toggle visibility",
        mark_group: "Mark as group",
        remove_group: "Remove from group",
        ungroup: "Ungroup",
        no_vars: "No variables defined.",
        gamma_linear: "Linear (Raw)",
        gamma_22: "Gamma 2.2",
        gamma_28: "Gamma 2.8",
        gamma_cie: "CIE L* (Perceptual)",
        fav_tooltip: "Click to apply, double-click to delete",
        node_editor: "Nodes"
    }
};

let currentLang = localStorage.getItem('ha_simulator_lang') || 'de';

export function getLang() {
    return currentLang;
}

export function setLang(lang) {
    currentLang = lang;
    localStorage.setItem('ha_simulator_lang', lang);
    applyTranslations();
}

export function t(key) {
    return translations[currentLang][key] || key;
}

export function applyTranslations() {
    // 1. Static Elements in HTML (using data-i18n attribute)
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        if (el.tagName === 'INPUT' && el.type === 'button') {
            el.value = t(key);
        } else {
            el.innerText = t(key);
        }
    });

    // 2. Titles/Tooltips
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        el.title = t(el.dataset.i18nTitle);
    });

    // 3. Special cases (placeholders, etc. if needed)

    // Update Language Button Label
    const langLabel = document.getElementById('lang-label');
    if (langLabel) langLabel.innerText = currentLang.toUpperCase();

    // Trigger update in other modules if needed via event
    document.dispatchEvent(new CustomEvent('languageChanged', { detail: currentLang }));
}
