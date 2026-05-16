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
from .panel import async_setup_panel
from .entities import async_create_zone_entities, async_create_person_entity

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
        return web.FileResponse(
            MANIFEST_FILE,
            headers={"Content-Type": "application/json"},
        )


class PresenceFusionApiDataView(HomeAssistantView):
    url = "/presence_fusion/api/data"
    name = "presence_fusion:api_data"
    requires_auth = False

    def _safe_value(self, value):
        if isinstance(value, (str, int, float, bool)) or value is None:
            return value
        if isinstance(value, dict):
            return {str(k): self._safe_value(v) for k, v in value.items()}
        if isinstance(value, (list, tuple, set)):
            return [self._safe_value(v) for v in value]
        return str(value)

    async def get(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        try:
            states = hass.states.async_all()
            people = [s for s in states if s.entity_id.startswith("person.")]
            zones = [s for s in states if s.entity_id.startswith("zone.")]
            device_trackers = [s for s in states if s.entity_id.startswith("device_tracker.")]
            binary_sensors = [s for s in states if s.entity_id.startswith("binary_sensor.")]

            def simplify(s):
                return {
                    "entity_id": s.entity_id,
                    "state": s.state,
                    "attributes": {k: self._safe_value(v) for k, v in s.attributes.items()},
                }

            payload = {
                "people": [simplify(s) for s in people],
                "zones": [simplify(s) for s in zones],
                "device_trackers": [simplify(s) for s in device_trackers],
                "binary_sensors": [simplify(s) for s in binary_sensors],
            }
        except Exception as err:
            _LOGGER.exception("Error gathering data for API: %s", err)
            return web.Response(status=500, text=str(err))

        return web.Response(
            text=json.dumps(payload, default=str),
            content_type="application/json",
        )


class PresenceFusionPersonCreateView(HomeAssistantView):
    url = "/presence_fusion/api/person"
    name = "presence_fusion:person_create"
    requires_auth = False

    async def post(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        data = await request.json()
        name = data.get("name")
        if not name:
            return web.Response(status=400, text="Missing name")

        try:
            if hass.services.has_service("person", "create"):
                await hass.services.async_call("person", "create", {"name": name}, blocking=True)
            else:
                _LOGGER.debug("person.create service not available, creating person state directly")
                person_id = name.lower().replace(" ", "_")
                hass.states.async_set(
                    f"person.presence_fusion_{person_id}",
                    "home",
                    attributes={"friendly_name": name},
                )
            person_id = name.lower().replace(" ", "_")
            await async_create_person_entity(hass, person_id, name)
        except Exception as err:
            _LOGGER.exception("Failed to create person: %s", err)
            return web.Response(status=500, text=str(err))

        return web.Response(status=200, text="ok")


class PresenceFusionSettingsView(HomeAssistantView):
    url = "/presence_fusion/api/settings"
    name = "presence_fusion:settings"
    requires_auth = False

    async def post(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        data = await request.json()
        poll = data.get("ble_poll_interval")
        try:
            if poll is not None:
                hass.data.setdefault(DOMAIN, {})["ble_poll_interval"] = float(poll)
        except Exception as err:
            _LOGGER.exception("Failed to set settings: %s", err)
            return web.Response(status=500, text=str(err))

        return web.Response(status=200, text="ok")


class PresenceFusionEntityUpdateView(HomeAssistantView):
    url = "/presence_fusion/api/entity"
    name = "presence_fusion:entity_update"
    requires_auth = False

    async def post(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        data = await request.json()
        entity_id = data.get("entity_id")
        if not entity_id:
            return web.Response(status=400, text="Missing entity_id")

        state_obj = hass.states.get(entity_id)
        if state_obj is None:
            return web.Response(status=404, text="Entity not found")

        new_state = data.get("state", state_obj.state)
        new_attributes = dict(state_obj.attributes)
        new_attributes.update(data.get("attributes", {}))

        try:
            hass.states.async_set(entity_id, new_state, attributes=new_attributes)
        except Exception as err:
            _LOGGER.exception("Failed to update entity %s: %s", entity_id, err)
            return web.Response(status=500, text=str(err))

        return web.Response(status=200, text="ok")


class PresenceFusionEntityUpdateView(HomeAssistantView):
    url = "/presence_fusion/api/entity"
    name = "presence_fusion:entity_update"
    requires_auth = False

    async def post(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        data = await request.json()
        entity_id = data.get("entity_id")
        if not entity_id:
            return web.Response(status=400, text="Missing entity_id")

        state_obj = hass.states.get(entity_id)
        if state_obj is None:
            return web.Response(status=404, text="Entity not found")

        new_state = data.get("state", state_obj.state)
        new_attributes = dict(state_obj.attributes)
        new_attributes.update(data.get("attributes", {}))

        try:
            hass.states.async_set(entity_id, new_state, attributes=new_attributes)
        except Exception as err:
            _LOGGER.exception("Failed to update entity %s: %s", entity_id, err)
            return web.Response(status=500, text=str(err))

        return web.Response(status=200, text="ok")


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    hass.data.setdefault(DOMAIN, {})
    hass.http.register_view(PresenceFusionPanelJsView())
    hass.http.register_view(PresenceFusionManifestView())
    hass.http.register_view(PresenceFusionApiDataView())
    hass.http.register_view(PresenceFusionPersonCreateView())
    hass.http.register_view(PresenceFusionSettingsView())
    hass.http.register_view(PresenceFusionEntityUpdateView())

    try:
        await async_setup_panel(hass)
    except Exception as err:
        _LOGGER.warning("Panel setup failed: %s", err)

    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    try:
        await async_setup_panel(hass)
    except Exception as err:
        _LOGGER.warning("Panel re-registration failed: %s", err)

    # Create entities for existing zones
    try:
        states = hass.states.async_all()
        for state in states:
            if state.entity_id.startswith("zone."):
                zone_id = state.entity_id.replace("zone.", "")
                zone_name = state.attributes.get("friendly_name", zone_id)
                await async_create_zone_entities(hass, zone_id, zone_name)
    except Exception as err:
        _LOGGER.warning("Failed to create zone entities: %s", err)

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
