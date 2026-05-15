from homeassistant.components.sensor import SensorEntity
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry

DOMAIN = "presence_fusion"


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities,
):
    async_add_entities([HomeOccupiedSensor()])


class HomeOccupiedSensor(SensorEntity):
    _attr_name = "Occupied"
    _attr_unique_id = "home_occupied"
    _attr_native_value = False

    @property
    def device_info(self):
        return DeviceInfo(
            identifiers={(DOMAIN, "home")},
            name="Home",
            manufacturer="Presence Fusion",
            model="Occupancy",
        )

    @property
    def entity_id(self):
        return "sensor.home_occupied"