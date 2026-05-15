from homeassistant.helpers.update_coordinator import (
    CoordinatorEntity,
)

from .device import home_device_info


class PresenceFusionEntity(
    CoordinatorEntity,
):
    @property
    def device_info(self):
        return home_device_info()