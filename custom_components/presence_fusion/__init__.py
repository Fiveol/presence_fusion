import asyncio
import time

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.components import bluetooth

from .const import DOMAIN
from .panel import async_register_panel
from .api import ws_ble_state


# -----------------------------
# DEVICE NORMALIZER
# -----------------------------
class DeviceNormalizer:
    def __init__(self):
        self.devices = {}

    def normalize(self, raw):
        mac = raw.get("mac")
        if not mac:
            return None

        device = self.devices.get(mac)

        if not device:
            device = {
                "id": self._generate_id(mac),
                "mac": mac,
                "rssi": raw.get("rssi"),
                "ibeacon": None,
                "sources": set(),
                "last_seen": time.time(),
            }

        # update RSSI
        if raw.get("rssi") is not None:
            device["rssi"] = raw["rssi"]

        # mark source
        if raw.get("source"):
            device["sources"].add(raw["source"])

        # iBeacon merge
        if raw.get("ibeacon"):
            device["ibeacon"] = raw["ibeacon"]
            device["sources"].add("ibeacon")

        device["last_seen"] = time.time()

        self.devices[mac] = device
        return device

    def _generate_id(self, mac: str) -> str:
        return mac.lower().replace(":", "_")


# -----------------------------
# IBEACON PARSER
# -----------------------------
def parse_ibeacon(manufacturer_data: dict):
    """
    Apple iBeacon format:
    Company ID 0x004C
    Type 0x02 0x15
    """
    if not manufacturer_data:
        return None

    apple_data = manufacturer_data.get(76)  # 0x004C
    if not apple_data or len(apple_data) < 23:
        return None

    if apple_data[0] != 0x02 or apple_data[1] != 0x15:
        return None

    uuid = apple_data[2:18].hex()
    major = int.from_bytes(apple_data[18:20], "big")
    minor = int.from_bytes(apple_data[20:22], "big")

    return {
        "uuid": uuid,
        "major": major,
        "minor": minor,
    }


# -----------------------------
# BLE COLLECTOR
# -----------------------------
class BLECollector:
    def __init__(self, hass):
        self.hass = hass
        self.normalizer = DeviceNormalizer()
        self.subscribers = []

    def subscribe(self, cb):
        self.subscribers.append(cb)

    def publish(self, data):
        for cb in self.subscribers:
            cb(data)

    def start(self):
        bluetooth.async_register_callback(
            self.hass,
            self._callback,
            bluetooth.BluetoothCallbackMatcher(),
            bluetooth.BluetoothChange.ADVERTISEMENT,
        )

    def _callback(self, service_info, change):
        ibeacon = parse_ibeacon(
            dict(service_info.manufacturer_data or {})
        )

        raw = {
            "mac": service_info.address,
            "rssi": service_info.rssi,
            "source": service_info.source,
            "ibeacon": ibeacon,
        }

        device = self.normalizer.normalize(raw)

        if device:
            self.publish(device)


# -----------------------------
# HOME ASSISTANT SETUP
# -----------------------------
async def async_setup(hass: HomeAssistant, config: dict):
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry):
    # init core storage
    collector = BLECollector(hass)

    hass.data[DOMAIN] = {
        "collector": collector,
        "devices": collector.normalizer.devices,
    }

    # start BLE
    collector.start()

    # register websocket API
    hass.components.websocket_api.async_register_command(
        ws_ble_state
    )

    # register panel
    await async_register_panel(hass)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry):
    return True