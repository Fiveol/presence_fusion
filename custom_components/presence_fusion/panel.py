"""Panel registration for Presence Fusion."""
import logging

from homeassistant.components import frontend, panel_custom
from homeassistant.core import HomeAssistant

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

PANEL_JS_URL = "/presence_fusion/panel.js"


async def async_setup_panel(hass: HomeAssistant) -> None:
    """Register the Presence Fusion panel with Home Assistant frontend."""
    try:
        if frontend.async_panel_exists(hass, DOMAIN):
            _LOGGER.debug("Presence Fusion panel already registered")
            return
        await panel_custom.async_register_panel(
            hass=hass,
            frontend_url_path=DOMAIN,
            webcomponent_name="presence-fusion-panel",
            sidebar_title="Presence Fusion",
            sidebar_icon="mdi:account-group",
            module_url=PANEL_JS_URL,
            require_admin=False,
        )
        _LOGGER.debug("Presence Fusion panel registered")
    except Exception as err:
        _LOGGER.exception("Failed to register Presence Fusion panel: %s", err)
        raise
