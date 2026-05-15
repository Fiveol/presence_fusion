class PresenceFusionUI {
  constructor() {
    this.devices = new Map();
    this.people = new Map();

    this.sidebarCollapsed = false;
    this.tab = "devices";

    this.hass = null;

    this.init();
  }

  // =========================================================
  // INIT
  // =========================================================
  init() {
    document.body.innerHTML = `
      <div id="pf-root">

        <div id="pf-sidebar">

          <div id="pf-sidebar-top">
            <button id="pf-collapse-btn">☰</button>
            <div id="pf-title">Presence Fusion</div>
          </div>

          <button class="pf-nav" data-tab="devices">
            <span class="pf-icon">📡</span>
            <span class="pf-label">Devices</span>
          </button>

          <button class="pf-nav" data-tab="people">
            <span class="pf-icon">👤</span>
            <span class="pf-label">People</span>
          </button>

          <button class="pf-nav" data-tab="settings">
            <span class="pf-icon">⚙️</span>
            <span class="pf-label">Settings</span>
          </button>

          <div id="pf-sidebar-footer">
            Presence Fusion
          </div>
        </div>

        <div id="pf-main">

          <div id="pf-header">
            <div id="pf-header-title"></div>

            <button id="pf-home-btn">
              Back to Home Assistant
            </button>
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
  // CSS
  // =========================================================
  injectCSS() {
    const style = document.createElement("style");

    style.textContent = `
      :root {
        color-scheme: light dark;
      }

      body {
        margin: 0;
        overflow: hidden;

        background: var(--primary-background-color);
        color: var(--primary-text-color);

        font-family:
          Roboto,
          Noto,
          sans-serif;
      }

      #pf-root {
        display: flex;
        height: 100vh;
      }

      /* ================================================== */
      /* SIDEBAR */
      /* ================================================== */

      #pf-sidebar {
        width: 240px;

        background:
          var(--sidebar-background-color);

        border-right:
          1px solid var(--divider-color);

        display: flex;
        flex-direction: column;

        transition: width 0.2s ease;
      }

      #pf-sidebar.collapsed {
        width: 64px;
      }

      #pf-sidebar-top {
        display: flex;
        align-items: center;
        gap: 8px;

        padding: 12px;
      }

      #pf-collapse-btn {
        width: 40px;
        height: 40px;

        border: none;
        border-radius: 8px;

        cursor: pointer;

        background:
          var(--card-background-color);

        color:
          var(--primary-text-color);
      }

      #pf-title {
        font-size: 18px;
        font-weight: 600;

        white-space: nowrap;
      }

      #pf-sidebar.collapsed #pf-title {
        display: none;
      }

      /* ================================================== */
      /* NAV BUTTONS */
      /* ================================================== */

      .pf-nav {
        margin: 4px 8px;
        padding: 12px;

        border: none;
        border-radius: 10px;

        cursor: pointer;

        background: transparent;

        color:
          var(--primary-text-color);

        display: flex;
        align-items: center;
        gap: 12px;

        text-align: left;

        transition:
          background 0.15s ease,
          transform 0.1s ease;
      }

      .pf-nav:hover {
        background:
          var(--card-background-color);
      }

      .pf-nav:active {
        transform: scale(0.98);
      }

      .pf-nav.active {
        background:
          var(--card-background-color);
      }

      .pf-icon {
        width: 20px;
        text-align: center;
      }

      #pf-sidebar.collapsed .pf-label {
        display: none;
      }

      /* ================================================== */
      /* FOOTER */
      /* ================================================== */

      #pf-sidebar-footer {
        margin-top: auto;

        padding: 12px;

        opacity: 0.6;
        font-size: 12px;
      }

      #pf-sidebar.collapsed #pf-sidebar-footer {
        display: none;
      }

      /* ================================================== */
      /* MAIN */
      /* ================================================== */

      #pf-main {
        flex: 1;

        display: flex;
        flex-direction: column;

        background:
          var(--primary-background-color);
      }

      #pf-header {
        height: 64px;

        display: flex;
        align-items: center;
        justify-content: space-between;

        padding: 0 16px;

        border-bottom:
          1px solid var(--divider-color);

        background:
          var(--card-background-color);
      }

      #pf-header-title {
        font-size: 22px;
        font-weight: 600;
      }

      #pf-home-btn {
        padding: 8px 14px;

        border: none;
        border-radius: 8px;

        cursor: pointer;

        background:
          var(--primary-color);

        color:
          var(--text-primary-color);
      }

      #pf-content {
        flex: 1;

        overflow: auto;

        padding: 16px;
      }

      /* ================================================== */
      /* DEVICES */
      /* ================================================== */

      .pf-grid {
        display: grid;
        gap: 12px;
      }

      .pf-device {
        padding: 14px;

        border-radius: 14px;

        background:
          var(--card-background-color);

        border:
          1px solid var(--divider-color);
      }

      .pf-device-name {
        font-size: 16px;
        font-weight: 600;
      }

      .pf-muted {
        opacity: 0.7;
        font-size: 13px;
      }

      .pf-rssi {
        margin-top: 6px;
        font-weight: 600;
      }

      input {
        padding: 10px;

        border-radius: 8px;

        border:
          1px solid var(--divider-color);

        background:
          var(--card-background-color);

        color:
          var(--primary-text-color);
      }

      button.pf-action {
        padding: 10px 14px;

        border: none;
        border-radius: 8px;

        cursor: pointer;

        background:
          var(--primary-color);

        color:
          var(--text-primary-color);
      }
    `;

    document.head.appendChild(style);
  }

  // =========================================================
  // EVENTS
  // =========================================================
  bindEvents() {
    document
      .getElementById("pf-collapse-btn")
      .onclick = () => {
        this.sidebarCollapsed =
          !this.sidebarCollapsed;

        document
          .getElementById("pf-sidebar")
          .classList.toggle(
            "collapsed",
            this.sidebarCollapsed
          );
      };

    document
      .getElementById("pf-home-btn")
      .onclick = () => {
        window.location.href = "/";
      };

    document
      .querySelectorAll(".pf-nav")
      .forEach(btn => {
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
    document
      .querySelectorAll(".pf-nav")
      .forEach(btn => {
        btn.classList.toggle(
          "active",
          btn.dataset.tab === this.tab
        );
      });

    const title =
      document.getElementById(
        "pf-header-title"
      );

    const content =
      document.getElementById(
        "pf-content"
      );

    // -------------------------------------------------------
    // DEVICES
    // -------------------------------------------------------
    if (this.tab === "devices") {
      title.textContent = "Devices";

      if (this.devices.size === 0) {
        content.innerHTML = `
          <div class="pf-muted">
            No BLE devices detected yet...
          </div>
        `;
        return;
      }

      let html = `
        <div class="pf-grid">
      `;

      for (const d of this.devices.values()) {
        html += `
          <div class="pf-device">

            <div class="pf-device-name">
              ${d.id}
            </div>

            <div class="pf-muted">
              ${d.mac}
            </div>

            <div class="pf-rssi">
              RSSI: ${d.rssi ?? "?"}
            </div>

            ${
              d.ibeacon
                ? `
                  <div class="pf-muted">
                    iBeacon:
                    ${d.ibeacon.uuid}
                  </div>

                  <div class="pf-muted">
                    Major:
                    ${d.ibeacon.major}
                    Minor:
                    ${d.ibeacon.minor}
                  </div>
                `
                : ""
            }

          </div>
        `;
      }

      html += "</div>";

      content.innerHTML = html;
    }

    // -------------------------------------------------------
    // PEOPLE
    // -------------------------------------------------------
    if (this.tab === "people") {
      title.textContent = "People";

      content.innerHTML = `
        <h3>Create Person</h3>

        <div style="display:flex; gap:8px;">
          <input
            id="pf-person-name"
            placeholder="Andrew"
          />

          <button
            class="pf-action"
            id="pf-add-person"
          >
            Create
          </button>
        </div>

        <div
          id="pf-people-list"
          style="margin-top:16px;"
        ></div>
      `;

      document
        .getElementById("pf-add-person")
        .onclick = () => {
          this.addPerson();
        };

      this.renderPeople();
    }

    // -------------------------------------------------------
    // SETTINGS
    // -------------------------------------------------------
    if (this.tab === "settings") {
      title.textContent = "Settings";

      content.innerHTML = `
        <h3>Settings</h3>

        <div class="pf-muted">
          Update Interval
        </div>

        <div style="margin-top:8px;">
          <input
            type="number"
            min="1"
            max="60"
            value="5"
          />
        </div>
      `;
    }
  }

  // =========================================================
  // PEOPLE
  // =========================================================
  addPerson() {
    const input =
      document.getElementById(
        "pf-person-name"
      );

    if (!input.value) return;

    const id =
      input.value
        .toLowerCase()
        .replace(/\s+/g, "_");

    this.people.set(id, {
      id,
      name: input.value,
    });

    input.value = "";

    this.renderPeople();
  }

  renderPeople() {
    const el =
      document.getElementById(
        "pf-people-list"
      );

    if (!el) return;

    el.innerHTML =
      Array.from(this.people.values())
        .map(person => `
          <div class="pf-device">
            <div class="pf-device-name">
              ${person.name}
            </div>

            <div class="pf-muted">
              ${person.id}
            </div>
          </div>
        `)
        .join("");
  }

  // =========================================================
  // HA WEBSOCKET
  // =========================================================
  connect() {
    this.hass =
      document.querySelector(
        "home-assistant"
      )?.hass;

    if (!this.hass) {
      console.warn(
        "Waiting for Home Assistant..."
      );

      setTimeout(
        () => this.connect(),
        1000
      );

      return;
    }

    console.log(
      "Connected to Home Assistant"
    );

    // -------------------------------------------------------
    // INITIAL STATE
    // -------------------------------------------------------
    this.hass.connection
      .sendMessagePromise({
        type:
          "presence_fusion/ble_state"
      })
      .then(msg => {

        console.log(
          "Initial BLE state",
          msg
        );

        if (!msg.devices) return;

        msg.devices.forEach(device => {
          this.devices.set(
            device.mac,
            device
          );
        });

        this.render();
      });

    // -------------------------------------------------------
    // LIVE UPDATES
    // -------------------------------------------------------
    this.hass.connection
      .subscribeMessage(
        msg => {

          console.log(
            "BLE update",
            msg
          );

          if (
            !msg.event ||
            !msg.event.device
          ) {
            return;
          }

          const device =
            msg.event.device;

          this.devices.set(
            device.mac,
            device
          );

          this.render();
        },
        {
          type:
            "presence_fusion/subscribe"
        }
      );
  }
}

window.presenceFusion =
  new PresenceFusionUI();