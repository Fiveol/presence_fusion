const template = document.createElement("template");

template.innerHTML = `
  <style>
    :host {
      display: block;
      box-sizing: border-box;
      color: var(--primary-text-color);
      background: var(--background-color);
      min-height: calc(100vh - 56px);
    }

    .container {
      display: flex;
      height: 100%;
      min-height: 100%;
    }

    nav {
      flex: 0 0 220px;
      border-right: 1px solid var(--divider-color);
      padding: 20px 16px;
      background: var(--sidebar-background-color, #f7f7f7);
    }

    nav h1 {
      margin: 0 0 20px;
      font-size: 1.15rem;
      line-height: 1.3;
    }

    button {
      display: block;
      width: 100%;
      padding: 12px 14px;
      margin-bottom: 8px;
      text-align: left;
      border: none;
      border-radius: 8px;
      background: transparent;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }

    button[selected] {
      font-weight: 700;
      background: rgba(0, 0, 0, 0.06);
    }

    main {
      flex: 1;
      padding: 24px;
      min-height: 100%;
    }

    .panel-title {
      margin-top: 0;
    }
  </style>

  <div class="container">
    <nav>
      <h1>Presence Fusion</h1>
      <button data-view="overview" selected>Overview</button>
      <button data-view="settings">Settings</button>
    </nav>
    <main>
      <div class="content"></div>
    </main>
  </div>
`;

class PresenceFusionPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).appendChild(template.content.cloneNode(true));
    this.view = "overview";
    this.version = null;
    this._onButtonClick = this._onButtonClick.bind(this);
  }

  connectedCallback() {
    this.shadowRoot.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", this._onButtonClick);
    });

    this._loadManifest();
    this._render();
  }

  disconnectedCallback() {
    this.shadowRoot.querySelectorAll("button").forEach((button) => {
      button.removeEventListener("click", this._onButtonClick);
    });
  }

  async _loadManifest() {
    try {
      const response = await fetch("/presence_fusion/manifest.json");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const manifest = await response.json();
      this.version = manifest.version;
    } catch (err) {
      this.version = "unknown";
      console.error("Failed to load Presence Fusion manifest:", err);
    }

    this._render();
  }

  _onButtonClick(event) {
    const view = event.currentTarget.dataset.view;
    this.view = view;
    this._render();
  }

  _render() {
    const buttons = this.shadowRoot.querySelectorAll("button");
    buttons.forEach((button) => {
      button.toggleAttribute("selected", button.dataset.view === this.view);
    });

    const content = this.shadowRoot.querySelector(".content");

    if (this.view === "settings") {
      content.innerHTML = `
        <h2 class="panel-title">Settings</h2>
        <p>This is the Settings panel.</p>
      `;
      return;
    }

    content.innerHTML = `
      <h2 class="panel-title">Overview</h2>
      <p>This is the Presence Fusion panel.</p>
      <p>Version ${this.version ? `v${this.version}` : "Loading..."}</p>
    `;
  }
}

customElements.define("presence-fusion-panel", PresenceFusionPanel);

export default PresenceFusionPanel;
