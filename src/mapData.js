const MAP_DATA = {};
const { log } = require('./logger');

async function initMapData() {
  try {
    const res = await fetch('https://valorant-api.com/v1/maps');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { data } = await res.json();
    for (const map of data) {
      if (!map.displayName) continue;
      MAP_DATA[map.displayName] = {
        displayIcon: map.displayIcon,
        splash: map.splash,
        listViewIcon: map.listViewIcon,
        listViewIconTall: map.listViewIconTall,
        backgroundImage: map.backgroundImage,
        stylizedBackgroundImage: map.stylizedBackgroundImage,
        premierBackgroundImage: map.premierBackgroundImage,
      };
    }
    log('STATIC', `Loaded data for ${Object.keys(MAP_DATA).length} maps`);
  } catch (err) {
    log('WARN', `Failed to load map data — ${err.message}`);
  }
}

module.exports = { MAP_DATA, initMapData };
