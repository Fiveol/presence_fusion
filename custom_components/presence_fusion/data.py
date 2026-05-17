"""Shared data and signal helpers for Presence Fusion entities."""
from __future__ import annotations

import logging
from typing import Any

from homeassistant.const import STATE_NOT_HOME
from homeassistant.core import HomeAssistant
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

SIGNAL_UPDATE = f"{DOMAIN}_update"
SIGNAL_NEW_PERSON = f"{DOMAIN}_new_person"
SIGNAL_NEW_ZONE = f"{DOMAIN}_new_zone"


class PresenceFusionData:
    """Shared Presence Fusion data manager."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.people_mgr = hass.data[DOMAIN]["people_manager"]
        self.floorplan_mgr = hass.data[DOMAIN]["floorplan_manager"]
        self.zone_counts: dict[str, int] = {}
        self.zone_names: dict[str, str] = {}
        self.person_states: dict[str, str] = {}
        self.person_names: dict[str, str] = {}
        self.person_devices: dict[str, list[str]] = {}
        self._proxy_to_zone: dict[str, dict[str, Any]] = {}

    async def async_refresh(self, ble_info: dict[str, Any]) -> None:
        """Refresh zone and person state from BLE discoveries."""
        await self._load_definitions()
        self._proxy_to_zone = self._build_proxy_zone_map()

        new_zone_counts = {zone_id: 0 for zone_id in self.zone_names}
        new_person_states = {
            person_id: STATE_NOT_HOME for person_id in self.person_names
        }

        device_to_person: dict[str, str] = {}
        for person_id, devices in self.person_devices.items():
            for device_id in devices:
                device_to_person[device_id.lower()] = person_id

        for device in ble_info.get("devices", []):
            address = str(device.get("address", "")).lower()
            if not address:
                continue
            person_id = device_to_person.get(address)
            if not person_id:
                continue

            scanner_source = device.get("scanner") or device.get("source") or device.get("proxy")
            zone = self._proxy_to_zone.get(scanner_source)
            if zone is not None:
                zone_id = zone.get("id")
                if zone_id:
                    new_zone_counts[zone_id] = new_zone_counts.get(zone_id, 0) + 1
                    new_person_states[person_id] = zone.get("name", STATE_NOT_HOME)
                    continue

            # No zone found for this discovery; still update person location by source.
            new_person_states[person_id] = str(scanner_source or "home")

        if new_zone_counts != self.zone_counts or new_person_states != self.person_states:
            self.zone_counts = new_zone_counts
            self.person_states = new_person_states
            async_dispatcher_send(self.hass, SIGNAL_UPDATE)
        else:
            self.zone_counts = new_zone_counts
            self.person_states = new_person_states

    async def async_add_person(self, person: dict[str, Any]) -> None:
        """Add a newly created person and notify entity platforms."""
        self.person_names[person["id"]] = person.get("name", person["id"])
        self.person_devices[person["id"]] = [str(d).lower() for d in person.get("devices", [])]
        self.person_states[person["id"]] = STATE_NOT_HOME
        async_dispatcher_send(self.hass, SIGNAL_NEW_PERSON, person)
        async_dispatcher_send(self.hass, SIGNAL_UPDATE)

    async def async_add_zone(self, zone: dict[str, Any]) -> None:
        """Add a newly created zone and notify entity platforms."""
        self.zone_names[zone["id"]] = zone.get("name", zone["id"])
        self.zone_counts[zone["id"]] = 0
        async_dispatcher_send(self.hass, SIGNAL_NEW_ZONE, zone)
        async_dispatcher_send(self.hass, SIGNAL_UPDATE)

    async def _load_definitions(self) -> None:
        people = await self.people_mgr.async_list_people()
        self.person_names = {p["id"]: p.get("name", p["id"]) for p in people}
        self.person_devices = {
            p["id"]: [str(device).lower() for device in p.get("devices", [])]
            for p in people
        }

        self.zone_names = {}
        for floorplan in self.floorplan_mgr.floorplans.values():
            for zone in floorplan.get("zones", []):
                if zone.get("id") and zone.get("name"):
                    self.zone_names[zone["id"]] = zone["name"]

    def _build_proxy_zone_map(self) -> dict[str, dict[str, Any]]:
        proxy_to_zone: dict[str, dict[str, Any]] = {}
        for floorplan in self.floorplan_mgr.floorplans.values():
            zones = floorplan.get("zones", [])
            proxies = floorplan.get("proxies", [])
            for zone in zones:
                poly = zone.get("coordinates", [])
                if not poly:
                    continue
                for proxy in proxies:
                    position = proxy.get("position") or {}
                    if self._point_in_polygon(position, poly):
                        proxy_to_zone[proxy.get("id")] = zone
        return proxy_to_zone

    def _point_in_polygon(self, point: dict[str, Any], polygon: list[dict[str, Any]]) -> bool:
        try:
            x = float(point.get("x", 0))
            y = float(point.get("y", 0))
        except Exception:
            return False

        inside = False
        j = len(polygon) - 1
        for i in range(len(polygon)):
            xi = float(polygon[i].get("x", 0))
            yi = float(polygon[i].get("y", 0))
            xj = float(polygon[j].get("x", 0))
            yj = float(polygon[j].get("y", 0))
            if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi):
                inside = not inside
            j = i
        return inside

    def async_list_people(self) -> list[dict[str, Any]]:
        return [
            {"id": person_id, "name": name, "devices": self.person_devices.get(person_id, [])}
            for person_id, name in self.person_names.items()
        ]

    def async_list_zones(self) -> list[dict[str, Any]]:
        return [
            {"id": zone_id, "name": zone_name}
            for zone_id, zone_name in self.zone_names.items()
        ]

    def async_get_zone_count(self, zone_id: str) -> int:
        return self.zone_counts.get(zone_id, 0)

    def async_get_zone_name(self, zone_id: str) -> str:
        return self.zone_names.get(zone_id, zone_id)

    def async_get_person_state(self, person_id: str) -> str:
        return self.person_states.get(person_id, STATE_NOT_HOME)

    def async_get_person_name(self, person_id: str) -> str:
        return self.person_names.get(person_id, person_id)

    def async_get_person_tracked_devices(self, person_id: str) -> list[str]:
        return self.person_devices.get(person_id, [])
