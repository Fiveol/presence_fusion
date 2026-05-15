class PresenceFusionApp {
    constructor() {
        this.devices = new Map();
        this.activeTab = "devices";

        this.init();
    }

    init() {
        document.body.innerHTML = `
      <div id="pf-root">
        <div id="pf-sidebar">
          <div class="pf-title">Presence Fusion</div>

          <button class="pf-btn" data-tab="people">People</button>
          <button class="pf-btn" data-tab="devices">Devices</button>
          <button class="pf-btn" data-tab="settings">Settings</button>
        </div>

        <div id="pf-main">
          <div id="pf-content"></div>
        </div>
      </div>
    `;

        this.injectStyle();
        this.bindEvents();
        this.render();

        this.connectWS();
    }

    injectStyle() {
        const style = document.createElement("style");
        style.innerHTML = `
      #pf-root {
        display: flex;
        height: 100vh;
        font-family: sans-serif;
      }

      #pf-sidebar {
        width: 220px;
        background: #111;
        color: white;
        padding: 12px;
      }

      .pf-title {
        font-size: 18px;
        margin-bottom: 12px;
      }

      .pf-btn {
        width: 100%;
        padding: 10px;
        margin: 4px 0;
        background: #222;
        color: white;
        border: none;
        cursor: pointer;
      }

      .pf-btn:hover {
        background: #333;
      }

      #pf-main {
        flex: 1;
        padding: 16px;
        background: #f4f4f4;
      }

      .device {
        background: white;
        padding: 10px;
        margin: 6px 0;
        border-radius: 6px;
      }

      .rssi {
        font-weight: bold;
      }
    `;
        document.head.appendChild(style);
    }

    bindEvents() {
        document.querySelectorAll(".pf-btn").forEach(btn => {
            btn.onclick = () => {
                this.activeTab = btn.dataset.tab;
                this.render();
            };
        });
    }

    render() {
        const content = document.getElementById("pf-content");

        if (this.activeTab === "devices") {
            content.innerHTML = this.renderDevices();
        } else if (this.activeTab === "people") {
            content.innerHTML = `<h2>People</h2><p>Not implemented yet</p>`;
        } else if (this.activeTab === "settings") {
            content.innerHTML = `
        <h2>Settings</h2>
        <p>Update interval: 1–60s (not implemented yet)</p>
      `;
        }
    }

    renderDevices() {
        let html = `<h2>Devices</h2>`;

        if (this.devices.size === 0) {
            return html + "<p>No BLE devices yet...</p>";
        }

        this.devices.forEach(d => {
            html += `
        <div class="device">
          <div><b>${d.id}</b></div>
          <div>MAC: ${d.mac}</div>
          <div class="rssi">RSSI: ${d.rssi}</div>
          ${d.ibeacon ? `<div>iBeacon: ${d.ibeacon.uuid}</div>` : ""}
        </div>
      `;
        });

        return html;
    }

    connectWS() {
        this.ws = this.hassConnection();

        this.ws.subscribe(
            { type: "presence_fusion/subscribe" },
            (msg) => {
                // subscription confirmed
            }
        );

        this.ws.subscribe(
            { type: "presence_fusion/ble_state" },
            (msg) => {
                if (msg.devices) {
                    Object.values(msg.devices).forEach(d => {
                        this.devices.set(d.mac, d);
                    });
                    this.render();
                }
            }
        );
    }

    hassConnection() {
        return {
            subscribe: (msg, cb) => {
                this._sendWS(msg, cb);
            }
        };
    }

    _sendWS(msg, cb) {
        const socket = window.parent?.hassConnection || null;

        // fallback: real HA websocket
        if (window.hassConnection) {
            window.hassConnection.sendMessage(msg, cb);
        }
    }
}

new PresenceFusionApp();