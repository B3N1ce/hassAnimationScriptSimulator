# Aurora Studio
**Licht-Animationen entwerfen und simulieren – maßgeschneidert für Home Assistant.**
*Design and simulate light animations – tailor-made for Home Assistant.*

---

Aurora Studio ist eine moderne, interaktive Entwicklungsumgebung (IDE) zur Erstellung und Simulation von komplexen Home Assistant Licht-Skripten. Es ermöglicht Entwicklern, Animationen in Echtzeit zu visualisieren, ohne echte Hardware schalten zu müssen.

![Aurora Studio Preview](https://via.placeholder.com/1200x600?text=Aurora+Studio+Interface+Preview) <!-- Tipp: Ersetze dies später durch einen echten Screenshot -->

## Features

- ** Echtzeit-Simulation:** Erlebe deine YAML-Skripte sofort visuell. Unterstützt `Nunjucks/Jinja2` für Variablen und Logik.
- ** Advanced Color Picker:** Präzise Farbauswahl in **RGB**, **XY** (Zigbee/Philips Hue Standard) und **HS** (Hue-Saturation).
- ** YAML-Editor:** Vollwertiger Editor (CodeMirror) mit Syntax-Highlighting, Autocomplete-Optimierung und YAML-Validierung.
- ** Entity-Management:** Verwalte deine Lichter in Gruppen. Intuitive Gruppierung per Drag & Drop (Desktop) oder Long-Press (Mobile).
- ** Mehrsprachig:** Vollständige Unterstützung für **Deutsch** und **Englisch**.
- ** Responsive Design:** Optimiert für Desktop und mobile Endgeräte (inkl. Touch-Gesten).
- ** System Log:** Integriertes Error-Tracking und Benachrichtigungssystem zur Fehleranalyse in Skripten.

## Technologie-Stack

- **Core:** HTML5, CSS3 (Vanilla), JavaScript (ES6 Modules)
- **Parser:** [js-yaml](https://github.com/nodeca/js-yaml) & [Nunjucks](https://mozilla.github.io/nunjucks/) (für Jinja2-Templates)
- **Editor:** [CodeMirror 5](https://codemirror.net/5/)
- **Branding:** Eigenständiges Design-System ("Dracula" inspiriert) zur rechtlichen Trennung von Home Assistant.

## Installation & Start

Da Aurora Studio als reine Client-Side Web-App konzipiert ist, ist keine komplexe Installation nötig.

1. Repository klonen:
   ```bash
   git clone https://github.com/B3N1ce/hassAnimationScriptSimulator.git
   ```
2. Die `index.html` in einem modernen Webbrowser öffnen.
3. **Alternativ:** Den Ordner einfach auf einem Webserver (z. B. GitHub Pages) hosten.

## Bedienung

### Der Workflow
1. **Scripting:** Schreibe dein YAML-Skript im linken Panel.
2. **Simulation:** Klicke oben auf **▶ Starten**. Die Lampen im mittleren Panel reagieren sofort auf deine Befehle.
3. **Inspector:** Nutze das rechte Panel, um Farben zu finden, Variablen zu prüfen oder Entitäten zu gruppieren.
4. **Export:** Speichere dein fertiges Skript direkt als `.yaml` Datei für deinen Home Assistant `/config/scripts.yaml`.

### Tipps
- **Labels:** Über das `T`-Icon in der Simulation kannst du die Entitäts-Namen ein- und ausblenden.
- **Farbkurven:** Wähle zwischen *Linear*, *Gamma 2.2*, *Gamma 2.8* oder *CIE L** Profilen für eine realistische Farbdarstellung.

## Rechtlicher Hinweis
Dieses Projekt steht in keiner offiziellen Verbindung zu **Home Assistant** oder **Nabu Casa Inc.**. Der Begriff "Home Assistant" wird lediglich beschreibend verwendet, um die Kompatibilität der erstellten Skripte zu verdeutlichen.

---