class PresenceFusionApp extends HTMLElement {

    set hass(hass) {
        this._hass = hass;

        if (!this._initialized) {
            this.state = new PFState(hass);

            this.innerHTML = `
                <div style="display:flex;height:100vh;">
                    <pf-sidebar></pf-sidebar>
                    <div id="content" style="flex:1;padding:16px;"></div>
                </div>
            `;

            this.state.loadBLE();

            this._initialized = true;
        }
    }
}

customElements.define("presence-fusion-app", PresenceFusionApp);