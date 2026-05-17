export async function renderFloorplan(panel, content) {
  const floorplans = (panel.data && panel.data.floorplans) || [];

  if (panel.selectedFloorplan) {
    let fp = floorplans.find((item) => item.id === panel.selectedFloorplan);
    if (!fp) {
      panel.selectedFloorplan = null;
      panel._render();
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

    const editor = panel.shadowRoot.getElementById("floorplan-editor");
    editor.style.position = "relative";
    const points = [];
    const pointList = panel.shadowRoot.getElementById("zone-points");
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

    const zonesList = document.createElement("div");
    zonesList.style.marginTop = "8px";
    zonesList.innerHTML = `<h4>Existing Areas</h4>`;
    (fp.zones || []).forEach((z) => {
      const zEl = document.createElement("div");
      zEl.style.padding = "6px 0";
      zEl.innerHTML = `<strong>${z.name}</strong> ${z.ha_area_id ? `(HA Area: ${z.ha_area_id})` : ""} <button data-zone-id="${z.id}" class="delete-zone">Delete</button>`;
      zonesList.appendChild(zEl);
    });
    editor.appendChild(zonesList);

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

    panel.shadowRoot.querySelectorAll(".delete-zone").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const zid = e.currentTarget.dataset.zoneId;
        if (!confirm("Delete this area?")) return;
        try {
          const resp = await fetch(`/presence_fusion/api/floorplans/${fp.id}/zones/${zid}`, { method: "DELETE" });
          if (resp.ok) {
            alert("Area deleted");
            panel._refreshData();
          } else alert("Failed to delete area");
        } catch (err) {
          console.error(err);
          alert("Error");
        }
      });
    });

    const haAreas = (panel.data && panel.data.areas) || [];
    const haMapSelect = panel.shadowRoot.getElementById("ha-area-map");
    if (haMapSelect) {
      haMapSelect.innerHTML = `
        <option value="">(select HA area)</option>
        ${haAreas.map((a) => `<option value="${a.id}">${a.name || a.id}</option>`).join("")}
      `;
    }

    panel.shadowRoot.getElementById("map-ha-area").addEventListener("click", async () => {
      const haId = panel.shadowRoot.getElementById("ha-area-map").value;
      if (!haId) return alert("Select an HA area to map");
      try {
        const resp = await fetch(`/presence_fusion/api/floorplans/${fp.id}/zones`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: `HA Area ${haId}`, zone_data: { ha_area_id: haId } }),
        });
        if (resp.ok) {
          alert("Mapped HA area to floorplan");
          panel._refreshData();
        } else alert("Failed to map HA area");
      } catch (err) {
        console.error(err);
        alert("Error");
      }
    });

    panel.shadowRoot.getElementById("back-to-list").addEventListener("click", () => {
      panel.selectedFloorplan = null;
      panel._render();
    });

    panel.shadowRoot.getElementById("save-zone").addEventListener("click", async () => {
      const name = panel.shadowRoot.getElementById("zone-name").value.trim();
      if (!name) return alert("Enter an area name");
      if (!points.length) return alert("Add at least one point");
      try {
        const resp = await fetch(`/presence_fusion/api/floorplans/${fp.id}/zones`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, zone_data: { coordinates: points } }),
        });
        if (resp.ok) {
          alert("Area saved");
          panel._refreshData();
        } else {
          alert("Failed to save area");
        }
      } catch (err) {
        console.error(err);
        alert("Error");
      }
    });

    panel.shadowRoot.getElementById("save-proxy").addEventListener("click", async () => {
      const id = panel.shadowRoot.getElementById("proxy-id").value.trim();
      const x = parseFloat(panel.shadowRoot.getElementById("proxy-x").value);
      const y = parseFloat(panel.shadowRoot.getElementById("proxy-y").value);
      if (!id) return alert("Enter proxy ID");
      if (Number.isNaN(x) || Number.isNaN(y)) return alert("Enter X and Y");
      try {
        const resp = await fetch(`/presence_fusion/api/floorplans/${fp.id}/proxies`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proxy_id: id, position: { x, y } }),
        });
        if (resp.ok) {
          alert("Proxy saved");
          panel._refreshData();
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

  const list = panel.shadowRoot.getElementById("floorplan-list");
  const haAreas = (panel.data && panel.data.areas) || [];
  const haSelect = panel.shadowRoot.getElementById("floorplan-ha-area");
  if (haSelect) {
    haSelect.innerHTML = `
      <option value="">(none)</option>
      ${haAreas.map((a) => `<option value="${a.id}">${a.name || a.id}</option>`).join("")}
    `;
  }

  (floorplans || []).forEach((fp) => {
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

  panel.shadowRoot.querySelectorAll(".edit-floorplan").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      panel.selectedFloorplan = e.currentTarget.dataset.fpId;
      panel._render();
    });
  });

  panel.shadowRoot.querySelectorAll(".delete-floorplan").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const fpId = e.currentTarget.dataset.fpId;
      if (!confirm("Delete this floorplan?")) return;
      try {
        const resp = await fetch(`/presence_fusion/api/floorplans/${fpId}`, {
          method: "DELETE",
        });
        if (resp.ok) {
          alert("Floorplan deleted");
          panel.selectedFloorplan = null;
          panel._refreshData();
        } else {
          alert("Failed to delete");
        }
      } catch (err) {
        console.error(err);
        alert("Error");
      }
    });
  });

  panel.shadowRoot.getElementById("upload-floorplan").addEventListener("click", async () => {
    const fileInput = panel.shadowRoot.getElementById("floorplan-file");
    const nameInput = panel.shadowRoot.getElementById("floorplan-name");

    if (!fileInput.files.length) return alert("Select a file");
    if (!nameInput.value.trim()) return alert("Enter a name");

    const formData = new FormData();
    formData.append("image", fileInput.files[0]);
    formData.append("name", nameInput.value.trim());

    const haAreaVal = panel.shadowRoot.getElementById("floorplan-ha-area").value;
    if (haAreaVal) {
      formData.append("ha_area", haAreaVal);
    }

    try {
      const resp = await fetch("/presence_fusion/api/floorplans", {
        method: "POST",
        body: formData,
      });
      if (resp.ok) {
        alert("Floorplan uploaded");
        panel._refreshData();
      } else {
        alert("Failed to upload");
      }
    } catch (err) {
      console.error(err);
      alert("Error");
    }
  });
}
