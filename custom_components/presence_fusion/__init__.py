from __future__ import annotations

import json
import logging
from pathlib import Path

from aiohttp import web
from homeassistant.components import frontend
from homeassistant.components.http import HomeAssistantView
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.typing import ConfigType

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

PANEL_JS_PATH = "/presence_fusion/panel.js"
MANIFEST_JSON_PATH = "/presence_fusion/manifest.json"
MANIFEST_FILE = Path(__file__).parent / "manifest.json"
PANEL_JS_FILE = Path(__file__).parent / "www" / "panel.js"


class PresenceFusionPanelJsView(HomeAssistantView):
    url = PANEL_JS_PATH
    name = "presence_fusion:panel_js"
    requires_auth = False

    async def get(self, request: web.Request) -> web.Response:
        return web.FileResponse(PANEL_JS_FILE)


class PresenceFusionManifestView(HomeAssistantView):
    url = MANIFEST_JSON_PATH
    name = "presence_fusion:manifest"
    requires_auth = False

    async def get(self, request: web.Request) -> web.Response:
        try:
            manifest = json.loads(MANIFEST_FILE.read_text(encoding="utf-8"))
        except Exception as err:
            _LOGGER.error("Unable to read manifest.json: %s", err)
            return web.Response(status=500, text="Unable to read manifest")

        return web.Response(
            text=json.dumps(manifest), content_type="application/json"
        )


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    hass.data.setdefault(DOMAIN, {})
    hass.http.register_view(PresenceFusionPanelJsView())
    hass.http.register_view(PresenceFusionManifestView())
    frontend.add_extra_js_url(hass, PANEL_JS_PATH)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    try:
        frontend.async_register_built_in_panel(
            hass,
            DOMAIN,
            sidebar_title=entry.title or "Presence Fusion",
            frontend_url_path=DOMAIN,
            sidebar_icon="mdi:account-group",
            require_admin=False,
            show_in_sidebar=True,
        )
    except Exception:  # defensive: different HA versions have different signatures
        _LOGGER.exception("Could not register builtin panel; continuing without sidebar")

    hass.data[DOMAIN][entry.entry_id] = entry.data
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    hass.data[DOMAIN].pop(entry.entry_id, None)
    try:
        if frontend.async_panel_exists(hass, DOMAIN):
            frontend.async_remove_panel(hass, DOMAIN)
        if hasattr(frontend, "remove_extra_js_url"):
            frontend.remove_extra_js_url(hass, PANEL_JS_PATH)
    except Exception:
        _LOGGER.debug("Could not remove panel cleanly")
    return True
