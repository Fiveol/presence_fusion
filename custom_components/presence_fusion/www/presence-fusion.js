class PresenceFusionUI {
    constructor() {
        this.devices = new Map();
        this.people = new Map();
        this.tab = "devices";
        this.ws = null;

        this.init();
    }

    // =========================================================
    // INIT UI
    // =========================================================
    init() {
        document.body.innerHTML = `
      <div id="pf-root">
        <div id="pf-sidebar">
          <div class="pf-title">Presence Fusion</div>

          <button data-tab="people">People</button>
          <button data-tab="devices">Devices</button>
          <button data-tab="settings">Settings</button>

          <div class="pf-footer">
            Live BLE Tracker
          </div>
        </div>

        <div id="pf-main">
          <div id="pf-header">
            <span id="pf-tab-title"></span>
          </div>

          <div id="pf-content"></div>
        </div>
      </div>
    `;

        this.injectCSS();
        this.bindEvents();
        this.connect();
        this.render();
    }

    // =========================================================
    // STYLES
    // =========================================================
    injectCSS() {
        const style = document.createElement("style");
        style.textContent = `
      body {
        margin: 0;
        font-family: sans-serif;
        overflow: hidden;
      }

      #pf-root {
        display: flex;
        height: 100vh;
      }

      #pf-sidebar {
        width: 240px;
        background: #111;
        color: white;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      #pf-sidebar button {
        padding: 10px;
        background: #222;
        color: white;
        border: 0;
        cursor: pointer;
        text-align: left;
        border-radius: 6px;
      }

      #pf-sidebar button:hover {
        background: #333;
      }

      .pf-title {
        font-size: 18px;
        margin-bottom: 10px;
        font-weight: bold;
      }

      .pf-footer {
        margin-top: auto;
        font-size: 11px;
        opacity: 0.6;
      }

      #pf-main {
        flex: 1;
        background: #f5f5f5;
        display: flex;
        flex-direction: column;
      }

      #pf-header {
        padding: 12px;
        background: white;
        border-bottom: 1px solid #ddd;
      }

      #pf-content {
        padding: 16px;
        overflow: auto;
      }

      .device {
        background: white;
        padding: 10px;
        margin-bottom: 8px;
        border-radius: 8px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      }

      .rssi {
        font-weight: bold;
      }

      .muted {
        opacity: 0.6;
        font-size: 12px;
      }

      .grid {
        display: grid;
        gap: 8px;
      }

      input, button.input {
        padding: 8px;
        border-radius: 6px;
        border: 1px solid #ccc;
      }
    `;
        document.head.appendChild(style);
    }

    // =========================================================
    // EVENTS
    // =========================================================
    bindEvents() {
        document.querySelectorAll("#pf-sidebar button").forEach(btn => {
            btn.onclick = () => {
                this.tab = btn.dataset.tab;
                this.render();
            };
        });
    }

    // =========================================================
    // RENDER
    // =========================================================
    render() {
        const title = document.getElementById("pf-tab-title");
        const content = document.getElementById("pf-content");

        if (this.tab === "devices") {
            title.textContent = "Devices";
            content.innerHTML = this.renderDevices();
        }

        if (this.tab === "people") {
            title.textContent = "People";
            content.innerHTML = this.renderPeople();
        }

        if (this.tab === "settings") {
            title.textContent = "Settings";
            content.innerHTML = this.renderSettings();
        }
    }

    // =========================================================
    // DEVICES VIEW
    // =========================================================
    renderDevices() {
        if (this.devices.size === 0) {
            return `<div class="muted">No BLE devices detected yet...</div>`;
        }

        let html = `<div class="grid">`;

        for (const d of this.devices.values()) {
            html += `
        <div class="device">
          <div><b>${d.id}</b></div>
          <div class="muted">${d.mac}</div>
          <div class="rssi">RSSI: ${d.rssi ?? "?"}</div>
          ${d.ibeacon ? `
            <div class="muted">
              iBeacon: ${d.ibeacon.uuid}
              (${d.ibeacon.major}/${d.ibeacon.minor})
            </div>
          ` : ""}
        </div>
      `;
        }

        html += `</div>`;
        return html;
    }

    // =========================================================
    // PEOPLE VIEW
    // =========================================================
    renderPeople() {
        return `
      <h3>People</h3>

      <input id="person-name" placeholder="Name (e.g. Andrew)" />
      <button onclick="window.pf.addPerson()">Create Person</button>

      <div id="people-list"></div>
    `;
    }

    addPerson() {
        const input = document.getElementById("person-name");
        if (!input.value) return;

        const id = input.value.toLowerCase().replace(/\s+/g, "_");

        this.people.set(id, {
            id,
            name: input.value,
            devices: []
        });

        input.value = "";
        this.renderPeopleList();
    }

    renderPeopleList() {
        const el = document.getElementById("people-list");
        if (!el) return;

        el.innerHTML = Array.from(this.people.values())
            .map(p => `<div class="device">${p.name} (${p.id})</div>`)
            .join("");
    }

    // =========================================================
    // SETTINGS VIEW
    // =========================================================
    renderSettings() {
        return `
      <h3>Settings</h3>

      <label>Update interval (1–60 sec)</label>
      <input id="interval" type="number" min="1" max="60" value="5" />

      <button onclick="window.pf.saveSettings()">Save</button>
    `;
    }

    saveSettings() {
        const val = document.getElementById("interval").value;
        console.log("Save interval:", val);
    }

    // =========================================================
    // WEBSOCKET
    // =========================================================
    connect() {
        this.hass = document.querySelector("home-assistant")?.hass;

        if (!this.hass) {
            console.warn("No hass connection found yet");
            setTimeout(() => this.connect(), 1000);
            return;
        }

        this.hass.connection.subscribeMessage(
            (msg) => this.handleUpdate(msg),
            {
                type: "presence_fusion/subscribe"
            }
        );

        this.hass.connection.sendMessage({
            type: "presence_fusion/ble_state"
        }).then((msg) => {
            if (!msg.devices) return;

            Object.values(msg.devices).forEach(d => {
                this.devices.set(d.mac, d);
            });

            this.render();
        });
    }

    // =========================================================
    // LIVE UPDATES
    // =========================================================
    handleUpdate(msg) {
        if (!msg.device) return;

        this.devices.set(msg.device.mac, msg.device);
        this.render();
    }
}

// expose global for buttons
window.pf = new PresenceFusionUI();