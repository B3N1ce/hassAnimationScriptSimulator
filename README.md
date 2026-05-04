# Aurora Studio
**Design and simulate light animations – tailor-made for Home Assistant.**
*Licht-Animationen entwerfen und simulieren – maßgeschneidert für Home Assistant.*

---

## English

Aurora Studio is a modern, interactive integrated development environment (IDE) for creating and simulating complex Home Assistant light scripts. It allows developers to visualize animations in real-time without needing to switch actual hardware.

![Aurora Studio Preview](https://via.placeholder.com/1200x600?text=Aurora+Studio+Interface+Preview) <!-- Tip: Replace this later with a real screenshot -->

### Features

- **Real-time Simulation:** Experience your YAML scripts visually and instantly. Supports `Nunjucks/Jinja2` for variables and logic.
- **Advanced Color Picker:** Precise color selection in **RGB**, **XY** (Zigbee/Philips Hue standard), and **HS** (Hue-Saturation).
- **YAML Editor:** Full-featured editor (CodeMirror) with syntax highlighting, autocomplete optimization, and YAML validation.
- **Entity Management:** Organize your lights into groups. Intuitive grouping via Drag & Drop (Desktop) or Long-Press (Mobile).
- **Multilingual:** Full support for **German** and **English**.
- **Responsive Design:** Optimized for desktop and mobile devices (including touch gestures).
- **System Log:** Integrated error tracking and notification system for script debugging.

### Tech Stack

- **Core:** HTML5, CSS3 (Vanilla), JavaScript (ES6 Modules)
- **Parser:** [js-yaml](https://github.com/nodeca/js-yaml) & [Nunjucks](https://mozilla.github.io/nunjucks/) (for Jinja2 templates)
- **Editor:** [CodeMirror 5](https://codemirror.net/5/)
- **Branding:** Independent design system (Dracula-inspired) to ensure legal separation from Home Assistant.

### Installation & Getting Started

Since Aurora Studio is designed as a pure client-side web app, no complex installation is required.

1. Clone the repository:
   ```bash
   git clone https://github.com/B3N1ce/hassAnimationScriptSimulator.git
   ```
2. Open `index.html` in a modern web browser.
3. **Alternatively:** Simply host the folder on a web server (e.g., GitHub Pages).

### Usage

#### The Workflow
1. **Scripting:** Write your YAML script in the left panel.
2. **Simulation:** Click **▶ Start** at the top. The lights in the middle panel will react instantly to your commands.
3. **Inspector:** Use the right panel to find colors, check variables, or group entities.
4. **Export:** Save your finished script directly as a `.yaml` file for your Home Assistant `/config/scripts.yaml`.

#### Tips
- **Labels:** Use the `T` icon in the simulation to toggle entity names on and off.
- **Color Curves:** Choose between *Linear*, *Gamma 2.2*, *Gamma 2.8*, or *CIE L** profiles for realistic color reproduction.

### Legal Disclaimer
This project is not officially affiliated with **Home Assistant** or **Nabu Casa Inc.**. The term "Home Assistant" is used descriptively to indicate compatibility of the generated scripts.

---

## Deutsch

Aurora Studio ist eine moderne, interaktive Entwicklungsumgebung (IDE) zur Erstellung und Simulation von komplexen Home Assistant Licht-Skripten. Es ermöglicht Entwicklern, Animationen in Echtzeit zu visualisieren, ohne echte Hardware schalten zu müssen.

### Features

- **Echtzeit-Simulation:** Erlebe deine YAML-Skripte sofort visuell. Unterstützt `Nunjucks/Jinja2` für Variablen und Logik.
- **Advanced Color Picker:** Präzise Farbauswahl in **RGB**, **XY** (Zigbee/Philips Hue Standard) und **HS** (Hue-Saturation).
- **YAML-Editor:** Vollwertiger Editor (CodeMirror) mit Syntax-Highlighting, Autocomplete-Optimierung und YAML-Validierung.
- **Entity-Management:** Verwalte deine Lichter in Gruppen. Intuitive Gruppierung per Drag & Drop (Desktop) oder Long-Press (Mobile).
- **Mehrsprachig:** Vollständige Unterstützung für **Deutsch** und **Englisch**.
- **Responsive Design:** Optimiert für Desktop und mobile Endgeräte (inkl. Touch-Gesten).
- **System Log:** Integriertes Error-Tracking und Benachrichtigungssystem zur Fehleranalyse in Skripten.

### Technologie-Stack

- **Core:** HTML5, CSS3 (Vanilla), JavaScript (ES6 Modules)
- **Parser:** [js-yaml](https://github.com/nodeca/js-yaml) & [Nunjucks](https://mozilla.github.io/nunjucks/) (für Jinja2-Templates)
- **Editor:** [CodeMirror 5](https://codemirror.net/5/)
- **Branding:** Eigenständiges Design-System ("Dracula" inspiriert) zur rechtlichen Trennung von Home Assistant.

### Installation & Start

Da Aurora Studio als reine Client-Side Web-App konzipiert ist, ist keine komplexe Installation nötig.

1. Repository klonen:
   ```bash
   git clone https://github.com/B3N1ce/hassAnimationScriptSimulator.git
   ```
2. Die `index.html` in einem modernen Webbrowser öffnen.
3. **Alternativ:** Den Ordner einfach auf einem Webserver (z. B. GitHub Pages) hosten.

### Bedienung

#### Der Workflow
1. **Scripting:** Schreibe dein YAML-Skript im linken Panel.
2. **Simulation:** Klicke oben auf **▶ Starten**. Die Lampen im mittleren Panel reagieren sofort auf deine Befehle.
3. **Inspector:** Nutze das rechte Panel, um Farben zu finden, Variablen zu prüfen oder Entitäten zu gruppieren.
4. **Export:** Speichere dein fertiges Skript direkt als `.yaml` Datei für deinen Home Assistant `/config/scripts.yaml`.

#### Tipps
- **Labels:** Über das `T`-Icon in der Simulation kannst du die Entitäts-Namen ein- und ausblenden.
- **Farbkurven:** Wähle zwischen *Linear*, *Gamma 2.2*, *Gamma 2.8* oder *CIE L** Profilen für eine realistische Farbdarstellung.

### Rechtlicher Hinweis
Dieses Projekt steht in keiner offiziellen Verbindung zu **Home Assistant** oder **Nabu Casa Inc.**. Der Begriff "Home Assistant" wird lediglich beschreibend verwendet, um die Kompatibilität der erstellten Skripte zu verdeutlichen.