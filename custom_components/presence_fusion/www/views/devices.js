export function renderDevices(panel, content) {
  const bleDevices = (panel.data && panel.data.ble_devices) || [];
  const devices = (panel.data && panel.data.device_trackers) || [];
  const people = (panel.data && panel.data.pf_people) || [];

  content.innerHTML = `<h2 class="panel-title">Devices</h2>
    <h3>BLE Devices</h3>
    <div id="ble-list" style="max-height:40vh;overflow:auto;"></div>
    <div id="ble-empty" style="color: var(--secondary-text-color); margin-bottom: 16px; display: none;"></div>
    <h3>Device Trackers</h3>
    <div id="device-trackers-list"></div>
    <div id="devices-list"></div>`;

  const bleList = panel.shadowRoot.getElementById("ble-list");
  const bleEmpty = panel.shadowRoot.getElementById("ble-empty");
  if (!bleDevices.length) {
    bleEmpty.style.display = "block";
    bleEmpty.textContent = people.length
      ? "No BLE devices found. Make sure Bluetooth scanning is enabled and devices are in range."
      : "No BLE devices found. Create a person first in the People tab to allow assignment once devices appear.";
  }

  bleDevices.forEach((d) => {
    const deviceAddress = (d.address || "").toLowerCase();
    const assignedPersonId =
      (panel.data && panel.data.device_to_person && panel.data.device_to_person[deviceAddress]) ||
      "";
    const peopleSelect = people.length
      ? `
      <select class="device-person" data-device-id="${deviceAddress}" style="margin:4px 0; width:100%;">
        <option value="">Assign to person...</option>
        ${people
          .map(
            (p) =>
              `<option value="${p.id}" ${p.id === assignedPersonId ? "selected" : ""}>${p.name}</option>`,
          )
          .join("")}
      </select>
    `
      : "";

    const item = document.createElement("div");
    item.style.padding = "8px";
    item.style.borderBottom = "1px solid var(--divider-color)";
    item.innerHTML = `
      <div><strong>${d.name || "Unknown"}</strong> (${d.address})</div>
      <div><small>RSSI: ${d.rssi || "N/A"}</small></div>
      ${peopleSelect}
    `;
    bleList.appendChild(item);
  });

  const trackerList = panel.shadowRoot.getElementById("device-trackers-list");
  if (!devices.length) {
    trackerList.innerHTML = `<div style="color: var(--secondary-text-color);">No device trackers found.</div>`;
  }

  devices.forEach((d) => {
    const entityId = d.entity_id || "";
    const assignedPersonId =
      (panel.data && panel.data.device_to_person && panel.data.device_to_person[entityId.toLowerCase()]) ||
      "";
    const peopleSelect = people.length
      ? `
      <select class="device-person" data-device-id="${entityId.toLowerCase()}" style="margin:4px 0; width:100%;">
        <option value="">Assign to person...</option>
        ${people
          .map(
            (p) =>
              `<option value="${p.id}" ${p.id === assignedPersonId ? "selected" : ""}>${p.name}</option>`,
          )
          .join("")}
      </select>
    `
      : "";

    const item = document.createElement("div");
    item.style.padding = "8px";
    item.style.borderBottom = "1px solid var(--divider-color)";
    item.innerHTML = `
      <div><strong>${d.attributes.friendly_name || entityId}</strong></div>
      <div><small>${entityId}</small></div>
      ${peopleSelect}
    `;
    trackerList.appendChild(item);
  });

  panel.shadowRoot.querySelectorAll(".device-person").forEach((sel) => {
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
          panel._refreshData();
        } else {
          alert("Failed to assign");
        }
      } catch (err) {
        console.error(err);
        alert("Error");
      }
    });
  });

  const list = panel.shadowRoot.getElementById("devices-list");
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

  panel.shadowRoot.querySelectorAll(".rename-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const ent = e.currentTarget.dataset.entity;
      const input = panel.shadowRoot.querySelector(`input.rename-input[data-entity="${ent}"]`);
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
          panel._refreshData();
        } else {
          alert("Failed");
        }
      } catch (err) {
        console.error(err);
        alert("Error");
      }
    });
  });
}
