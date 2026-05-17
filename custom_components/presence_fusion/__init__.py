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
from homeassistant.helpers import area_registry
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.typing import ConfigType

from .const import DOMAIN, PLATFORMS
from .data import PresenceFusionData, SIGNAL_UPDATE
from .panel import async_setup_panel
from .entities import async_create_person_entity
from .bluetooth import async_get_ble_devices
from .people import PeopleManager
from .floorplan import FloorplanManager

_LOGGER = logging.getLogger(__name__)

PANEL_JS_PATH = "/presence_fusion/panel.js"
MANIFEST_JSON_PATH = "/presence_fusion/manifest.json"
MANIFEST_FILE = Path(__file__).parent / "manifest.json"
PANEL_JS_FILE = Path(__file__).parent / "www" / "panel.js"
WWW_DIR = Path(__file__).parent / "www"


class PresenceFusionPanelJsView(HomeAssistantView):
    url = PANEL_JS_PATH
    name = "presence_fusion:panel_js"
    requires_auth = False

    async def get(self, request: web.Request) -> web.Response:
        return web.FileResponse(
            PANEL_JS_FILE,
            headers={"Content-Type": "application/javascript"},
        )


class PresenceFusionManifestView(HomeAssistantView):
    url = MANIFEST_JSON_PATH
    name = "presence_fusion:manifest"
    requires_auth = False

    async def get(self, request: web.Request) -> web.Response:
        return web.FileResponse(
            MANIFEST_FILE,
            headers={"Content-Type": "application/json"},
        )


class PresenceFusionViewOverviewView(HomeAssistantView):
    url = "/presence_fusion/views/overview.js"
    name = "presence_fusion:view_overview"
    requires_auth = False

    async def get(self, request: web.Request) -> web.Response:
        return web.FileResponse(
            WWW_DIR / "views" / "overview.js",
            headers={"Content-Type": "application/javascript"},
        )


class PresenceFusionViewMapView(HomeAssistantView):
    url = "/presence_fusion/views/map.js"
    name = "presence_fusion:view_map"
    requires_auth = False

    async def get(self, request: web.Request) -> web.Response:
        return web.FileResponse(
            WWW_DIR / "views" / "map.js",
            headers={"Content-Type": "application/javascript"},
        )


class PresenceFusionViewSettingsView(HomeAssistantView):
    url = "/presence_fusion/views/settings.js"
    name = "presence_fusion:view_settings"
    requires_auth = False

    async def get(self, request: web.Request) -> web.Response:
        return web.FileResponse(
            WWW_DIR / "views" / "settings.js",
            headers={"Content-Type": "application/javascript"},
        )


class PresenceFusionViewFloorplanView(HomeAssistantView):
    url = "/presence_fusion/views/floorplan.js"
    name = "presence_fusion:view_floorplan"
    requires_auth = False

    async def get(self, request: web.Request) -> web.Response:
        return web.FileResponse(
            WWW_DIR / "views" / "floorplan.js",
            headers={"Content-Type": "application/javascript"},
        )


class PresenceFusionViewDevicesView(HomeAssistantView):
    url = "/presence_fusion/views/devices.js"
    name = "presence_fusion:view_devices"
    requires_auth = False

    async def get(self, request: web.Request) -> web.Response:
        return web.FileResponse(
            WWW_DIR / "views" / "devices.js",
            headers={"Content-Type": "application/javascript"},
        )


class PresenceFusionViewPeopleView(HomeAssistantView):
    url = "/presence_fusion/views/people.js"
    name = "presence_fusion:view_people"
    requires_auth = False

    async def get(self, request: web.Request) -> web.Response:
        return web.FileResponse(
            WWW_DIR / "views" / "people.js",
            headers={"Content-Type": "application/javascript"},
        )


class PresenceFusionApiJsView(HomeAssistantView):
    url = "/presence_fusion/api.js"
    name = "presence_fusion:api_js"
    requires_auth = False

    async def get(self, request: web.Request) -> web.Response:
        return web.FileResponse(
            WWW_DIR / "api.js",
            headers={"Content-Type": "application/javascript"},
        )


class PresenceFusionPanelTemplateView(HomeAssistantView):
    url = "/presence_fusion/panel-template.js"
    name = "presence_fusion:panel_template"
    requires_auth = False

    async def get(self, request: web.Request) -> web.Response:
        return web.FileResponse(
            WWW_DIR / "panel-template.js",
            headers={"Content-Type": "application/javascript"},
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
            device_trackers = [
                s for s in states if s.entity_id.startswith("device_tracker.")
            ]
            binary_sensors = [
                s for s in states if s.entity_id.startswith("binary_sensor.")
            ]

            def simplify(s):
                return {
                    "entity_id": s.entity_id,
                    "state": s.state,
                    "attributes": {
                        k: self._safe_value(v) for k, v in s.attributes.items()
                    },
                }

            # Get people manager and BLE devices
            people_mgr: PeopleManager = hass.data[DOMAIN].get("people_manager")
            pf_people = []
            device_to_person = {}
            if people_mgr:
                pf_people = await people_mgr.async_list_people()
                # Build device-to-person mapping
                for person in pf_people:
                    for device_id in person.get("devices", []):
                        address = str(device_id).lower()
                        if address:
                            device_to_person[address] = person["id"]

            # Get BLE devices
            ble_info = await async_get_ble_devices(hass)

            # Get HA area list
            areas = []
            try:
                registry = None
                if hasattr(area_registry, "async_get"):
                    registry = area_registry.async_get(hass)
                elif hasattr(area_registry, "async_get_registry"):
                    registry = area_registry.async_get_registry(hass)

                if registry is not None:
                    if hasattr(registry, "async_list_areas"):
                        area_entries = await registry.async_list_areas()
                    else:
                        area_entries = getattr(registry, "areas", [])

                    for area in area_entries:
                        areas.append({"id": area.id, "name": area.name or ""})
            except Exception:
                areas = []

            # Build device-to-zone mapping (device_tracker state = zone entity_id)
            device_to_zone = {}
            for dt in device_trackers:
                zone_entity_id = f"zone.{dt.state}" if dt.state != "unknown" else None
                if zone_entity_id:
                    device_to_zone[dt.entity_id] = zone_entity_id

            # Compute devices per zone
            devices_per_zone = {}
            for zone in zones:
                zone_id = zone.entity_id
                devices_per_zone[zone_id] = [
                    dt.entity_id
                    for dt in device_trackers
                    if device_to_zone.get(dt.entity_id) == zone_id
                ]

            # Compute devices per person
            devices_per_person = {}
            for person in pf_people:
                devices_per_person[person["id"]] = [
                    str(device).lower() for device in person.get("devices", [])
                ]

            payload = {
                "people": [simplify(s) for s in people],
                "zones": [simplify(s) for s in zones],
                "areas": areas,
                "device_trackers": [simplify(s) for s in device_trackers],
                "binary_sensors": [simplify(s) for s in binary_sensors],
                "ble_devices": ble_info.get("devices", []),
                "ble_proxies": ble_info.get("proxies", []),
                "pf_people": pf_people,
                "device_to_person": device_to_person,
                "device_to_zone": device_to_zone,
                "devices_per_zone": devices_per_zone,
                "devices_per_person": devices_per_person,
                "ble_poll_interval": hass.data.setdefault(DOMAIN, {}).get(
                    "ble_poll_interval", 10.0
                ),
                "cesium_token": hass.data.setdefault(DOMAIN, {}).get("cesium_token"),
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
            person_id = name.lower().replace(" ", "_")
            if hass.services.has_service("person", "create"):
                await hass.services.async_call(
                    "person", "create", {"name": name}, blocking=True
                )
            else:
                _LOGGER.debug(
                    "person.create service not available, creating person state directly"
                )
                hass.states.async_set(
                    f"person.presence_fusion_{person_id}",
                    "home",
                    attributes={"friendly_name": name},
                )
        except Exception as err:
            _LOGGER.exception("Failed to create person: %s", err)
            return web.Response(status=500, text=str(err))

        return web.Response(
            text=json.dumps(
                {
                    "id": person_id,
                    "name": name,
                    "person_entity_id": f"person.presence_fusion_{person_id}",
                    "device_tracker_id": f"device_tracker.presence_fusion_person_{person_id}",
                }
            ),
            content_type="application/json",
        )


class PresenceFusionSettingsView(HomeAssistantView):
    url = "/presence_fusion/api/settings"
    name = "presence_fusion:settings"
    requires_auth = False

    async def post(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        data = await request.json()
        poll = data.get("ble_poll_interval")
        cesium_token = data.get("cesium_token")
        try:
            if poll is not None:
                hass.data.setdefault(DOMAIN, {})["ble_poll_interval"] = float(poll)
            if cesium_token is not None:
                hass.data.setdefault(DOMAIN, {})["cesium_token"] = str(cesium_token)

            entries = hass.config_entries.async_entries(DOMAIN)
            if entries:
                entry = entries[0]
                options = dict(entry.options)
                if poll is not None:
                    options["ble_poll_interval"] = float(poll)
                if cesium_token is not None:
                    options["cesium_token"] = str(cesium_token)
                hass.config_entries.async_update_entry(entry, options=options)

            if poll is not None:
                existing_listener = hass.data[DOMAIN].get("ble_poll_listener")
                if existing_listener:
                    try:
                        existing_listener()
                    except Exception:
                        pass
                callback = hass.data[DOMAIN].get("ble_poll_callback")
                if callback:
                    from homeassistant.helpers.event import async_track_time_interval
                    from datetime import timedelta

                    interval = float(poll)
                    listener = async_track_time_interval(
                        hass, callback, timedelta(seconds=interval)
                    )
                    hass.data[DOMAIN]["ble_poll_listener"] = listener
                    if entries:
                        entries[0].async_on_unload(listener)
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

            presence_data = hass.data[DOMAIN].get("data")
            if presence_data is not None:
                await presence_data.async_add_person(person)

            return web.Response(
                text=json.dumps(
                    {
                        "id": person_id,
                        "name": name,
                        "device_tracker_id": f"device_tracker.presence_fusion_person_{person_id}",
                    },
                    default=str,
                ),
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

            device_id = str(device_id).lower()
            person = await people_mgr.async_assign_device(person_id, device_id)
            if not person:
                return web.Response(status=404, text="Person not found")

            presence_data: PresenceFusionData | None = hass.data[DOMAIN].get("data")
            if presence_data is not None:
                await presence_data._load_definitions()
                async_dispatcher_send(hass, SIGNAL_UPDATE)

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
                return web.Response(
                    status=500, text="Floorplan manager not initialized"
                )

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
            ha_area = None

            async for field in reader:
                if field.name == "name":
                    name = await field.text()
                elif field.name == "image":
                    image_data = await field.read()
                elif field.name == "ha_area":
                    ha_area = await field.text()

            if not name:
                return web.Response(status=400, text="Missing floorplan name")

            floorplan_mgr: FloorplanManager = hass.data[DOMAIN].get("floorplan_manager")
            if not floorplan_mgr:
                return web.Response(
                    status=500, text="Floorplan manager not initialized"
                )

            floorplan = await floorplan_mgr.async_create_floorplan(
                name, image_data=image_data, ha_area=ha_area
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
                return web.Response(
                    status=500, text="Floorplan manager not initialized"
                )

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
                return web.Response(
                    status=500, text="Floorplan manager not initialized"
                )

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
                return web.Response(
                    status=500, text="Floorplan manager not initialized"
                )

            # Returns the created zone now
            zone_data = data.get("zone_data", {})
            if "ha_zone_id" in zone_data and "ha_area_id" not in zone_data:
                zone_data["ha_area_id"] = zone_data.pop("ha_zone_id")
            zone = await floorplan_mgr.async_add_zone(
                floorplan_id, zone_name, **zone_data
            )
            if not zone:
                return web.Response(status=404, text="Floorplan not found")

            presence_data = hass.data[DOMAIN].get("data")
            if presence_data is not None:
                await presence_data.async_add_zone(zone)

            response = dict(zone)
            response["entity_ids"] = [
                f"binary_sensor.presence_fusion_zone_{zone['id']}_occupancy",
                f"sensor.presence_fusion_zone_{zone['id']}_count",
            ]
            return web.Response(
                text=json.dumps(response, default=str),
                content_type="application/json",
            )
        except Exception as err:
            _LOGGER.exception("Failed to add zone: %s", err)
            return web.Response(status=500, text=str(err))


class PresenceFusionFloorplanZoneDetailView(HomeAssistantView):
    url = "/presence_fusion/api/floorplans/{floorplan_id}/zones/{zone_id}"
    name = "presence_fusion:floorplan_zone_detail"
    requires_auth = False

    async def delete(
        self, request: web.Request, floorplan_id: str, zone_id: str
    ) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        try:
            floorplan_mgr: FloorplanManager = hass.data[DOMAIN].get("floorplan_manager")
            if not floorplan_mgr:
                return web.Response(
                    status=500, text="Floorplan manager not initialized"
                )

            floorplan = await floorplan_mgr.async_remove_zone(floorplan_id, zone_id)
            if not floorplan:
                return web.Response(status=404, text="Floorplan or zone not found")

            return web.Response(
                text=json.dumps(floorplan, default=str),
                content_type="application/json",
            )
        except Exception as err:
            _LOGGER.exception("Failed to delete zone: %s", err)
            return web.Response(status=500, text=str(err))


class PresenceFusionFloorplanProxyView(HomeAssistantView):
    url = "/presence_fusion/api/floorplans/{floorplan_id}/proxies"
    name = "presence_fusion:floorplan_proxies"
    requires_auth = False

    async def post(self, request: web.Request, floorplan_id: str) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        data = await request.json()
        proxy_id = data.get("proxy_id")
        position = data.get("position")

        if not proxy_id or not position:
            return web.Response(status=400, text="Missing proxy_id or position")

        try:
            floorplan_mgr: FloorplanManager = hass.data[DOMAIN].get("floorplan_manager")
            if not floorplan_mgr:
                return web.Response(
                    status=500, text="Floorplan manager not initialized"
                )

            floorplan = await floorplan_mgr.async_add_proxy(
                floorplan_id, proxy_id, position
            )
            if not floorplan:
                return web.Response(status=404, text="Floorplan not found")

            return web.Response(
                text=json.dumps(floorplan, default=str),
                content_type="application/json",
            )
        except Exception as err:
            _LOGGER.exception("Failed to add proxy: %s", err)
            return web.Response(status=500, text=str(err))


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    hass.data.setdefault(DOMAIN, {})
    hass.http.register_view(PresenceFusionPanelJsView())
    hass.http.register_view(PresenceFusionManifestView())
    hass.http.register_view(PresenceFusionViewOverviewView())
    hass.http.register_view(PresenceFusionViewMapView())
    hass.http.register_view(PresenceFusionViewSettingsView())
    hass.http.register_view(PresenceFusionViewFloorplanView())
    hass.http.register_view(PresenceFusionViewDevicesView())
    hass.http.register_view(PresenceFusionViewPeopleView())
    hass.http.register_view(PresenceFusionApiJsView())
    hass.http.register_view(PresenceFusionPanelTemplateView())
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
    hass.http.register_view(PresenceFusionFloorplanZoneDetailView())
    hass.http.register_view(PresenceFusionFloorplanProxyView())

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
    presence_data = PresenceFusionData(hass)
    hass.data[DOMAIN]["data"] = presence_data
    hass.data[DOMAIN]["config_entry_id"] = entry.entry_id
    hass.data[DOMAIN]["ble_poll_interval"] = entry.options.get(
        "ble_poll_interval", 10.0
    )
    hass.data[DOMAIN]["cesium_token"] = entry.options.get("cesium_token")
    await presence_data.async_refresh({})

    async def _update_presence_from_ble(now):
        try:
            ble_info = await async_get_ble_devices(hass)
            await presence_data.async_refresh(ble_info)
        except Exception as err:
            _LOGGER.debug("BLE poll error: %s", err)

    from homeassistant.helpers.event import async_track_time_interval
    from datetime import timedelta

    try:
        interval = float(
            hass.data.setdefault(DOMAIN, {}).get("ble_poll_interval", 10.0)
        )
    except Exception:
        interval = 10.0

    remove_listener = async_track_time_interval(
        hass, _update_presence_from_ble, timedelta(seconds=interval)
    )
    hass.data[DOMAIN]["ble_poll_listener"] = remove_listener
    hass.data[DOMAIN]["ble_poll_callback"] = _update_presence_from_ble

    try:
        hass.async_create_task(_update_presence_from_ble(None))
    except Exception:
        pass

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    try:
        await async_setup_panel(hass)
    except Exception as err:
        _LOGGER.warning("Panel re-registration failed: %s", err)

    hass.data[DOMAIN][entry.entry_id] = entry.data
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id, None)
        hass.data[DOMAIN].pop("data", None)
        if remove_listener := hass.data[DOMAIN].pop("ble_poll_listener", None):
            try:
                remove_listener()
            except Exception:
                pass
    try:
        if frontend.async_panel_exists(hass, DOMAIN):
            frontend.async_remove_panel(hass, DOMAIN)
        if hasattr(frontend, "remove_extra_js_url"):
            frontend.remove_extra_js_url(hass, PANEL_JS_PATH)
    except Exception:
        _LOGGER.debug("Could not remove panel cleanly")
    return unload_ok
