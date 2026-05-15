"""Panel registration for Presence Fusion."""
import logging

from homeassistant.components import frontend
from homeassistant.core import HomeAssistant

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

PANEL_JS_URL = "/presence_fusion/panel.js"


async def async_setup_panel(hass: HomeAssistant) -> None:
    """Register the Presence Fusion panel with Home Assistant frontend."""
    try:
        frontend.async_register_built_in_panel(
            hass,
            DOMAIN,
            sidebar_title="Presence Fusion",
            sidebar_icon="mdi:account-group",
            frontend_url_path=DOMAIN,
            config={"_panel_custom": {"module_url": PANEL_JS_URL}},
            require_admin=False,
        )
        _LOGGER.debug("Presence Fusion panel registered with module_url: %s", PANEL_JS_URL)
    except Exception as err:
        _LOGGER.exception("Failed to register Presence Fusion panel: %s", err)
        raise
