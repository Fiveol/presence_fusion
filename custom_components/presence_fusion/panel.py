from homeassistant.core import HomeAssistant

from .const import DOMAIN, PANEL_URL


async def async_register_panel(
    hass: HomeAssistant,
):
    version = (
        hass.data["integrations"]
        [DOMAIN]
        .manifest["version"]
    )

    hass.http.register_static_path(
        PANEL_URL,
        hass.config.path(
            "custom_components/presence_fusion/www"
        ),
        cache_headers=False,
    )

    hass.components.frontend.async_register_built_in_panel(
        component_name="custom",
        sidebar_title="Presence Fusion",
        sidebar_icon="mdi:home-account",
        frontend_url_path="presence-fusion",
        config={
            "_panel_custom": {
                "name": "presence-fusion",
                "module_url": (
                    f"{PANEL_URL}"
                    "/presence-fusion.js"
                    f"?v={version}"
                ),
                "embed_iframe": False,
                "trust_external": False,
                "version": version,
            }
        },
        require_admin=False,
    )