export async function renderMap(panel, content) {
  content.innerHTML = `
    <h2 class="panel-title">Map (3D)</h2>
    <div id="cesium-container" style="height:70vh; width:100%; border:1px solid var(--divider-color);"></div>
    <p><small>Loading 3D map. Click and drag to rotate, scroll to zoom.</small></p>
  `;

  if (!window.Cesium && !panel._cesiumLoading) {
    panel._cesiumLoading = true;
    const widgetsCss = "https://cesium.com/downloads/cesiumjs/releases/1.120/Build/Cesium/Widgets/widgets.css";
    try {
      const styleEl = document.createElement("style");
      styleEl.textContent = `@import url('${widgetsCss}'); #cesium-container { min-height: 70vh; height:70vh; }`;
      panel.shadowRoot.appendChild(styleEl);
    } catch (err) {
      console.warn("Could not inject Cesium widgets CSS into shadow root:", err);
    }

    const script = document.createElement("script");
    script.src = "https://cesium.com/downloads/cesiumjs/releases/1.120/Build/Cesium/Cesium.js";
    script.onload = () => panel._render();
    script.onerror = () => {
      const container = panel.shadowRoot.getElementById("cesium-container");
      if (container) {
        container.innerHTML = "<p>Unable to load Cesium. Please check network or try again later.</p>";
      }
    };
    document.head.appendChild(script);
  }

  if (!window.Cesium) {
    return;
  }

  const container = panel.shadowRoot.getElementById("cesium-container");
  if (!container) {
    return;
  }

  try {
    const token =
      (panel.data && panel.data.cesium_token) ||
      window.presenceFusionCesiumToken ||
      (window.__presence_fusion_cesium_token || null);
    if (token && window.Cesium && window.Cesium.Ion) {
      window.Cesium.Ion.defaultAccessToken = token;
    }
  } catch (e) {
    console.debug("No Cesium Ion token applied:", e);
  }

  if (!panel._cesiumViewer) {
    panel._cesiumViewer = new window.Cesium.Viewer(container, {
      terrainProvider: new window.Cesium.EllipsoidTerrainProvider(),
      imageryProvider: new window.Cesium.OpenStreetMapImageryProvider({
        url: "https://a.tile.openstreetmap.org/",
      }),
      baseLayerPicker: false,
      sceneMode: window.Cesium.SceneMode.SCENE3D,
    });
  }

  const viewer = panel._cesiumViewer;
  viewer.entities.removeAll();

  const zones = (panel.data && panel.data.zones) || [];
  const people = (panel.data && panel.data.pf_people) || [];

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
}
