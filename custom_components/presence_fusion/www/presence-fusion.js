class PresenceFusionPanel extends HTMLElement {
    setConfig(config) {
        this._config = config;
    }

    set hass(hass) {
        this._hass = hass;

        if (!this._initialized) {
            this.innerHTML = `
                <div style="padding: 24px;">
                    <presence-fusion-dashboard></presence-fusion-dashboard>
                </div>
            `;

            this._initialized = true;
        }

        const dashboard = this.querySelector(
            "presence-fusion-dashboard"
        );

        if (dashboard) {
            dashboard.hass = hass;
            dashboard.config = this._config;
        }
    }
}

customElements.define(
    "presence-fusion",
    PresenceFusionPanel
);