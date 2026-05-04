// js/colorPicker.js
import { t } from './i18n.js';

export class ColorPicker {
    constructor(editorInstance) {
        this.editor = editorInstance;
        this.currentMode = 'rgb'; // 'rgb', 'xy', 'hs'
        
        // DOM Elements
        this.tabs = document.querySelectorAll('.color-tab');
        this.pickerColor = document.getElementById('picker-color');
        
        // Inputs
        this.inR = document.getElementById('in-r');
        this.inG = document.getElementById('in-g');
        this.inB = document.getElementById('in-b');
        this.inX = document.getElementById('in-x');
        this.inY = document.getElementById('in-y');
        this.inH = document.getElementById('in-h');
        this.inS = document.getElementById('in-s');
        
        // Groups
        this.groupRgb = document.getElementById('group-rgb');
        this.groupXy = document.getElementById('group-xy');
        this.groupHs = document.getElementById('group-hs');
        
        // Buttons
        this.btnInsert = document.getElementById('btn-insert-color');
        this.btnAddFav = document.getElementById('btn-add-favorite');
        this.favContainer = document.getElementById('favorites-container');
        
        this.favorites = JSON.parse(localStorage.getItem('colorFavorites')) || [];
        
        this.initEvents();
        this.renderFavorites();
    }
    
    initEvents() {
        // Tab Switching
        this.tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.currentMode = tab.dataset.mode;
                
                this.groupRgb.style.display = this.currentMode === 'rgb' ? 'flex' : 'none';
                this.groupXy.style.display = this.currentMode === 'xy' ? 'flex' : 'none';
                this.groupHs.style.display = this.currentMode === 'hs' ? 'flex' : 'none';
            });
        });
        
        // Color Picker (Native) Input
        this.pickerColor.addEventListener('input', () => {
            const hex = this.pickerColor.value;
            const r = parseInt(hex.slice(1,3), 16);
            const g = parseInt(hex.slice(3,5), 16);
            const b = parseInt(hex.slice(5,7), 16);
            this.updateFromRgb(r, g, b);
        });
        
        // RGB Inputs
        [this.inR, this.inG, this.inB].forEach(input => {
            input.addEventListener('change', () => {
                this.updateFromRgb(
                    parseInt(this.inR.value) || 0,
                    parseInt(this.inG.value) || 0,
                    parseInt(this.inB.value) || 0
                );
            });
        });
        
        // XY Inputs
        [this.inX, this.inY].forEach(input => {
            input.addEventListener('change', () => {
                const rgb = this.xyToRgb(parseFloat(this.inX.value) || 0, parseFloat(this.inY.value) || 0);
                this.updateFromRgb(rgb[0], rgb[1], rgb[2]);
            });
        });
        
        // HS Inputs
        [this.inH, this.inS].forEach(input => {
            input.addEventListener('change', () => {
                const rgb = this.hsToRgb(parseInt(this.inH.value) || 0, parseInt(this.inS.value) || 0);
                this.updateFromRgb(rgb[0], rgb[1], rgb[2]);
            });
        });
        
        // Insert Button
        this.btnInsert.addEventListener('click', () => {
            let snippet = '';
            if (this.currentMode === 'rgb') {
                snippet = `rgb_color: [${this.inR.value}, ${this.inG.value}, ${this.inB.value}]`;
            } else if (this.currentMode === 'xy') {
                snippet = `xy_color: [${this.inX.value}, ${this.inY.value}]`;
            } else if (this.currentMode === 'hs') {
                snippet = `hs_color: [${this.inH.value}, ${this.inS.value}]`;
            }
            if (this.editor) {
                this.editor.replaceSelection(snippet);
                this.editor.focus();
            }
        });
        
        // Add Favorite
        this.btnAddFav.addEventListener('click', () => {
            const hex = this.pickerColor.value;
            if (!this.favorites.includes(hex)) {
                this.favorites.push(hex);
                localStorage.setItem('colorFavorites', JSON.stringify(this.favorites));
                this.renderFavorites();
            }
        });
    }
    
    updateFromRgb(r, g, b) {
        // Clamp
        r = Math.max(0, Math.min(255, r));
        g = Math.max(0, Math.min(255, g));
        b = Math.max(0, Math.min(255, b));
        
        // Update UI
        this.inR.value = r;
        this.inG.value = g;
        this.inB.value = b;
        
        const hex = "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
        this.pickerColor.value = hex;
        
        // Update XY
        const xy = this.rgbToXy(r, g, b);
        this.inX.value = xy[0].toFixed(3);
        this.inY.value = xy[1].toFixed(3);
        
        // Update HS
        const hs = this.rgbToHs(r, g, b);
        this.inH.value = Math.round(hs[0]);
        this.inS.value = Math.round(hs[1]);
    }
    
    // Externer Call, wenn eine Entity angeklickt wird
    setColorFromExternal(rgbString) {
        // rgbString ist z.B. "rgb(255, 0, 0)" oder HEX
        if(rgbString.startsWith('rgb')) {
            const match = rgbString.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
            if(match) {
                this.updateFromRgb(parseInt(match[1]), parseInt(match[2]), parseInt(match[3]));
            }
        }
    }
    
    renderFavorites() {
        // Entferne alte favs (aber behalte den Add Button)
        const favs = this.favContainer.querySelectorAll('.favorite-color');
        favs.forEach(f => f.remove());
        
        this.favorites.forEach(hex => {
            const div = document.createElement('div');
            div.className = 'favorite-color';
            div.style.backgroundColor = hex;
            div.title = t('fav_tooltip');
            
            div.onclick = () => {
                const r = parseInt(hex.slice(1,3), 16);
                const g = parseInt(hex.slice(3,5), 16);
                const b = parseInt(hex.slice(5,7), 16);
                this.updateFromRgb(r, g, b);
            };
            
            div.ondblclick = () => {
                this.favorites = this.favorites.filter(f => f !== hex);
                localStorage.setItem('colorFavorites', JSON.stringify(this.favorites));
                this.renderFavorites();
            };
            
            this.favContainer.insertBefore(div, this.btnAddFav);
        });
    }
    
    // --- Math Utilities ---
    
    rgbToXy(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        r = (r > 0.04045) ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
        g = (g > 0.04045) ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
        b = (b > 0.04045) ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
        let X = r * 0.4124 + g * 0.3576 + b * 0.1805;
        let Y = r * 0.2126 + g * 0.7152 + b * 0.0722;
        let Z = r * 0.0193 + g * 0.1192 + b * 0.9505;
        let sum = X + Y + Z;
        return [sum === 0 ? 0 : X / sum, sum === 0 ? 0 : Y / sum];
    }
    
    xyToRgb(x, y, bri = 1) {
        x = Math.max(0.001, Math.min(0.999, parseFloat(x)));
        y = Math.max(0.001, Math.min(0.999, parseFloat(y)));
        let z = 1.0 - x - y;
        let Y = Math.max(0.01, bri); 
        let X = (Y / y) * x;
        let Z = (Y / y) * z;
        let r = X * 1.656492 - Y * 0.354851 - Z * 0.255038;
        let g = -X * 0.707196 + Y * 1.655397 + Z * 0.036152;
        let b = X * 0.051713 - Y * 0.121364 + Z * 1.011530;
        const comp = (c) => {
            c = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1/2.4) - 0.055;
            return Math.round(Math.max(0, Math.min(1, c)) * 255);
        };
        let fR = comp(r), fG = comp(g), fB = comp(b);
        if (fR + fG + fB === 0 && bri > 0) return [50, 50, 50];
        return [fR, fG, fB];
    }
    
    rgbToHs(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        let max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, v = max;
        let d = max - min;
        s = max == 0 ? 0 : d / max;
        if (max == min) {
            h = 0; // achromatic
        } else {
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return [h * 360, s * 100];
    }
    
    hsToRgb(h, s) {
        h /= 360; s /= 100;
        let v = 1; // max brightness for HS color picking
        let r, g, b;
        let i = Math.floor(h * 6);
        let f = h * 6 - i;
        let p = v * (1 - s);
        let q = v * (1 - f * s);
        let t = v * (1 - (1 - f) * s);
        switch (i % 6) {
            case 0: r = v, g = t, b = p; break;
            case 1: r = q, g = v, b = p; break;
            case 2: r = p, g = v, b = t; break;
            case 3: r = p, g = q, b = v; break;
            case 4: r = t, g = p, b = v; break;
            case 5: r = v, g = p, b = q; break;
        }
        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }
}

// Utility exportiert für die Engine (Simulator)
export function calculateRgbFromInputs(data, vars, resolveTemplate) {
    let b = 100;
    if (data.brightness_pct !== undefined) {
        b = Math.max(0, Math.min(100, parseFloat(resolveTemplate(data.brightness_pct, vars)) || 100));
    } else if (data.brightness !== undefined) {
        b = Math.max(0, Math.min(100, (parseFloat(resolveTemplate(data.brightness, vars)) || 255) / 2.55));
    }
    
    let rgb = [255, 255, 255];
    
    if (data.xy_color) {
        let xy = resolveTemplate(data.xy_color, vars);
        if (typeof xy === 'string') xy = xy.split(',').map(n => parseFloat(n.trim()));
        if (Array.isArray(xy) && xy.length >= 2) {
            // we need an instance of ColorPicker or a static function
            const temp = new ColorPicker(null);
            rgb = temp.xyToRgb(xy[0], xy[1], b / 100);
        }
    } else if (data.rgb_color) {
        let col = resolveTemplate(data.rgb_color, vars);
        if (typeof col === 'string') col = col.split(',').map(n => parseInt(n.trim()));
        if (Array.isArray(col) && col.length >= 3) {
            // Apply brightness manually to RGB
            rgb = [col[0] * (b/100), col[1] * (b/100), col[2] * (b/100)];
        }
    } else if (data.hs_color) {
        let hs = resolveTemplate(data.hs_color, vars);
        if (typeof hs === 'string') hs = hs.split(',').map(n => parseFloat(n.trim()));
        if (Array.isArray(hs) && hs.length >= 2) {
            const temp = new ColorPicker(null);
            rgb = temp.hsToRgb(hs[0], hs[1]);
            rgb = [rgb[0] * (b/100), rgb[1] * (b/100), rgb[2] * (b/100)];
        }
    }
    
    return {
        rgbString: `rgb(${Math.round(rgb[0])}, ${Math.round(rgb[1])}, ${Math.round(rgb[2])})`,
        rgbArray: [Math.round(rgb[0]), Math.round(rgb[1]), Math.round(rgb[2])],
        brightness: b
    };
}
