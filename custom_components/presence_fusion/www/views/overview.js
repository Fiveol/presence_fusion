export function renderOverview(panel, content) {
  const people = (panel.data && panel.data.pf_people) || [];
  const zones = (panel.data && panel.data.zones) || [];
  const bleDevices = (panel.data && panel.data.ble_devices) || [];

  const peopleHtml =
    "<ul>" +
    people.map((p) => `<li>${p.name} (${p.devices.length} devices)</li>`).join("") +
    "</ul>";
  const zonesHtml =
    "<ul>" +
    zones
      .map((z) => `<li>${z.attributes.friendly_name || z.entity_id}: ${z.state}</li>`)
      .join("") +
    "</ul>";
  const bleHtml =
    "<ul>" +
    bleDevices
      .slice(0, 10)
      .map((d) => `<li>${d.name || "Unknown"}: RSSI ${d.rssi || "N/A"}</li>`)
      .join("") +
    "</ul>";

  content.innerHTML = `
    <h2 class="panel-title">Overview</h2>
    <p>Version ${panel.version ? `v${panel.version}` : "Loading..."}</p>
    <h3>People</h3>
    ${peopleHtml || "<p>No people</p>"}
    <h3>Zones</h3>
    ${zonesHtml || "<p>No zones</p>"}
    <h3>BLE Devices (Top 10)</h3>
    ${bleHtml || "<p>No BLE devices</p>"}
  `;
}
