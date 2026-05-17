import { saveSettings } from "../api.js";

export async function renderSettings(panel, content) {
  const poll =
    (panel.data && panel.data.ble_poll_interval) || window.presenceFusionPoll || 5;
  const cesiumToken = (panel.data && panel.data.cesium_token) || "";

  content.innerHTML = `
    <h2 class="panel-title">Settings</h2>
    <label>BLE poll frequency (seconds): <span id="poll-val">${poll}</span></label>
    <input id="poll-range" type="range" min="0.1" max="60" step="0.1" value="${poll}" />
    <div style="margin-top:12px;"><label>Cesium Ion Token (optional):</label><input id="cesium-token" style="width:100%;" value="${cesiumToken}" placeholder="Paste Cesium Ion token"/></div>
    <button id="save-settings">Save</button>
  `;

  panel.shadowRoot
    .getElementById("poll-range")
    .addEventListener("input", (e) => {
      panel.shadowRoot.getElementById("poll-val").textContent = e.target.value;
    });

  panel.shadowRoot
    .getElementById("save-settings")
    .addEventListener("click", async () => {
      const val = parseFloat(panel.shadowRoot.getElementById("poll-range").value);
      const token = panel.shadowRoot.getElementById("cesium-token").value.trim();
      const ok = await saveSettings(val, token);
      if (ok) {
        window.presenceFusionPoll = val;
        window.presenceFusionCesiumToken = token;
        alert("Settings saved");
      } else {
        alert("Failed to save settings");
      }
    });
}
