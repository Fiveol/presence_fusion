from homeassistant.helpers.entity import Entity

from .device import home_device_info


class PresenceFusionEntity(Entity):
    @property
    def device_info(self):
        return home_device_info()