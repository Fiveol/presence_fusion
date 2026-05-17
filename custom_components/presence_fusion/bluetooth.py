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
            service_infos = ha_bluetooth.async_discovered_service_info(
                hass, connectable=False
            )
        except Exception as err:
            _LOGGER.debug("async_discovered_service_info failed: %s", err)
            service_infos = []

        if isinstance(service_infos, dict):
            service_infos = list(service_infos.values())

        for service_info in service_infos:
            try:
                device_dict = _service_info_to_dict(service_info)
                if not device_dict:
                    device_dict = _device_to_dict(getattr(service_info, "device", None))
                if not device_dict:
                    continue

                scanner = getattr(service_info, "scanner", None)
                scanner_source = None
                try:
                    scanner_source = (
                        getattr(scanner, "source", None)
                        or getattr(scanner, "address", None)
                    )
                except Exception:
                    scanner_source = None

                device_dict["scanner"] = scanner_source
                device_dict["address"] = device_dict["address"].lower()
                devices.append(device_dict)
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
                        "address": getattr(scanner, "source", None)
                        or getattr(scanner, "address", None),
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


def _service_info_to_dict(service_info: Any) -> dict[str, Any] | None:
    """Convert a BluetoothServiceInfoBleak object to a dict, or None on failure."""
    try:
        address = getattr(service_info, "address", None)
        if not address:
            return None

        name = getattr(service_info, "name", None) or getattr(
            service_info, "local_name", None
        )
        if not name:
            advertisement_data = getattr(service_info, "advertisement_data", None)
            if advertisement_data is not None:
                name = getattr(advertisement_data, "local_name", None)
        name = name or "Unknown BLE Device"

        manufacturer_data = getattr(service_info, "manufacturer_data", None)
        service_data = getattr(service_info, "service_data", None)
        advertisement_data = getattr(service_info, "advertisement_data", None)

        if manufacturer_data is None and advertisement_data is not None:
            manufacturer_data = getattr(advertisement_data, "manufacturer_data", None)
        if service_data is None and advertisement_data is not None:
            service_data = getattr(advertisement_data, "service_data", None)

        return {
            "address": str(address),
            "name": str(name),
            "rssi": getattr(service_info, "rssi", None),
            "manufacturer_data": dict(manufacturer_data or {}),
            "service_data": dict(service_data or {}),
            "tx_power": getattr(service_info, "tx_power", None),
        }
    except Exception as err:
        _LOGGER.debug("Error converting service_info to dict: %s", err)
        return None


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
        return None
