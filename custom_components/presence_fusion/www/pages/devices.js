class PFDevicesPage extends HTMLElement {

    set state(state) {
        this._state = state;
        this.render();
    }

    render() {
        const devices = Object.values(
            this._state.devices || {}
        );

        this.innerHTML = `
            <ha-card header="Devices">
                <div class="card-content">
                    ${devices.map(d => `
                        <div style="padding:8px;border-bottom:1px solid #333">
                            <div><b>${d.mac}</b></div>
                            <div>RSSI: ${d.rssi}</div>
                            <div>${d.name || "Unknown"}</div>
                        </div>
                    `).join("")}
                </div>
            </ha-card>
        `;
    }
}

customElements.define("pf-devices", PFDevicesPage);