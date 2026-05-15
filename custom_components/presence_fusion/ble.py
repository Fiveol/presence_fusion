from homeassistant.components import bluetooth
from homeassistant.core import HomeAssistant


class PresenceFusionBLE:
    def __init__(self, hass: HomeAssistant):
        self.hass = hass
        self.devices = {}

    def start(self):
        bluetooth.async_register_callback(
            self.hass,
            self._callback,
            bluetooth.BluetoothCallbackMatcher(),
            bluetooth.BluetoothChange.ADVERTISEMENT,
        )

    def _callback(self, service_info, change):
        address = service_info.address
        rssi = service_info.rssi

        self.devices[address] = {
            "mac": address,
            "rssi": rssi,
            "name": service_info.name,
            "source": service_info.source,
            "manufacturer_data": dict(service_info.manufacturer_data or {}),
        }