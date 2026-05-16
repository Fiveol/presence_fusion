"""Bluetooth device integration for Presence Fusion."""
import logging
from typing import Any

from homeassistant.components.bluetooth import async_scanner_count_by_adapter
from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)


async def async_get_ble_devices(hass: HomeAssistant) -> dict[str, Any]:
    """Fetch BLE devices and proxies from the Bluetooth integration.
    
    Returns a dict with:
    - proxies: list of Bluetooth adapters/proxies
    - devices: list of discovered BLE devices
    """
    try:
        # Get Bluetooth data from hass.data
        bt_data = hass.data.get("bluetooth", {})
        
        # Try to get scanner information
        scanner_count = await async_scanner_count_by_adapter(hass)
        
        proxies = []
        devices = []
        
        # Build proxies list from scanner count
        for adapter_address, count in scanner_count.items():
            proxies.append({
                "address": adapter_address,
                "device_count": count,
                "type": "bluetooth_proxy",
            })
        
        # Try to get devices from bluetooth manager
        if "manager" in bt_data:
            manager = bt_data["manager"]
            if hasattr(manager, "devices"):
                for device in manager.devices:
                    devices.append({
                        "address": getattr(device, "address", "unknown"),
                        "name": getattr(device, "name", "Unknown BLE Device"),
                        "rssi": getattr(device, "rssi", None),
                        "manufacturer_data": getattr(device, "manufacturer_data", {}),
                        "service_data": getattr(device, "service_data", {}),
                    })
        
        return {
            "proxies": proxies,
            "devices": devices,
        }
    except Exception as err:
        _LOGGER.exception("Failed to fetch BLE devices: %s", err)
        return {"proxies": [], "devices": []}


async def async_get_proxy_info(hass: HomeAssistant) -> list[dict[str, Any]]:
    """Get detailed Bluetooth proxy information."""
    proxies = []
    try:
        scanner_count = await async_scanner_count_by_adapter(hass)
        for adapter_address, count in scanner_count.items():
            # Extract proxy name from address if possible
            proxy_name = adapter_address.replace(":", "_").lower()
            proxies.append({
                "id": proxy_name,
                "address": adapter_address,
                "device_count": count,
                "friendly_name": f"Proxy {adapter_address}",
            })
    except Exception as err:
        _LOGGER.exception("Failed to get proxy info: %s", err)
    
    return proxies
