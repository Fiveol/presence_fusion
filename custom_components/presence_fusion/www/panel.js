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
      <button data-view="map">Map</button>
      <button data-view="devices">Devices</button>
      <button data-view="people">People</button>
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

  _render() {
    const buttons = this.shadowRoot.querySelectorAll("button");
    buttons.forEach((button) => {
      button.toggleAttribute("selected", button.dataset.view === this.view);
    });

    const content = this.shadowRoot.querySelector(".content");

    if (this.view === "settings") {
      const poll = (this.data && this.data.poll) || (window.presenceFusionPoll || 5);
      content.innerHTML = `
        <h2 class="panel-title">Settings</h2>
        <label>BLE poll frequency (seconds): <span id="poll-val">${poll}</span></label>
        <input id="poll-range" type="range" min="0.1" max="60" step="0.1" value="${poll}" />
        <button id="save-settings">Save</button>
      `;
      this.shadowRoot.getElementById("poll-range").addEventListener("input", (e)=>{
        this.shadowRoot.getElementById("poll-val").textContent = e.target.value;
      });
      this.shadowRoot.getElementById("save-settings").addEventListener("click", async ()=>{
        const val = parseFloat(this.shadowRoot.getElementById("poll-range").value);
        const ok = await saveSettings(val);
        if (ok) {
          window.presenceFusionPoll = val;
          alert("Settings saved");
        } else alert("Failed to save settings");
      });
      return;
    }

    if (this.view === "map") {
      const zones = (this.data && this.data.zones) || [];
      // build simple scrollable area with zone boxes
      content.innerHTML = `
        <h2 class="panel-title">Map</h2>
        <div id="map" style="border:1px solid var(--divider-color); height:60vh; overflow:auto; padding:12px; display:flex; gap:12px; flex-wrap:wrap;"></div>
      `;
      const map = this.shadowRoot.getElementById("map");
      zones.forEach(z=>{
        const el = document.createElement('div');
        el.style.minWidth = '200px';
        el.style.minHeight = '120px';
        el.style.border = '1px dashed var(--divider-color)';
        el.style.padding = '8px';
        el.style.boxSizing = 'border-box';
        el.innerHTML = `<strong>${z.attributes.friendly_name || z.entity_id}</strong><div>State: ${z.state}</div>`;
        map.appendChild(el);
      });
      return;
    }

    if (this.view === "devices") {
      const devices = (this.data && this.data.device_trackers) || [];
      content.innerHTML = `<h2 class="panel-title">Devices</h2><div id="devices-list"></div>`;
      const list = this.shadowRoot.getElementById('devices-list');
      devices.forEach(d=>{
        const item = document.createElement('div');
        item.style.padding='8px';
        item.style.borderBottom='1px solid var(--divider-color)';
        item.innerHTML = `
          <div><strong>${d.attributes.friendly_name || d.entity_id}</strong> — ${d.state}</div>
          <div><small>${d.entity_id}</small></div>
          <div style="margin-top:6px;"><input placeholder="Give a name" class="rename-input" data-entity="${d.entity_id}" /></div>
          <div style="margin-top:6px;"><button class="rename-btn" data-entity="${d.entity_id}">Rename</button></div>
        `;
        list.appendChild(item);
      });
      this.shadowRoot.querySelectorAll('.rename-btn').forEach(btn=>{
        btn.addEventListener('click', async (e)=>{
          const ent = e.currentTarget.dataset.entity;
          const input = this.shadowRoot.querySelector(`input.rename-input[data-entity="${ent}"]`);
          const name = input.value.trim();
          if (!name) return alert('Enter a name');
          try {
            const resp = await fetch('/presence_fusion/api/entity', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                entity_id: ent,
                attributes: { friendly_name: name },
              }),
                attributes: { friendly_name: name },
              }),
            });
            if (resp.ok) { alert('Renamed'); this._refreshData(); } else alert('Failed');
          } catch(err){ console.error(err); alert('Error'); }
        });
      });
      return;
    }

    if (this.view === "people") {
      const people = (this.data && this.data.people) || [];
      content.innerHTML = `<h2 class="panel-title">People</h2><div id="people-list"></div><div style="margin-top:12px;"><input id="new-person-name" placeholder="New person name" /><button id="create-person">Create</button></div>`;
      const list = this.shadowRoot.getElementById('people-list');
      people.forEach(p=>{
        const item = document.createElement('div');
        item.style.padding='8px';
        item.style.borderBottom='1px solid var(--divider-color)';
        item.innerHTML = `<div><strong>${p.attributes.friendly_name || p.entity_id}</strong> — ${p.state}</div><div><small>${p.entity_id}</small></div>`;
        list.appendChild(item);
      });
      this.shadowRoot.getElementById('create-person').addEventListener('click', async ()=>{
        const name = this.shadowRoot.getElementById('new-person-name').value.trim();
        if (!name) return alert('Enter a name');
        const ok = await createPerson(name);
        if (ok) { alert('Created'); this._refreshData(); } else alert('Failed to create');
      });
      return;
    }

    // default overview
    const people = (this.data && this.data.people) || [];
    const zones = (this.data && this.data.zones) || [];
    // compute counts per zone
    const counts = {};
    people.forEach(p=>{ counts[p.state] = (counts[p.state]||0)+1; });
    let peopleHtml = '<ul>' + people.map(p=>`<li>${p.attributes.friendly_name || p.entity_id}: ${p.state}</li>`).join('') + '</ul>';
    let zonesHtml = '<ul>' + zones.map(z=>`<li>${z.attributes.friendly_name || z.entity_id}: ${counts[z.entity_id]||0} people</li>`).join('') + '</ul>';
    content.innerHTML = `
      <h2 class="panel-title">Overview</h2>
      <p>Version ${this.version ? `v${this.version}` : "Loading..."}</p>
      <h3>People</h3>
      ${peopleHtml}
      <h3>Zones</h3>
      ${zonesHtml}
    `;
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
    const resp = await fetch("/presence_fusion/api/data");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch (err) {
    console.error("Failed to fetch presence_fusion data:", err);
    return { people: [], zones: [], device_trackers: [], binary_sensors: [] };
  }
}

async function createPerson(name) {
  const resp = await fetch("/presence_fusion/api/person", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return resp.ok;
}

async function saveSettings(poll) {
  const resp = await fetch("/presence_fusion/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ble_poll_interval: poll }),
  });
  return resp.ok;
}

export default PresenceFusionPanel;
