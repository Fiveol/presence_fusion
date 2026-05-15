class PFSidebar extends HTMLElement {

    connectedCallback() {
        this.innerHTML = `
            <div style="width:220px;background:#111;color:white;height:100%;">
                <button id="toggle">☰</button>

                <div>
                    <div data-page="people">People</div>
                    <div data-page="devices">Devices</div>
                    <div data-page="settings">Settings</div>
                </div>
            </div>
        `;

        this.querySelector("#toggle")
            .onclick = () => this.toggle();
    }

    toggle() {
        this.style.width =
            this.style.width === "60px"
                ? "220px"
                : "60px";
    }
}

customElements.define("pf-sidebar", PFSidebar);