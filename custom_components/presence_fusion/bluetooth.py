"""Bluetooth device integration for Presence Fusion."""
import logging
from typing import Any

from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)


async def async_get_ble_devices(hass: HomeAssistant) -> dict[str, Any]:
    """Fetch BLE devices from the Bluetooth integration.
    
    Returns a dict with:
    - proxies: list of Bluetooth adapters/proxies
    - devices: list of discovered BLE devices
    
    This function gracefully handles missing Bluetooth integration data
    and returns empty lists if data is unavailable.
    """
    proxies = []
    devices = []
    
    try:
        # Try to access Bluetooth integration data
        bt_data = hass.data.get("bluetooth")
        if not bt_data:
            _LOGGER.debug("No Bluetooth data available")
            return {"proxies": [], "devices": []}
        
        # Try to get manager
        manager = bt_data.get("manager")
        if manager:
            try:
                # Try different attributes where devices might be stored
                device_list = None
                if hasattr(manager, "discovered_devices"):
                    device_list = manager.discovered_devices
                elif hasattr(manager, "devices"):
                    device_list = manager.devices
                
                if device_list:
                    for device in device_list:
                        device_dict = _device_to_dict(device)
                        if device_dict:
                            devices.append(device_dict)
            except Exception as err:
                _LOGGER.debug("Error extracting devices from manager: %s", err)
        
        # Try to get scanners
        scanners = bt_data.get("scanners", {})
        if isinstance(scanners, dict):
            for adapter_addr, scanner in scanners.items():
                try:
                    proxies.append({
                        "address": str(adapter_addr),
                        "type": "bluetooth_scanner",
                    })
                except Exception as err:
                    _LOGGER.debug("Error processing scanner %s: %s", adapter_addr, err)
        
        return {
            "proxies": proxies,
            "devices": devices,
        }
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
