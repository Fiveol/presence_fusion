"""Bluetooth device integration for Presence Fusion."""
import logging
from typing import Any

from homeassistant.components import bluetooth as ha_bluetooth
from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)


async def async_get_ble_devices(hass: HomeAssistant) -> dict[str, Any]:
    """Fetch BLE devices using Home Assistant's official bluetooth API.

    Uses the `bluetooth` helper APIs to retrieve discovered advertisements
    and current scanner / adapter information. Falls back gracefully and
    returns empty lists on error.
    """
    proxies: list[dict[str, Any]] = []
    devices: list[dict[str, Any]] = []

    try:
        # Fetch cached discoveries (only devices still present will be returned)
        try:
            service_infos = await ha_bluetooth.async_discovered_service_info(
                hass, connectable=False
            )
        except Exception as err:
            _LOGGER.debug("async_discovered_service_info failed: %s", err)
            service_infos = []

        for info in service_infos:
            try:
                address = getattr(info, "address", None)
                if not address:
                    continue

                # Name can be on the service_info or nested on a BLEDevice
                name = getattr(info, "name", None) or getattr(info, "local_name", None)
                if not name:
                    device_obj = getattr(info, "device", None)
                    name = getattr(device_obj, "name", None) if device_obj is not None else None
                if not name:
                    name = "Unknown BLE Device"

                devices.append(
                    {
                        "address": str(address),
                        "name": str(name),
                        "rssi": getattr(info, "rssi", None),
                        "manufacturer_data": dict(getattr(info, "manufacturer_data", {}) or {}),
                        "service_data": dict(getattr(info, "service_data", {}) or {}),
                        "tx_power": getattr(info, "tx_power", None),
                    }
                )
            except Exception as err:
                _LOGGER.debug("Error converting service_info to dict: %s", err)

        # Inspect current scanners (adapters)
        try:
            scanners = ha_bluetooth.async_current_scanners(hass)
        except Exception as err:
            _LOGGER.debug("async_current_scanners failed: %s", err)
            scanners = []

        for scanner in scanners:
            try:
                proxies.append(
                    {
                        "address": getattr(scanner, "source", None) or getattr(scanner, "address", None),
                        "type": "bluetooth_scanner",
                        "current_mode": getattr(scanner, "current_mode", None),
                    }
                )
            except Exception as err:
                _LOGGER.debug("Error processing scanner: %s", err)

        return {"proxies": proxies, "devices": devices}
    except Exception as err:
        _LOGGER.debug("Error in async_get_ble_devices: %s", err)
        return {"proxies": [], "devices": []}


def _device_to_dict(device: Any) -> dict[str, Any] | None:
    """Convert a Bluetooth device to a dict, or None if conversion fails."""
    try:
        address = getattr(device, "address", None)
        if not address:
            return None
        
        name = getattr(device, "name", None) or getattr(
            device, "local_name", "Unknown BLE Device"
        )
        
        return {
            "address": str(address),
            "name": str(name),
            "rssi": getattr(device, "rssi", None),
            "manufacturer_data": dict(getattr(device, "manufacturer_data", {})),
            "service_data": dict(getattr(device, "service_data", {})),
            "tx_power": getattr(device, "tx_power", None),
        }
    except Exception as err:
        _LOGGER.debug("Error converting device to dict: %s", err)
        return None
