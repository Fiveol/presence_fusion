import time
import logging

from homeassistant.components import bluetooth

_LOGGER = logging.getLogger(__name__)


# =========================================================
# DEVICE NORMALIZER (safe + stable)
# =========================================================
class DeviceNormalizer:
    def __init__(self):
        self.devices = {}

    def normalize(self, raw: dict):
        mac = raw.get("mac")
        if not mac:
            return None

        device = self.devices.get(mac)

        if device is None:
            device = {
                "id": mac.lower().replace(":", "_"),
                "mac": mac,
                "rssi": None,
                "ibeacon": None,
                "sources": set(),
                "last_seen": time.time(),
            }

        # RSSI update
        if raw.get("rssi") is not None:
            device["rssi"] = raw["rssi"]

        # source tracking
        if raw.get("source"):
            device["sources"].add(raw["source"])

        # iBeacon merge
        if raw.get("ibeacon"):
            device["ibeacon"] = raw["ibeacon"]
            device["sources"].add("ibeacon")

        device["last_seen"] = time.time()

        self.devices[mac] = device
        return device


# =========================================================
# IBEACON PARSER (Apple BLE format)
# =========================================================
def parse_ibeacon(manufacturer_data: dict):
    """
    Apple iBeacon format:
    - Company ID: 0x004C (76)
    - Type: 0x02 0x15
    """
    if not manufacturer_data:
        return None

    apple = manufacturer_data.get(76)
    if not apple or len(apple) < 23:
        return None

    try:
        if apple[0] != 0x02 or apple[1] != 0x15:
            return None

        uuid = apple[2:18].hex()
        major = int.from_bytes(apple[18:20], "big")
        minor = int.from_bytes(apple[20:22], "big")

        return {
            "uuid": uuid,
            "major": major,
            "minor": minor,
        }

    except Exception as e:
        _LOGGER.debug("iBeacon parse failed: %s", e)
        return None


# =========================================================
# BLE COLLECTOR (THIS MUST EXIST FOR IMPORT)
# =========================================================
class BLECollector:
    def __init__(self, hass):
        self.hass = hass
        self.normalizer = DeviceNormalizer()
        self.subscribers = []

    def subscribe(self, callback):
        """Frontend/backend listeners."""
        self.subscribers.append(callback)

    def _publish(self, device: dict):
        for cb in self.subscribers:
            try:
                cb(device)
            except Exception as e:
                _LOGGER.debug("Subscriber error: %s", e)

    def start(self):
        """Start listening to Home Assistant Bluetooth events."""

        bluetooth.async_register_callback(
            self.hass,
            self._callback,
            bluetooth.BluetoothCallbackMatcher(),
            bluetooth.BluetoothChange.ADVERTISEMENT,
        )

        _LOGGER.info("Presence Fusion BLE collector started")

    def _callback(self, service_info, change):
        """Handle BLE advertisement events."""

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
            self._publish(device)