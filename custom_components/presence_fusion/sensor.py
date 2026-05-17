"""Sensor platform for Presence Fusion."""
from __future__ import annotations

import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.components.sensor import SensorEntity
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity import DeviceInfo

from .const import DOMAIN
from .data import PresenceFusionData, SIGNAL_NEW_ZONE, SIGNAL_UPDATE

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities):
    data: PresenceFusionData = hass.data[DOMAIN]["data"]
    entities: list[PresenceFusionZoneCountSensor] = []

    for zone in data.async_list_zones():
        entities.append(PresenceFusionZoneCountSensor(data, zone["id"]))

    async_add_entities(entities)

    async def _async_add_zone(zone: dict[str, Any]) -> None:
        async_add_entities([PresenceFusionZoneCountSensor(data, zone["id"])])

    async_dispatcher_connect(hass, SIGNAL_NEW_ZONE, _async_add_zone)


class PresenceFusionZoneCountSensor(SensorEntity):
    """Sensor entity for Presence Fusion zone occupancy count."""

    _attr_should_poll = False
    _attr_native_unit_of_measurement = "people"

    def __init__(self, data: PresenceFusionData, zone_id: str) -> None:
        self._data = data
        self._zone_id = zone_id
        self._attr_unique_id = f"{DOMAIN}_zone_{zone_id}_count"
        self._attr_name = f"{self._data.async_get_zone_name(zone_id)} Occupancy Count"

    @property
    def native_value(self) -> int:
        return self._data.async_get_zone_count(self._zone_id)

    @property
    def device_info(self) -> DeviceInfo:
        return DeviceInfo(
            identifiers={(DOMAIN, f"zone_{self._zone_id}" )},
            name=self._data.async_get_zone_name(self._zone_id),
            manufacturer="Presence Fusion",
        )

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(
            async_dispatcher_connect(self.hass, SIGNAL_UPDATE, self._async_update_state)
        )

    async def _async_update_state(self, *_: Any) -> None:
        current_state = self.hass.states.get(self.entity_id)
        new_state = str(self.state)
        if current_state is not None and current_state.state == new_state:
            return
        self.async_write_ha_state()

    @property
    def available(self) -> bool:
        return True
