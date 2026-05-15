from homeassistant.components.binary_sensor import (
    BinarySensorEntity,
    BinarySensorDeviceClass,
)

from .entity import PresenceFusionEntity


async def async_setup_entry(
    hass,
    entry,
    async_add_entities,
):
    async_add_entities([
        HomeOccupiedBinarySensor()
    ])


class HomeOccupiedBinarySensor(
    PresenceFusionEntity,
    BinarySensorEntity,
):
    _attr_name = "Occupied"
    _attr_unique_id = "home_occupied"
    _attr_is_on = False
    _attr_device_class = BinarySensorDeviceClass.OCCUPANCY

    @property
    def entity_id(self):
        return "binary_sensor.home_occupied"