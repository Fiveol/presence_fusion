export const template = document.createElement("template");

template.innerHTML = `
  <style>
    :host {
      display: block;
      box-sizing: border-box;
      color: var(--primary-text-color);
      background: var(--background-color);
      min-height: calc(100vh - 56px);
    }

    .container {
      display: flex;
      height: 100%;
      min-height: 100%;
    }

    nav {
      flex: 0 0 220px;
      border-right: 1px solid var(--divider-color);
      padding: 20px 16px;
      background: var(--sidebar-background-color, #f7f7f7);
    }

    nav h1 {
      margin: 0 0 20px;
      font-size: 1.15rem;
      line-height: 1.3;
    }

    button {
      display: block;
      width: 100%;
      padding: 12px 14px;
      margin-bottom: 8px;
      text-align: left;
      border: none;
      border-radius: 8px;
      background: transparent;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }

    button[selected] {
      font-weight: 700;
      background: rgba(0, 0, 0, 0.06);
    }

    main {
      flex: 1;
      padding: 24px;
      min-height: 100%;
    }

    .panel-title {
      margin-top: 0;
    }
  </style>

  <div class="container">
    <nav>
      <h1>Presence Fusion</h1>
      <button data-view="overview" selected>Overview</button>
      <button data-view="map">Map (3D)</button>
      <button data-view="floorplan">Floorplan</button>
      <button data-view="devices">Devices</button>
      <button data-view="people">People</button>
      <button data-view="settings">Settings</button>
    </nav>
    <main>
      <div class="content"></div>
    </main>
  </div>
`;
