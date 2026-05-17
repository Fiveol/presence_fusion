export function renderPeople(panel, content) {
  const people = (panel.data && panel.data.pf_people) || [];
  content.innerHTML = `<h2 class="panel-title">People</h2><div id="people-list"></div><div style="margin-top:12px;"><input id="new-person-name" placeholder="New person name" /><button id="create-person">Create</button></div>`;

  const list = panel.shadowRoot.getElementById("people-list");
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

  panel.shadowRoot.querySelectorAll(".delete-person").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const personId = e.currentTarget.dataset.personId;
      if (confirm("Delete this person?")) {
        try {
          const resp = await fetch(`/presence_fusion/api/people/${personId}`, {
            method: "DELETE",
          });
          if (resp.ok) {
            alert("Deleted");
            panel._refreshData();
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

  panel.shadowRoot.getElementById("create-person").addEventListener("click", async () => {
    const name = panel.shadowRoot.getElementById("new-person-name").value.trim();
    if (!name) return alert("Enter a name");
    try {
      const resp = await fetch("/presence_fusion/api/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (resp.ok) {
        alert("Created");
        panel._refreshData();
      } else {
        alert("Failed to create");
      }
    } catch (err) {
      console.error(err);
      alert("Failed");
    }
  });
}
