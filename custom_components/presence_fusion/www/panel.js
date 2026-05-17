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
      <button data-view="map">Map (3D)</button>
      <button data-view="floorplan">Floorplan</button>
      <button data-view="devices">Devices</button>
      <button data-view="people">People</button>
      <button data-view="settings">Settings</button>
    </nav>
    <main>
      <div class="content"></div>
    </main>
  </div>
`;

import { renderOverview } from "./views/overview.js";
import { renderSettings } from "./views/settings.js";
import { renderMap } from "./views/map.js";
import { renderFloorplan } from "./views/floorplan.js";
import { renderDevices } from "./views/devices.js";
import { renderPeople } from "./views/people.js";

class PresenceFusionPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).appendChild(
      template.content.cloneNode(true),
    );
    this.view = "overview";
    this.version = null;
    this.selectedFloorplan = null;
    this._onButtonClick = this._onButtonClick.bind(this);
  }

  connectedCallback() {
    this.shadowRoot.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", this._onButtonClick);
    });

    this._loadManifest();
    this._render();
    // load data once
    this._refreshData();
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

  async _render() {
    const buttons = this.shadowRoot.querySelectorAll("button");
    buttons.forEach((button) => {
      button.toggleAttribute("selected", button.dataset.view === this.view);
    });

    const content = this.shadowRoot.querySelector(".content");

    if (this.view === "settings") {
      await renderSettings(this, content);
      return;
    }

    if (this.view === "map") {
      await renderMap(this, content);
      return;
    }

    if (this.view === "floorplan") {
      await renderFloorplan(this, content);
      return;
    }

    if (this.view === "devices") {
      renderDevices(this, content);
      return;
    }

    if (this.view === "people") {
      renderPeople(this, content);
      return;
    }

    renderOverview(this, content);
  }

  async _refreshData() {
    this.data = await fetchData();
    this._render();
  }
}

customElements.define("presence-fusion-panel", PresenceFusionPanel);

// Helper: call our integration API
async function fetchData() {
  try {
    // Fetch all data in parallel
    const [dataResp, bleResp, peopleResp, floorplansResp] = await Promise.all([
      fetch("/presence_fusion/api/data"),
      fetch("/presence_fusion/api/ble/devices"),
      fetch("/presence_fusion/api/people"),
      fetch("/presence_fusion/api/floorplans"),
    ]);

    const data = dataResp.ok
      ? await dataResp.json()
      : { people: [], zones: [], device_trackers: [], binary_sensors: [] };
    const ble = bleResp.ok
      ? await bleResp.json()
      : { proxies: [], devices: [] };
    const people = peopleResp.ok ? await peopleResp.json() : [];
    const floorplans = floorplansResp.ok ? await floorplansResp.json() : [];

    return {
      ...data,
      ble_devices: ble.devices || [],
      ble_proxies: ble.proxies || [],
      pf_people: people,
      floorplans,
    };
  } catch (err) {
    console.error("Failed to fetch presence_fusion data:", err);
    return {
      people: [],
      zones: [],
      device_trackers: [],
      binary_sensors: [],
      ble_devices: [],
      ble_proxies: [],
      pf_people: [],
      floorplans: [],
    };
  }
}

async function saveSettings(poll, cesiumToken) {
  const resp = await fetch("/presence_fusion/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ble_poll_interval: poll, cesium_token: cesiumToken }),
  });
  return resp.ok;
}

async function createPerson(name) {
  const resp = await fetch("/presence_fusion/api/people", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return resp.ok;
}

export default PresenceFusionPanel;
