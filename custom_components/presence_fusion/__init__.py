from __future__ import annotations

import base64
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
from .bluetooth import async_get_ble_devices
from .people import PeopleManager
from .floorplan import FloorplanManager

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


class PresenceFusionBleDevicesView(HomeAssistantView):
    url = "/presence_fusion/api/ble/devices"
    name = "presence_fusion:ble_devices"
    requires_auth = False

    async def get(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        try:
            devices = await async_get_ble_devices(hass)
            return web.Response(
                text=json.dumps(devices, default=str),
                content_type="application/json",
            )
        except Exception as err:
            _LOGGER.exception("Failed to fetch BLE devices: %s", err)
            return web.Response(status=500, text=str(err))


class PresenceFusionPeopleListView(HomeAssistantView):
    url = "/presence_fusion/api/people"
    name = "presence_fusion:people_list"
    requires_auth = False

    async def get(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        try:
            people_mgr: PeopleManager = hass.data[DOMAIN].get("people_manager")
            if not people_mgr:
                return web.Response(status=500, text="People manager not initialized")
            
            people = await people_mgr.async_list_people()
            return web.Response(
                text=json.dumps(people, default=str),
                content_type="application/json",
            )
        except Exception as err:
            _LOGGER.exception("Failed to list people: %s", err)
            return web.Response(status=500, text=str(err))

    async def post(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        data = await request.json()
        name = data.get("name")
        if not name:
            return web.Response(status=400, text="Missing name")

        try:
            people_mgr: PeopleManager = hass.data[DOMAIN].get("people_manager")
            if not people_mgr:
                return web.Response(status=500, text="People manager not initialized")
            
            person_id = name.lower().replace(" ", "_").replace("-", "_")
            person = await people_mgr.async_create_person(person_id, name)
            return web.Response(
                text=json.dumps(person, default=str),
                content_type="application/json",
            )
        except Exception as err:
            _LOGGER.exception("Failed to create person: %s", err)
            return web.Response(status=500, text=str(err))


class PresenceFusionPersonDetailView(HomeAssistantView):
    url = "/presence_fusion/api/people/{person_id}"
    name = "presence_fusion:person_detail"
    requires_auth = False

    async def get(self, request: web.Request, person_id: str) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        try:
            people_mgr: PeopleManager = hass.data[DOMAIN].get("people_manager")
            if not people_mgr:
                return web.Response(status=500, text="People manager not initialized")
            
            person = await people_mgr.async_get_person(person_id)
            if not person:
                return web.Response(status=404, text="Person not found")
            
            return web.Response(
                text=json.dumps(person, default=str),
                content_type="application/json",
            )
        except Exception as err:
            _LOGGER.exception("Failed to get person: %s", err)
            return web.Response(status=500, text=str(err))

    async def delete(self, request: web.Request, person_id: str) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        try:
            people_mgr: PeopleManager = hass.data[DOMAIN].get("people_manager")
            if not people_mgr:
                return web.Response(status=500, text="People manager not initialized")
            
            success = await people_mgr.async_delete_person(person_id)
            if not success:
                return web.Response(status=404, text="Person not found")
            
            return web.Response(status=200, text="ok")
        except Exception as err:
            _LOGGER.exception("Failed to delete person: %s", err)
            return web.Response(status=500, text=str(err))


class PresenceFusionDeviceAssignView(HomeAssistantView):
    url = "/presence_fusion/api/device/assign"
    name = "presence_fusion:device_assign"
    requires_auth = False

    async def post(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        data = await request.json()
        person_id = data.get("person_id")
        device_id = data.get("device_id")
        
        if not person_id or not device_id:
            return web.Response(status=400, text="Missing person_id or device_id")

        try:
            people_mgr: PeopleManager = hass.data[DOMAIN].get("people_manager")
            if not people_mgr:
                return web.Response(status=500, text="People manager not initialized")
            
            person = await people_mgr.async_assign_device(person_id, device_id)
            if not person:
                return web.Response(status=404, text="Person not found")
            
            return web.Response(
                text=json.dumps(person, default=str),
                content_type="application/json",
            )
        except Exception as err:
            _LOGGER.exception("Failed to assign device: %s", err)
            return web.Response(status=500, text=str(err))


class PresenceFusionFloorplansListView(HomeAssistantView):
    url = "/presence_fusion/api/floorplans"
    name = "presence_fusion:floorplans_list"
    requires_auth = False

    async def get(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        try:
            floorplan_mgr: FloorplanManager = hass.data[DOMAIN].get("floorplan_manager")
            if not floorplan_mgr:
                return web.Response(status=500, text="Floorplan manager not initialized")
            
            floorplans = await floorplan_mgr.async_list_floorplans()
            return web.Response(
                text=json.dumps(floorplans, default=str),
                content_type="application/json",
            )
        except Exception as err:
            _LOGGER.exception("Failed to list floorplans: %s", err)
            return web.Response(status=500, text=str(err))

    async def post(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        try:
            # Handle multipart form data for file upload
            reader = await request.multipart()
            
            name = None
            image_data = None
            
            async for field in reader:
                if field.name == "name":
                    name = await field.text()
                elif field.name == "image":
                    image_data = await field.read()
            
            if not name:
                return web.Response(status=400, text="Missing floorplan name")
            
            floorplan_mgr: FloorplanManager = hass.data[DOMAIN].get("floorplan_manager")
            if not floorplan_mgr:
                return web.Response(status=500, text="Floorplan manager not initialized")
            
            floorplan = await floorplan_mgr.async_create_floorplan(
                name, image_data=image_data
            )
            return web.Response(
                text=json.dumps(floorplan, default=str),
                content_type="application/json",
            )
        except Exception as err:
            _LOGGER.exception("Failed to create floorplan: %s", err)
            return web.Response(status=500, text=str(err))


class PresenceFusionFloorplanDetailView(HomeAssistantView):
    url = "/presence_fusion/api/floorplans/{floorplan_id}"
    name = "presence_fusion:floorplan_detail"
    requires_auth = False

    async def get(self, request: web.Request, floorplan_id: str) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        try:
            floorplan_mgr: FloorplanManager = hass.data[DOMAIN].get("floorplan_manager")
            if not floorplan_mgr:
                return web.Response(status=500, text="Floorplan manager not initialized")
            
            floorplan = await floorplan_mgr.async_get_floorplan(floorplan_id)
            if not floorplan:
                return web.Response(status=404, text="Floorplan not found")
            
            return web.Response(
                text=json.dumps(floorplan, default=str),
                content_type="application/json",
            )
        except Exception as err:
            _LOGGER.exception("Failed to get floorplan: %s", err)
            return web.Response(status=500, text=str(err))

    async def delete(self, request: web.Request, floorplan_id: str) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        try:
            floorplan_mgr: FloorplanManager = hass.data[DOMAIN].get("floorplan_manager")
            if not floorplan_mgr:
                return web.Response(status=500, text="Floorplan manager not initialized")
            
            success = await floorplan_mgr.async_delete_floorplan(floorplan_id)
            if not success:
                return web.Response(status=404, text="Floorplan not found")
            
            return web.Response(status=200, text="ok")
        except Exception as err:
            _LOGGER.exception("Failed to delete floorplan: %s", err)
            return web.Response(status=500, text=str(err))


class PresenceFusionFloorplanZoneView(HomeAssistantView):
    url = "/presence_fusion/api/floorplans/{floorplan_id}/zones"
    name = "presence_fusion:floorplan_zones"
    requires_auth = False

    async def post(self, request: web.Request, floorplan_id: str) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        data = await request.json()
        zone_name = data.get("name")
        
        if not zone_name:
            return web.Response(status=400, text="Missing zone name")

        try:
            floorplan_mgr: FloorplanManager = hass.data[DOMAIN].get("floorplan_manager")
            if not floorplan_mgr:
                return web.Response(status=500, text="Floorplan manager not initialized")
            
            floorplan = await floorplan_mgr.async_add_zone(
                floorplan_id, zone_name, **data.get("zone_data", {})
            )
            if not floorplan:
                return web.Response(status=404, text="Floorplan not found")
            
            return web.Response(
                text=json.dumps(floorplan, default=str),
                content_type="application/json",
            )
        except Exception as err:
            _LOGGER.exception("Failed to add zone: %s", err)
            return web.Response(status=500, text=str(err))



async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    hass.data.setdefault(DOMAIN, {})
    hass.http.register_view(PresenceFusionPanelJsView())
    hass.http.register_view(PresenceFusionManifestView())
    hass.http.register_view(PresenceFusionApiDataView())
    hass.http.register_view(PresenceFusionPersonCreateView())
    hass.http.register_view(PresenceFusionSettingsView())
    hass.http.register_view(PresenceFusionEntityUpdateView())
    hass.http.register_view(PresenceFusionBleDevicesView())
    hass.http.register_view(PresenceFusionPeopleListView())
    hass.http.register_view(PresenceFusionPersonDetailView())
    hass.http.register_view(PresenceFusionDeviceAssignView())
    hass.http.register_view(PresenceFusionFloorplansListView())
    hass.http.register_view(PresenceFusionFloorplanDetailView())
    hass.http.register_view(PresenceFusionFloorplanZoneView())

    # Initialize managers
    people_mgr = PeopleManager(hass)
    await people_mgr.async_load()
    hass.data[DOMAIN]["people_manager"] = people_mgr

    floorplan_mgr = FloorplanManager(hass)
    await floorplan_mgr.async_load()
    hass.data[DOMAIN]["floorplan_manager"] = floorplan_mgr

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
