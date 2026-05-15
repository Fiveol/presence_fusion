from datetime import timedelta

from homeassistant.helpers.update_coordinator import (
    DataUpdateCoordinator,
)

from .const import DOMAIN


class PresenceFusionCoordinator(
    DataUpdateCoordinator,
):
    def __init__(self, hass):
        super().__init__(
            hass,
            logger=None,
            name=DOMAIN,
            update_interval=timedelta(seconds=30),
        )

        self.occupied = False

    async def _async_update_data(self):
        return {
            "occupied": self.occupied
        }