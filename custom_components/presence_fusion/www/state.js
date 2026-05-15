class PFState {
    constructor(hass) {
        this.hass = hass;
        this.devices = {};
        this.listeners = [];
    }

    async loadBLE() {
        const data = await this.hass.callWS({
            type: "presence_fusion/ble_state"
        });

        this.devices = data.devices;
        this.emit();
    }

    subscribe(cb) {
        this.listeners.push(cb);
    }

    emit() {
        this.listeners.forEach(cb => cb(this));
    }
}

window.PFState = PFState;