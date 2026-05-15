import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN
from .panel import async_register_panel
from .api import async_register_api
from .ble import BLECollector

_LOGGER = logging.getLogger(__name__)

PLATFORMS: list[str] = []


# -----------------------------
# SETUP (YAML / CORE)
# -----------------------------
async def async_setup(hass: HomeAssistant, config: dict):
    return True


# -----------------------------
# SETUP ENTRY (UI CONFIG FLOW)
# -----------------------------
async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry):
    _LOGGER.info("Starting Presence Fusion integration")

    # -----------------------------
    # CORE BLE COLLECTOR
    # -----------------------------
    collector = BLECollector(hass)
    collector.start()

    # -----------------------------
    # SHARED DATA STORE
    # -----------------------------
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN]["collector"] = collector
    hass.data[DOMAIN]["devices"] = collector.normalizer.devices

    # -----------------------------
    # WEBSOCKET API
    # -----------------------------
    await async_register_api(hass)

    # -----------------------------
    # FRONTEND PANEL
    # -----------------------------
    await async_register_panel(hass)

    # -----------------------------
    # FORWARD PLATFORMS (FUTURE USE)
    # -----------------------------
    if entry.unique_id is not None:
        await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    _LOGGER.info("Presence Fusion loaded successfully")
    return True


# -----------------------------
# UNLOAD
# -----------------------------
async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry):
    _LOGGER.info("Unloading Presence Fusion")

    hass.data.pop(DOMAIN, None)
    return True