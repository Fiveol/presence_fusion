"""Floorplan management for Presence Fusion."""

import logging
import json
from pathlib import Path
from typing import Any, Optional
from uuid import uuid4

from homeassistant.core import HomeAssistant
from homeassistant.helpers import storage

_LOGGER = logging.getLogger(__name__)

STORAGE_VERSION = 1
STORAGE_KEY = "presence_fusion_floorplans"


class FloorplanManager:
    """Manage floorplans and zones."""

    def __init__(self, hass: HomeAssistant):
        """Initialize the floorplan manager."""
        self.hass = hass
        self.store = storage.Store(
            hass, STORAGE_VERSION, STORAGE_KEY, encoder=storage.JSONEncoder
        )
        self.floorplans: dict[str, dict[str, Any]] = {}

    async def async_load(self) -> None:
        """Load floorplans from storage."""
        try:
            data = await self.store.async_load()
            if data:
                self.floorplans = data.get("floorplans", {})
                for floorplan in self.floorplans.values():
                    if "ha_zone" in floorplan and "ha_area" not in floorplan:
                        floorplan["ha_area"] = floorplan.pop("ha_zone")
                    for zone in floorplan.get("zones", []):
                        if "ha_entity_id" in zone and "ha_area_id" not in zone:
                            zone["ha_area_id"] = zone.pop("ha_entity_id")
            else:
                self.floorplans = {}
        except Exception as err:
            _LOGGER.error("Failed to load floorplans: %s", err)
            self.floorplans = {}

    async def async_save(self) -> None:
        """Save floorplans to storage."""
        try:
            await self.store.async_save({"floorplans": self.floorplans})
        except Exception as err:
            _LOGGER.error("Failed to save floorplans: %s", err)

    async def async_create_floorplan(
        self,
        name: str,
        image_data: Optional[bytes] = None,
        ha_area: str | None = None,
        **kwargs: Any
    ) -> dict[str, Any]:
        """Create a new floorplan."""
        floorplan_id = str(uuid4())
        floorplan = {
            "id": floorplan_id,
            "name": name,
            "image": None,  # Base64 encoded image data
            "zones": [],
            "proxies": [],
            "ha_area": ha_area,
            "floor_index": 0,
            "position": {"x": 0, "y": 0, "z": 0},
            "rotation": {"x": 0, "y": 0, "z": 0},
            **kwargs,
        }

        if image_data:
            import base64

            floorplan["image"] = base64.b64encode(image_data).decode("utf-8")

        self.floorplans[floorplan_id] = floorplan
        await self.async_save()
        return floorplan

    async def async_update_floorplan(
        self, floorplan_id: str, **kwargs: Any
    ) -> Optional[dict[str, Any]]:
        """Update a floorplan."""
        if floorplan_id not in self.floorplans:
            return None

        # Don't allow direct image update via this method
        if "image" in kwargs and kwargs["image"] is not None:
            if isinstance(kwargs["image"], bytes):
                import base64

                kwargs["image"] = base64.b64encode(kwargs["image"]).decode("utf-8")

        self.floorplans[floorplan_id].update(kwargs)
        await self.async_save()
        return self.floorplans[floorplan_id]

    async def async_delete_floorplan(self, floorplan_id: str) -> bool:
        """Delete a floorplan."""
        if floorplan_id not in self.floorplans:
            return False
        del self.floorplans[floorplan_id]
        await self.async_save()
        return True

    async def async_get_floorplan(self, floorplan_id: str) -> Optional[dict[str, Any]]:
        """Get a floorplan by ID."""
        return self.floorplans.get(floorplan_id)

    async def async_list_floorplans(self) -> list[dict[str, Any]]:
        """List all floorplans."""
        # Return without image data for list view
        return [
            {k: v for k, v in fp.items() if k != "image"}
            for fp in self.floorplans.values()
        ]

    async def async_add_zone(
        self, floorplan_id: str, zone_name: str, **zone_data: Any
    ) -> Optional[dict[str, Any]]:
        """Add a zone to a floorplan and return the new zone."""
        if floorplan_id not in self.floorplans:
            return None

        zone = {
            "id": str(uuid4()),
            "name": zone_name,
            "coordinates": [],  # 2D points on floorplan
            "points_3d": [],  # 3D positions after alignment
            **zone_data,
        }
        self.floorplans[floorplan_id]["zones"].append(zone)
        await self.async_save()
        return zone

    async def async_remove_zone(
        self, floorplan_id: str, zone_id: str
    ) -> Optional[dict[str, Any]]:
        """Remove a zone from a floorplan."""
        if floorplan_id not in self.floorplans:
            return None

        self.floorplans[floorplan_id]["zones"] = [
            z for z in self.floorplans[floorplan_id]["zones"] if z["id"] != zone_id
        ]
        await self.async_save()
        return self.floorplans[floorplan_id]

    async def async_add_proxy(
        self, floorplan_id: str, proxy_id: str, position: dict[str, float]
    ) -> Optional[dict[str, Any]]:
        """Add a Bluetooth proxy to a floorplan."""
        if floorplan_id not in self.floorplans:
            return None

        proxy = {
            "id": proxy_id,
            "position": position,  # {x, y} on floorplan, z=floor_index*height
        }
        # Remove if already exists
        self.floorplans[floorplan_id]["proxies"] = [
            p for p in self.floorplans[floorplan_id]["proxies"] if p["id"] != proxy_id
        ]
        self.floorplans[floorplan_id]["proxies"].append(proxy)
        await self.async_save()
        return self.floorplans[floorplan_id]

    async def async_set_floorplan_alignment(
        self, floorplan_id: str, position: dict[str, float], rotation: dict[str, float]
    ) -> Optional[dict[str, Any]]:
        """Set 3D alignment (position and rotation) for a floorplan."""
        if floorplan_id not in self.floorplans:
            return None

        self.floorplans[floorplan_id]["position"] = position
        self.floorplans[floorplan_id]["rotation"] = rotation
        await self.async_save()
        return self.floorplans[floorplan_id]
