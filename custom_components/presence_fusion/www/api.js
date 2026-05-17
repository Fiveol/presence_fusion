export async function fetchData() {
  try {
    const [dataResp, bleResp, peopleResp, floorplansResp] = await Promise.all([
      fetch("/presence_fusion/api/data"),
      fetch("/presence_fusion/api/ble/devices"),
      fetch("/presence_fusion/api/people"),
      fetch("/presence_fusion/api/floorplans"),
    ]);

    const data = dataResp.ok
      ? await dataResp.json()
      : { people: [], zones: [], device_trackers: [], binary_sensors: [] };
    const ble = bleResp.ok
      ? await bleResp.json()
      : { proxies: [], devices: [] };
    const people = peopleResp.ok ? await peopleResp.json() : [];
    const floorplans = floorplansResp.ok ? await floorplansResp.json() : [];

    return {
      ...data,
      ble_devices: ble.devices || [],
      ble_proxies: ble.proxies || [],
      pf_people: people,
      floorplans,
    };
  } catch (err) {
    console.error("Failed to fetch presence_fusion data:", err);
    return {
      people: [],
      zones: [],
      device_trackers: [],
      binary_sensors: [],
      ble_devices: [],
      ble_proxies: [],
      pf_people: [],
      floorplans: [],
    };
  }
}

export async function saveSettings(poll, cesiumToken) {
  const resp = await fetch("/presence_fusion/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ble_poll_interval: poll, cesium_token: cesiumToken }),
  });
  return resp.ok;
}

export async function createPerson(name) {
  const resp = await fetch("/presence_fusion/api/people", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return resp.ok;
}
