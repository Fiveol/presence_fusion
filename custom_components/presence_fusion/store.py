from dataclasses import dataclass, field


@dataclass
class Device:
    id: str
    name: str | None = None
    mac: str | None = None
    ibeacon_uuid: str | None = None
    rssi: int | None = None
    last_seen: float | None = None


@dataclass
class Person:
    id: str
    name: str
    devices: list[str] = field(default_factory=list)


class PresenceStore:
    def __init__(self):
        self.people: dict[str, Person] = {}
        self.devices: dict[str, Device] = {}

    def add_device(self, device: Device):
        self.devices[device.id] = device

    def add_person(self, person: Person):
        self.people[person.id] = person

    def remove_person(self, person_id: str):
        self.people.pop(person_id, None)