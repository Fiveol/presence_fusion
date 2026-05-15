import "../components/version-card.js";

class PresenceFusionPanel extends HTMLElement {

    setConfig(config) {
        this._config = config;
    }

    set hass(hass) {
        this._hass = hass;

        if (!this.content) {
            this.innerHTML = `
                <div style="padding: 24px;">
                    <version-card></version-card>
                </div>
            `;

            this.content = true;
        }

        const card =
            this.querySelector("version-card");

        if (card) {
            card.version =
                this._config.version;
        }
    }
}

customElements.define(
    "presence-fusion",
    PresenceFusionPanel
);