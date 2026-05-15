class VersionCard extends HTMLElement {

    set version(value) {
        this._version = value;
        this.render();
    }

    render() {
        this.innerHTML = `
            <ha-card header="Presence Fusion">
                <div class="card-content">
                    <h2>
                        Version ${this._version}
                    </h2>
                </div>
            </ha-card>
        `;
    }
}

customElements.define(
    "version-card",
    VersionCard
);