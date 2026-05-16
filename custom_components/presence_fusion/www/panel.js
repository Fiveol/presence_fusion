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

class PresenceFusionPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).appendChild(
      template.content.cloneNode(true),
    );
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
      const poll =
        (this.data && this.data.poll) || window.presenceFusionPoll || 5;
      content.innerHTML = `
        <h2 class="panel-title">Settings</h2>
        <label>BLE poll frequency (seconds): <span id="poll-val">${poll}</span></label>
        <input id="poll-range" type="range" min="0.1" max="60" step="0.1" value="${poll}" />
        <button id="save-settings">Save</button>
      `;
      this.shadowRoot
        .getElementById("poll-range")
        .addEventListener("input", (e) => {
          this.shadowRoot.getElementById("poll-val").textContent =
            e.target.value;
        });
      this.shadowRoot
        .getElementById("save-settings")
        .addEventListener("click", async () => {
          const val = parseFloat(
            this.shadowRoot.getElementById("poll-range").value,
          );
          const ok = await saveSettings(val);
          if (ok) {
            window.presenceFusionPoll = val;
            alert("Settings saved");
          } else alert("Failed to save settings");
        });
      return;
    }

    if (this.view === "map") {
      // Initialize Cesium 3D map view
      content.innerHTML = `
        <h2 class="panel-title">Map (3D)</h2>
        <div id="cesium-container" style="height:70vh; width:100%; border:1px solid var(--divider-color);"></div>
        <p><small>Loading 3D map. Click and drag to rotate, scroll to zoom.</small></p>
      `;

      // Load Cesium.js dynamically
      const script = document.createElement("script");
      script.src =
        "https://cesium.com/downloads/cesiumjs/releases/1.120/Cesium.js";
      script.onload = () => {
        const container = this.shadowRoot.getElementById("cesium-container");
        if (container && window.Cesium) {
          try {
            const viewer = new window.Cesium.Viewer(container, {
              terrain: window.Cesium.Terrain.fromUrl(
                "https://terrain.cesium.com/terrain",
              ),
            });
            viewer.scene.globe.depthTestAgainstTerrain = true;

            // Add zones as points
            const zones = (this.data && this.data.zones) || [];
            zones.forEach((zone) => {
              const lat = parseFloat(zone.attributes.latitude || "40.7128");
              const lon = parseFloat(zone.attributes.longitude || "-74.0060");
              viewer.entities.add({
                position: window.Cesium.Cartesian3.fromDegrees(lon, lat),
                point: { pixelSize: 10, color: window.Cesium.Color.RED },
                label: {
                  text: zone.attributes.friendly_name || zone.entity_id,
                  pixelOffset: new window.Cesium.Cartesian2(0, -20),
                },
              });
            });
          } catch (err) {
            console.error("Failed to initialize Cesium map:", err);
            container.innerHTML = "<p>Failed to load 3D map</p>";
          }
        }
      };
      document.head.appendChild(script);
      return;
    }

    if (this.view === "floorplan") {
      content.innerHTML = `
        <h2 class="panel-title">Floorplan</h2>
        <div id="floorplan-list" style="display:grid; grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); gap:12px;"></div>
        <div style="margin-top:20px;">
          <h3>Upload Floorplan</h3>
          <input type="file" id="floorplan-file" accept="image/jpg,image/jpeg,image/png" />
          <input type="text" id="floorplan-name" placeholder="Floorplan name" style="margin:0 8px;" />
          <button id="upload-floorplan">Upload</button>
        </div>
      `;

      const list = this.shadowRoot.getElementById("floorplan-list");
      ((this.data && this.data.floorplans) || []).forEach((fp) => {
        const card = document.createElement("div");
        card.style.cssText =
          "border:1px solid var(--divider-color);padding:12px;border-radius:8px;cursor:pointer;";
        card.innerHTML = `
          <h4>${fp.name}</h4>
          <small>${fp.zones.length} zones</small><br/>
          <button data-fp-id="${fp.id}" class="edit-floorplan" style="margin-top:8px;">Edit</button>
          <button data-fp-id="${fp.id}" class="delete-floorplan" style="margin:8px 4px 0;">Delete</button>
        `;
        list.appendChild(card);
      });

      this.shadowRoot.querySelectorAll(".edit-floorplan").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const fpId = e.currentTarget.dataset.fpId;
          alert(`Editing floorplan ${fpId} - coming soon!`);
        });
      });

      this.shadowRoot.querySelectorAll(".delete-floorplan").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          const fpId = e.currentTarget.dataset.fpId;
          if (confirm("Delete this floorplan?")) {
            try {
              const resp = await fetch(
                `/presence_fusion/api/floorplans/${fpId}`,
                {
                  method: "DELETE",
                },
              );
              if (resp.ok) {
                alert("Deleted");
                this._refreshData();
              } else {
                alert("Failed to delete");
              }
            } catch (err) {
              console.error(err);
              alert("Error");
            }
          }
        });
      });

      this.shadowRoot
        .getElementById("upload-floorplan")
        .addEventListener("click", async () => {
          const fileInput = this.shadowRoot.getElementById("floorplan-file");
          const nameInput = this.shadowRoot.getElementById("floorplan-name");

          if (!fileInput.files.length) return alert("Select a file");
          if (!nameInput.value.trim()) return alert("Enter a name");

          const formData = new FormData();
          formData.append("image", fileInput.files[0]);
          formData.append("name", nameInput.value.trim());

          try {
            const resp = await fetch("/presence_fusion/api/floorplans", {
              method: "POST",
              body: formData,
            });
            if (resp.ok) {
              alert("Floorplan uploaded");
              this._refreshData();
            } else {
              alert("Failed to upload");
            }
          } catch (err) {
            console.error(err);
            alert("Error");
          }
        });
      return;
    }

    if (this.view === "devices") {
      // Show BLE devices and device trackers
      const bleDevices = (this.data && this.data.ble_devices) || [];
      const devices = (this.data && this.data.device_trackers) || [];
      const people = (this.data && this.data.pf_people) || [];

      content.innerHTML = `<h2 class="panel-title">Devices</h2>
        <h3>BLE Devices</h3>
        <div id="ble-list" style="max-height:40vh;overflow:auto;"></div>
        <h3>Device Trackers</h3>
        <div id="devices-list"></div>`;

      const bleList = this.shadowRoot.getElementById("ble-list");
      bleDevices.forEach((d) => {
        const item = document.createElement("div");
        item.style.padding = "8px";
        item.style.borderBottom = "1px solid var(--divider-color)";
        const peopleSelect = people.length
          ? `
          <select class="device-person" data-device-id="${d.address}" style="margin:4px 0;">
            <option value="">Assign to person...</option>
            ${people.map((p) => `<option value="${p.id}">${p.name}</option>`).join("")}
          </select>
        `
          : "";
        item.innerHTML = `
          <div><strong>${d.name || "Unknown"}</strong> (${d.address})</div>
          <div><small>RSSI: ${d.rssi || "N/A"}</small></div>
          ${peopleSelect}
        `;
        bleList.appendChild(item);
      });

      this.shadowRoot.querySelectorAll(".device-person").forEach((sel) => {
        sel.addEventListener("change", async (e) => {
          const deviceId = e.currentTarget.dataset.deviceId;
          const personId = e.currentTarget.value;
          if (!personId) return;
          try {
            const resp = await fetch("/presence_fusion/api/device/assign", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                person_id: personId,
                device_id: deviceId,
              }),
            });
            if (resp.ok) {
              alert("Device assigned");
            } else {
              alert("Failed to assign");
            }
          } catch (err) {
            console.error(err);
            alert("Error");
          }
        });
      });

      const list = this.shadowRoot.getElementById("devices-list");
      devices.forEach((d) => {
        const item = document.createElement("div");
        item.style.padding = "8px";
        item.style.borderBottom = "1px solid var(--divider-color)";
        item.innerHTML = `
          <div><strong>${d.attributes.friendly_name || d.entity_id}</strong> — ${d.state}</div>
          <div><small>${d.entity_id}</small></div>
          <div style="margin-top:6px;"><input placeholder="Give a name" class="rename-input" data-entity="${d.entity_id}" /></div>
          <div style="margin-top:6px;"><button class="rename-btn" data-entity="${d.entity_id}">Rename</button></div>
        `;
        list.appendChild(item);
      });

      this.shadowRoot.querySelectorAll(".rename-btn").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          const ent = e.currentTarget.dataset.entity;
          const input = this.shadowRoot.querySelector(
            `input.rename-input[data-entity="${ent}"]`,
          );
          const name = input.value.trim();
          if (!name) return alert("Enter a name");
          try {
            const resp = await fetch("/presence_fusion/api/entity", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                entity_id: ent,
                attributes: { friendly_name: name },
              }),
            });
            if (resp.ok) {
              alert("Renamed");
              this._refreshData();
            } else alert("Failed");
          } catch (err) {
            console.error(err);
            alert("Error");
          }
        });
      });
      return;
    }

    if (this.view === "people") {
      // Use custom Presence Fusion people, not HA person entities
      const people = (this.data && this.data.pf_people) || [];
      content.innerHTML = `<h2 class="panel-title">People</h2><div id="people-list"></div><div style="margin-top:12px;"><input id="new-person-name" placeholder="New person name" /><button id="create-person">Create</button></div>`;
      const list = this.shadowRoot.getElementById("people-list");
      people.forEach((p) => {
        const item = document.createElement("div");
        item.style.padding = "8px";
        item.style.borderBottom = "1px solid var(--divider-color)";
        const devicesHtml = p.devices.length
          ? `<div><small>Devices: ${p.devices.join(", ")}</small></div>`
          : "";
        item.innerHTML = `
          <div><strong>${p.name}</strong></div>
          ${devicesHtml}
          <button class="delete-person" data-person-id="${p.id}" style="margin-top:4px;">Delete</button>
        `;
        list.appendChild(item);
      });

      this.shadowRoot.querySelectorAll(".delete-person").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          const personId = e.currentTarget.dataset.personId;
          if (confirm("Delete this person?")) {
            try {
              const resp = await fetch(
                `/presence_fusion/api/people/${personId}`,
                {
                  method: "DELETE",
                },
              );
              if (resp.ok) {
                alert("Deleted");
                this._refreshData();
              } else {
                alert("Failed");
              }
            } catch (err) {
              console.error(err);
              alert("Error");
            }
          }
        });
      });

      this.shadowRoot
        .getElementById("create-person")
        .addEventListener("click", async () => {
          const name = this.shadowRoot
            .getElementById("new-person-name")
            .value.trim();
          if (!name) return alert("Enter a name");
          try {
            const resp = await fetch("/presence_fusion/api/people", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name }),
            });
            if (resp.ok) {
              alert("Created");
              this._refreshData();
            } else {
              alert("Failed to create");
            }
          } catch (err) {
            console.error(err);
            alert("Failed");
          }
        });
      return;
    }

    // default overview
    const people = (this.data && this.data.pf_people) || [];
    const zones = (this.data && this.data.zones) || [];
    const bleDevices = (this.data && this.data.ble_devices) || [];

    let peopleHtml =
      "<ul>" +
      people
        .map((p) => `<li>${p.name} (${p.devices.length} devices)</li>`)
        .join("") +
      "</ul>";
    let zonesHtml =
      "<ul>" +
      zones
        .map(
          (z) =>
            `<li>${z.attributes.friendly_name || z.entity_id}: ${z.state}</li>`,
        )
        .join("") +
      "</ul>";
    let bleHtml =
      "<ul>" +
      bleDevices
        .slice(0, 10)
        .map((d) => `<li>${d.name || "Unknown"}: RSSI ${d.rssi || "N/A"}</li>`)
        .join("") +
      "</ul>";

    content.innerHTML = `
      <h2 class="panel-title">Overview</h2>
      <p>Version ${this.version ? `v${this.version}` : "Loading..."}</p>
      <h3>People</h3>
      ${peopleHtml || "<p>No people</p>"}
      <h3>Zones</h3>
      ${zonesHtml || "<p>No zones</p>"}
      <h3>BLE Devices (Top 10)</h3>
      ${bleHtml || "<p>No BLE devices</p>"}
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

async function saveSettings(poll) {
  const resp = await fetch("/presence_fusion/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ble_poll_interval: poll }),
  });
  return resp.ok;
}

export default PresenceFusionPanel;
