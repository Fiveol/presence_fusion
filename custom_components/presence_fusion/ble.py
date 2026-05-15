import time

from homeassistant.components import bluetooth


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
                "id": mac.lower().replace(":", "_"),
                "mac": mac,
                "rssi": None,
                "ibeacon": None,
                "sources": set(),
                "last_seen": time.time(),
            }

        if raw.get("rssi") is not None:
            device["rssi"] = raw["rssi"]

        if raw.get("source"):
            device["sources"].add(raw["source"])

        if raw.get("ibeacon"):
            device["ibeacon"] = raw["ibeacon"]
            device["sources"].add("ibeacon")

        device["last_seen"] = time.time()

        self.devices[mac] = device
        return device


# -----------------------------
# IBEACON PARSER
# -----------------------------
def parse_ibeacon(manufacturer_data: dict):
    if not manufacturer_data:
        return None

    apple = manufacturer_data.get(76)  # 0x004C Apple

    if not apple or len(apple) < 23:
        return None

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


# -----------------------------
# BLE COLLECTOR (THIS FIXES YOUR ERROR)
# -----------------------------
class BLECollector:
    def __init__(self, hass):
        self.hass = hass
        self.normalizer = DeviceNormalizer()
        self.subscribers = []

    def subscribe(self, cb):
        self.subscribers.append(cb)

    def publish(self, device):
        for cb in self.subscribers:
            cb(device)

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