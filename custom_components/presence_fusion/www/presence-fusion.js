class PresenceFusionPanel extends HTMLElement {
    set hass(hass) {
        this._hass = hass;

        if (!this._rendered) {
            this.innerHTML = `
                <div style="padding:24px">
                    <h1>Presence Fusion</h1>
                    <p>Panel loaded successfully</p>
                </div>
            `;

            this._rendered = true;
        }
    }

    setConfig(config) {
        this._config = config;
    }
}

customElements.define(
    "presence-fusion",
    PresenceFusionPanel
);