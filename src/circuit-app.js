import { LitElement, html, css } from 'lit';

class CircuitApp extends LitElement {
    static styles = css `
    :host {
      display: flex;
      flex-direction: column;
      width: 100vw;
      height: 100vh;
    }

    .header {
      height: 48px;
      background: #1a1a2e;
      border-bottom: 1px solid #2a2a4a;
      display: flex;
      align-items: center;
      padding: 0 20px;
      flex-shrink: 0;
      gap: 16px;
    }

    .logo {
      font-size: 18px;
      font-weight: 700;
      color: #4FC3F7;
      letter-spacing: -0.5px;
    }

    .logo span {
      color: #81C784;
    }

    .subtitle {
      font-size: 11px;
      color: #555;
      border-left: 1px solid #333;
      padding-left: 16px;
    }

    .main {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    component-sidebar {
      width: 240px;
      flex-shrink: 0;
    }

    .canvas-wrapper {
      flex: 1;
      position: relative;
      overflow: hidden;
    }

    circuit-canvas {
      width: 100%;
      height: 100%;
    }

    validation-bar {
      /* positioned absolute inside canvas-wrapper */
    }
  `;

    render() {
        return html `
      <div class="header">
        <div class="logo">Circuit<span>Sense</span></div>
        <div class="subtitle">Intelligent Arduino Circuit Builder</div>
      </div>
      <div class="main">
        <component-sidebar></component-sidebar>
        <div class="canvas-wrapper">
          <circuit-canvas></circuit-canvas>
          <validation-bar></validation-bar>
        </div>
      </div>
    `;
    }
}

customElements.define('circuit-app', CircuitApp);