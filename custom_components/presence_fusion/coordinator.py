from homeassistant.helpers.update_coordinator import DataUpdateCoordinator
from datetime import timedelta


class PresenceFusionCoordinator(DataUpdateCoordinator):
    def __init__(self, hass, store):
        super().__init__(
            hass,
            logger=None,
            name="presence_fusion",
            update_interval=timedelta(seconds=5),
        )

        self.store = store
        self.subscribers = []

    def subscribe(self, callback):
        self.subscribers.append(callback)

    async def _async_update_data(self):
        payload = {
            "people": {
                pid: person.__dict__
                for pid, person in self.store.people.items()
            },
            "devices": {
                did: device.__dict__
                for did, device in self.store.devices.items()
            },
        }

        for cb in self.subscribers:
            cb(payload)

        return payload