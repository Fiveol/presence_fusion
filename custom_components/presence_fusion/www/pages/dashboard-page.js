class PresenceFusionDashboard extends HTMLElement {
    set hass(hass) {
        this._hass = hass;
    }

    set config(config) {
        this._config = config;

        if (!this._rendered) {
            this.innerHTML = `
                <ha-card header="Presence Fusion">
                    <div class="card-content">
                        <h2>
                            Version ${config.version}
                        </h2>
                    </div>
                </ha-card>
            `;

            this._rendered = true;
        }
    }
}

customElements.define(
    "presence-fusion-dashboard",
    PresenceFusionDashboard
);