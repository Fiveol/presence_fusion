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

  _render() {
    const buttons = this.shadowRoot.querySelectorAll("button");
    buttons.forEach((button) => {
      button.toggleAttribute("selected", button.dataset.view === this.view);
    });

    const content = this.shadowRoot.querySelector(".content");

    if (this.view === "settings") {
      const poll =
        (this.data && this.data.ble_poll_interval) || window.presenceFusionPoll || 5;
      const cesiumToken = (this.data && this.data.cesium_token) || "";
      content.innerHTML = `
        <h2 class="panel-title">Settings</h2>
        <label>BLE poll frequency (seconds): <span id="poll-val">${poll}</span></label>
        <input id="poll-range" type="range" min="0.1" max="60" step="0.1" value="${poll}" />
        <div style="margin-top:12px;"><label>Cesium Ion Token (optional):</label><input id="cesium-token" style="width:100%;" value="${cesiumToken}" placeholder="Paste Cesium Ion token"/></div>
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
          const token = this.shadowRoot.getElementById("cesium-token").value.trim();
          const ok = await saveSettings(val, token);
          if (ok) {
            window.presenceFusionPoll = val;
            window.presenceFusionCesiumToken = token;
            alert("Settings saved");
          } else alert("Failed to save settings");
        });
      return;
    }

    if (this.view === "map") {
      content.innerHTML = `
        <h2 class="panel-title">Map (3D)</h2>
        <div id="cesium-container" style="height:70vh; width:100%; border:1px solid var(--divider-color);"></div>
        <p><small>Loading 3D map. Click and drag to rotate, scroll to zoom.</small></p>
      `;

      if (!window.Cesium && !this._cesiumLoading) {
        this._cesiumLoading = true;
        const widgetsCss = "https://cesium.com/downloads/cesiumjs/releases/1.120/Build/Cesium/Widgets/widgets.css";
        // Import widgets css into the shadow root so it applies to the Cesium container
        try {
          const styleEl = document.createElement("style");
          styleEl.textContent = `@import url('${widgetsCss}'); #cesium-container { min-height: 70vh; height:70vh; }`;
          this.shadowRoot.appendChild(styleEl);
        } catch (err) {
          console.warn("Could not inject Cesium widgets CSS into shadow root:", err);
        }

        const script = document.createElement("script");
        script.src =
          "https://cesium.com/downloads/cesiumjs/releases/1.120/Build/Cesium/Cesium.js";
        script.onload = () => this._render();
        script.onerror = () => {
          const container = this.shadowRoot.getElementById("cesium-container");
          if (container) {
            container.innerHTML =
              "<p>Unable to load Cesium. Please check network or try again later.</p>";
          }
        };
        document.head.appendChild(script);
      }

      if (window.Cesium) {
        const container = this.shadowRoot.getElementById("cesium-container");
        try {
          // Apply Cesium Ion token if configured
          try {
            const token = (this.data && this.data.cesium_token) || window.presenceFusionCesiumToken || (window.__presence_fusion_cesium_token || null);
            if (token && window.Cesium && window.Cesium.Ion) {
              window.Cesium.Ion.defaultAccessToken = token;
            }
          } catch (e) {
            console.debug("No Cesium Ion token applied:", e);
          }

          if (!this._cesiumViewer) {
            this._cesiumViewer = new window.Cesium.Viewer(container, {
              terrainProvider: new window.Cesium.EllipsoidTerrainProvider(),
              imageryProvider: new window.Cesium.OpenStreetMapImageryProvider({
                url: "https://a.tile.openstreetmap.org/",
              }),
              baseLayerPicker: false,
              sceneMode: window.Cesium.SceneMode.SCENE3D,
            });
          }

          const viewer = this._cesiumViewer;
          viewer.entities.removeAll();

          const zones = (this.data && this.data.zones) || [];
          const people = (this.data && this.data.pf_people) || [];
          const deviceToPerson = (this.data && this.data.device_to_person) || {};

          zones.forEach((zone) => {
            const lat = parseFloat(zone.attributes.latitude || "40.7128");
            const lon = parseFloat(zone.attributes.longitude || "-74.0060");
            viewer.entities.add({
              position: window.Cesium.Cartesian3.fromDegrees(lon, lat),
              point: { pixelSize: 14, color: window.Cesium.Color.ORANGE },
              label: {
                text: zone.attributes.friendly_name || zone.entity_id,
                font: "16px sans-serif",
                pixelOffset: new window.Cesium.Cartesian2(0, -24),
              },
            });
          });

          people.forEach((person) => {
            const id = person.id || person.entity_id || "person";
            const assignedDevices = person.devices || [];
            const assignedText = assignedDevices.length
              ? `Devices: ${assignedDevices.join(", ")}`
              : "No devices";
            viewer.entities.add({
              position: window.Cesium.Cartesian3.fromDegrees(-74.006, 40.7128),
              point: { pixelSize: 10, color: window.Cesium.Color.CYAN },
              label: {
                text: `${person.name || id} (${assignedText})`,
                font: "14px sans-serif",
                pixelOffset: new window.Cesium.Cartesian2(0, -20),
              },
            });
          });

          viewer.zoomTo(viewer.entities);
        } catch (err) {
          console.error("Failed to initialize Cesium map:", err);
          const container = this.shadowRoot.getElementById("cesium-container");
          if (container) {
            container.innerHTML = "<p>Failed to load 3D map</p>";
          }
        }
      }
      return;
    }

    if (this.view === "floorplan") {
      const floorplans = (this.data && this.data.floorplans) || [];
      if (this.selectedFloorplan) {
        let fp = floorplans.find((item) => item.id === this.selectedFloorplan);
        if (!fp) {
          this.selectedFloorplan = null;
          this._render();
          return;
        }

        if (!fp.image) {
          try {
            const detailResp = await fetch(`/presence_fusion/api/floorplans/${fp.id}`);
            if (detailResp.ok) {
              fp = await detailResp.json();
            }
          } catch (err) {
            console.warn("Could not load floorplan image details:", err);
          }
        }

        content.innerHTML = `
          <h2 class="panel-title">Floorplan Editor</h2>
          <button id="back-to-list">Back to floorplans</button>
          <div style="margin-top:20px; display:flex; gap:16px;">
            <div style="flex:1;">
              <h3>${fp.name}</h3>
              <div id="floorplan-editor" style="position:relative; border:1px solid var(--divider-color); min-height:320px; background:#f4f4f4;"></div>
            </div>
            <div style="width:320px;">
              <h4>Area Builder</h4>
              <div id="zone-points">Click the image to add points</div>
              <input id="zone-name" placeholder="Area name" style="width:100%; margin-top:10px;" />
              <button id="save-zone" style="margin-top:10px; width:100%">Save Area</button>
              <h4 style="margin-top:14px;">Map existing HA area to this floorplan</h4>
              <select id="ha-area-map" style="width:100%; margin-top:6px;"></select>
              <button id="map-ha-area" style="margin-top:8px; width:100%">Map HA Area</button>

              <h4 style="margin-top:20px;">Proxy Placement</h4>
              <input id="proxy-id" placeholder="Proxy ID" style="width:100%;" />
              <input id="proxy-x" placeholder="X" style="width:48%; margin-top:8px;" />
              <input id="proxy-y" placeholder="Y" style="width:48%; margin-top:8px; float:right;" />
              <button id="save-proxy" style="margin-top:10px; width:100%;">Save Proxy</button>
              <div id="floorplan-messages" style="margin-top:12px;color:var(--secondary-text-color);"></div>
            </div>
          </div>
        `;

        const editor = this.shadowRoot.getElementById("floorplan-editor");
        editor.style.position = "relative";
        const points = [];
        const pointList = this.shadowRoot.getElementById("zone-points");
        const image = document.createElement("img");
        image.style.maxWidth = "100%";
        image.style.maxHeight = "600px";
        image.style.display = "block";
        image.style.cursor = "crosshair";
        image.src = fp.image ? `data:image/png;base64,${fp.image}` : "";
        image.alt = fp.name;
        image.style.position = "relative";
        editor.appendChild(image);

        const overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        overlay.setAttribute("style", "position:absolute; inset:0; width:100%; height:100%; pointer-events:none; overflow:visible;");
        overlay.setAttribute("viewBox", "0 0 100 100");
        overlay.setAttribute("preserveAspectRatio", "none");
        editor.appendChild(overlay);

        const redrawOverlay = () => {
          while (overlay.firstChild) {
            overlay.removeChild(overlay.firstChild);
          }
          if (!points.length) {
            return;
          }
          const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          const d = points
            .map((pt, idx) => `${idx === 0 ? "M" : "L"} ${pt.x} ${pt.y}`)
            .join(" ");
          path.setAttribute("d", d);
          path.setAttribute("fill", "none");
          path.setAttribute("stroke", "rgba(0, 123, 255, 0.85)");
          path.setAttribute("stroke-width", "0.8");
          overlay.appendChild(path);

          points.forEach((pt, idx) => {
            const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("cx", String(pt.x));
            circle.setAttribute("cy", String(pt.y));
            circle.setAttribute("r", "1.2");
            circle.setAttribute("fill", "rgba(0, 123, 255, 0.9)");
            overlay.appendChild(circle);
            const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
            label.setAttribute("x", String(pt.x + 1.2));
            label.setAttribute("y", String(pt.y - 1.2));
            label.setAttribute("font-size", "2");
            label.setAttribute("fill", "rgba(255,255,255,0.95)");
            label.textContent = String(idx + 1);
            overlay.appendChild(label);
          });
        };

        image.addEventListener("click", (event) => {
          const rect = image.getBoundingClientRect();
          const x = ((event.clientX - rect.left) / rect.width) * 100;
          const y = ((event.clientY - rect.top) / rect.height) * 100;
          points.push({ x, y });
          const pointEl = document.createElement("div");
          pointEl.textContent = `${points.length}: ${x.toFixed(1)}%, ${y.toFixed(1)}%`;
          pointList.appendChild(pointEl);
          redrawOverlay();
        });

        // Hook up delete buttons
        zonesList.querySelectorAll(".delete-zone").forEach((btn) => {
          btn.addEventListener("click", async (e) => {
            const zid = e.currentTarget.dataset.zoneId;
            if (!confirm("Delete this area?")) return;
            try {
              const resp = await fetch(`/presence_fusion/api/floorplans/${fp.id}/zones/${zid}`, { method: "DELETE" });
              if (resp.ok) {
                alert("Area deleted");
                this._refreshData();
              } else alert("Failed to delete area");
            } catch (err) {
              console.error(err);
              alert("Error");
            }
          });
        });

        // Populate HA area map select in the editor
        const haAreas = (this.data && this.data.areas) || [];
        const haMapSelect = this.shadowRoot.getElementById("ha-area-map");
        if (haMapSelect) {
          haMapSelect.innerHTML = `
            <option value="">(select HA area)</option>
            ${haAreas.map((a) => `<option value="${a.id}">${a.name || a.id}</option>`).join("")} 
          `;
        }

        this.shadowRoot.getElementById("map-ha-area").addEventListener("click", async () => {
          const haId = this.shadowRoot.getElementById("ha-area-map").value;
          if (!haId) return alert("Select an HA area to map");
          // Create an area on the floorplan mapped to the HA area
          try {
            const resp = await fetch(`/presence_fusion/api/floorplans/${fp.id}/zones`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: `HA Area ${haId}`, zone_data: { ha_area_id: haId } }),
            });
            if (resp.ok) {
              alert("Mapped HA area to floorplan");
              this._refreshData();
            } else alert("Failed to map HA area");
          } catch (err) {
            console.error(err);
            alert("Error");
          }
        });

        this.shadowRoot
          .getElementById("back-to-list")
          .addEventListener("click", () => {
            this.selectedFloorplan = null;
            this._render();
          });

        this.shadowRoot
          .getElementById("save-zone")
          .addEventListener("click", async () => {
            const name = this.shadowRoot.getElementById("zone-name").value.trim();
            if (!name) return alert("Enter an area name");
            if (!points.length) return alert("Add at least one point");
            try {
              const resp = await fetch(
                `/presence_fusion/api/floorplans/${fp.id}/zones`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name, zone_data: { coordinates: points } }),
                },
              );
              if (resp.ok) {
                alert("Area saved");
                this._refreshData();
              } else {
                alert("Failed to save area");
              }
            } catch (err) {
              console.error(err);
              alert("Error");
            }
          });

        this.shadowRoot
          .getElementById("save-proxy")
          .addEventListener("click", async () => {
            const id = this.shadowRoot.getElementById("proxy-id").value.trim();
            const x = parseFloat(this.shadowRoot.getElementById("proxy-x").value);
            const y = parseFloat(this.shadowRoot.getElementById("proxy-y").value);
            if (!id) return alert("Enter proxy ID");
            if (Number.isNaN(x) || Number.isNaN(y)) return alert("Enter X and Y");
            try {
              const resp = await fetch(
                `/presence_fusion/api/floorplans/${fp.id}/proxies`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ proxy_id: id, position: { x, y } }),
                },
              );
              if (resp.ok) {
                alert("Proxy saved");
                this._refreshData();
              } else {
                alert("Failed to save proxy");
              }
            } catch (err) {
              console.error(err);
              alert("Error");
            }
          });

        return;
      }

      content.innerHTML = `
        <h2 class="panel-title">Floorplan</h2>
        <div id="floorplan-list" style="display:grid; grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); gap:12px;"></div>
        <div style="margin-top:20px;">
          <h3>Upload Floorplan</h3>
          <input type="file" id="floorplan-file" accept="image/jpg,image/jpeg,image/png" />
          <input type="text" id="floorplan-name" placeholder="Floorplan name" style="margin:0 8px;" />
          <div style="margin-top:8px;">
            <label for="floorplan-ha-area">Map to HA area (optional):</label>
            <select id="floorplan-ha-area" style="margin-left:8px;"></select>
          </div>
          <button id="upload-floorplan">Upload</button>
        </div>
      `;

      const list = this.shadowRoot.getElementById("floorplan-list");
      // Populate HA areas select for mapping when creating floorplans
      const haAreas = (this.data && this.data.areas) || [];
      const haSelect = this.shadowRoot.getElementById("floorplan-ha-area");
      if (haSelect) {
        haSelect.innerHTML = `
          <option value="">(none)</option>
          ${haAreas.map((a) => `<option value="${a.id}">${a.name || a.id}</option>`).join("")}
        `;
      }

      ((this.data && this.data.floorplans) || []).forEach((fp) => {
        const card = document.createElement("div");
        card.style.cssText =
          "border:1px solid var(--divider-color);padding:12px;border-radius:8px;cursor:pointer;";
        card.innerHTML = `
          <h4>${fp.name}</h4>
          <small>${(fp.zones || []).length} areas</small><br/>
          <button data-fp-id="${fp.id}" class="edit-floorplan" style="margin-top:8px;">Edit</button>
          <button data-fp-id="${fp.id}" class="delete-floorplan" style="margin:8px 4px 0;">Delete</button>
        `;
        list.appendChild(card);
      });

      this.shadowRoot.querySelectorAll(".edit-floorplan").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const fpId = e.currentTarget.dataset.fpId;
          this.selectedFloorplan = fpId;
          this._render();
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
                alert("Floorplan deleted");
                this.selectedFloorplan = null;
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
            const haAreaVal = this.shadowRoot.getElementById("floorplan-ha-area").value;
          if (haAreaVal) formData.append("ha_area", haAreaVal);

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
        const deviceAddress = (d.address || "").toLowerCase();
        const assignedPersonId = (this.data && this.data.device_to_person && this.data.device_to_person[deviceAddress]) || "";
        const peopleSelect = people.length
          ? `
          <select class="device-person" data-device-id="${deviceAddress}" style="margin:4px 0;">
            <option value="">Assign to person...</option>
            ${people.map((p) => `<option value="${p.id}" ${p.id === assignedPersonId ? "selected" : ""}>${p.name}</option>`).join("")}
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
                device_id: deviceId.toLowerCase(),
              }),
            });
            if (resp.ok) {
              alert("Device assigned");
              this._refreshData();
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
