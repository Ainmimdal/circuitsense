// Import wokwi elements (registers all custom elements globally)
import '@wokwi/elements';
import './components/elera-breadboard.js';
import './components/elera-full-breadboard.js';

// Import our app components
import './circuit-app.js';
import './components/component-sidebar.js';
import './components/circuit-canvas.js';
import './components/validation-bar.js';
import './components/ai-assistant.js';
import './components/projects-modal.js';

import { loadConvertedPartCatalog } from './core/converted-part-loader.js';

loadConvertedPartCatalog().then(result => {
    for (const error of result.errors) {
        console.warn(`[Elera] Failed to load converted part ${error.partUrl}: ${error.message}`);
    }
}).catch(error => {
    console.warn(`[Elera] Failed to load converted-part catalog: ${error.message}`);
});
