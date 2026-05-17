"""Custom people storage for Presence Fusion."""

import logging
from typing import Any, Optional

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import STORAGE_DIR
from homeassistant.helpers import storage

_LOGGER = logging.getLogger(__name__)

STORAGE_VERSION = 1
STORAGE_KEY = "presence_fusion_people"


class PeopleManager:
    """Manage custom people for Presence Fusion."""

    def __init__(self, hass: HomeAssistant):
        """Initialize the people manager."""
        self.hass = hass
        self.store = storage.Store(
            hass, STORAGE_VERSION, STORAGE_KEY, encoder=storage.JSONEncoder
        )
        self.people: dict[str, dict[str, Any]] = {}

    async def async_load(self) -> None:
        """Load people from storage."""
        try:
            data = await self.store.async_load()
            if data:
                self.people = data.get("people", {})
            else:
                self.people = {}
        except Exception as err:
            _LOGGER.error("Failed to load people: %s", err)
            self.people = {}

    async def async_save(self) -> None:
        """Save people to storage."""
        try:
            await self.store.async_save({"people": self.people})
        except Exception as err:
            _LOGGER.error("Failed to save people: %s", err)

    async def async_create_person(
        self, person_id: str, name: str, **kwargs: Any
    ) -> dict[str, Any]:
        """Create a new person."""
        person = {
            "id": person_id,
            "name": name,
            "devices": [],
            **kwargs,
        }
        self.people[person_id] = person
        await self.async_save()
        return person

    async def async_update_person(
        self, person_id: str, **kwargs: Any
    ) -> Optional[dict[str, Any]]:
        """Update a person."""
        if person_id not in self.people:
            return None
        self.people[person_id].update(kwargs)
        await self.async_save()
        return self.people[person_id]

    async def async_delete_person(self, person_id: str) -> bool:
        """Delete a person."""
        if person_id not in self.people:
            return False
        del self.people[person_id]
        await self.async_save()
        return True

    async def async_get_person(self, person_id: str) -> Optional[dict[str, Any]]:
        """Get a person by ID."""
        return self.people.get(person_id)

    async def async_list_people(self) -> list[dict[str, Any]]:
        """List all people."""
        return list(self.people.values())

    async def async_assign_device(
        self, person_id: str, device_id: str
    ) -> Optional[dict[str, Any]]:
        """Assign a device to a person."""
        if person_id not in self.people:
            return None

        device_id = str(device_id).lower()
        changed = False

        for pid, person in self.people.items():
            normalized_devices = [
                str(device).lower() for device in person.get("devices", [])
            ]
            if device_id in normalized_devices:
                self.people[pid]["devices"] = [
                    d for d in normalized_devices if d != device_id
                ]
                changed = True

        devices = [
            str(device).lower() for device in self.people[person_id].get("devices", [])
        ]
        if device_id not in devices:
            self.people[person_id]["devices"].append(device_id)
            changed = True

        if changed:
            await self.async_save()

        return self.people[person_id]

    async def async_unassign_device(
        self, person_id: str, device_id: str
    ) -> Optional[dict[str, Any]]:
        """Unassign a device from a person."""
        if person_id not in self.people:
            return None
        device_id = str(device_id).lower()
        self.people[person_id]["devices"] = [
            str(device).lower()
            for device in self.people[person_id]["devices"]
            if str(device).lower() != device_id
        ]
        await self.async_save()
        return self.people[person_id]

    async def async_get_person_by_device(
        self, device_id: str
    ) -> Optional[dict[str, Any]]:
        """Get the person assigned to a device."""
        device_id = str(device_id).lower()
        for person in self.people.values():
            if device_id in [
                str(device).lower() for device in person.get("devices", [])
            ]:
                return person
        return None
