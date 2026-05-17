"""Device tracker platform for Presence Fusion."""
from __future__ import annotations

import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.components.device_tracker import TrackerEntity
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity import DeviceInfo

from .const import DOMAIN
from .data import PresenceFusionData, SIGNAL_NEW_PERSON, SIGNAL_UPDATE

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities):
    data: PresenceFusionData = hass.data[DOMAIN]["data"]
    entities: list[PresenceFusionPersonTracker] = []

    for person in data.async_list_people():
        entities.append(PresenceFusionPersonTracker(data, person["id"]))

    async_add_entities(entities)

    async def _async_add_person(person: dict[str, Any]) -> None:
        async_add_entities([PresenceFusionPersonTracker(data, person["id"])])

    async_dispatcher_connect(hass, SIGNAL_NEW_PERSON, _async_add_person)


class PresenceFusionPersonTracker(TrackerEntity):
    """Device tracker entity for a Presence Fusion person."""

    _attr_should_poll = False

    def __init__(self, data: PresenceFusionData, person_id: str) -> None:
        self._data = data
        self._person_id = person_id
        self._attr_unique_id = f"{DOMAIN}_person_{person_id}"
        self._attr_name = f"{self._data.async_get_person_name(person_id)} Location"

    @property
    def state(self) -> str:
        return self._data.async_get_person_state(self._person_id)

    @property
    def device_info(self) -> DeviceInfo:
        return DeviceInfo(
            identifiers={(DOMAIN, f"person_{self._person_id}" )},
            name=self._data.async_get_person_name(self._person_id),
            manufacturer="Presence Fusion",
        )

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return {
            "tracked_devices": self._data.async_get_person_tracked_devices(self._person_id),
        }

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(
            async_dispatcher_connect(self.hass, SIGNAL_UPDATE, self.async_write_ha_state)
        )

    @property
    def available(self) -> bool:
        return True
