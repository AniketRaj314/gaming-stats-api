const AGENT_DATA = {};
const { log } = require('./logger');

async function initAgentData() {
  try {
    const res = await fetch('https://valorant-api.com/v1/agents?isPlayableCharacter=true');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { data } = await res.json();
    for (const agent of data) {
      AGENT_DATA[agent.displayName] = {
        icon: agent.displayIcon,
        displayIconSmall: agent.displayIconSmall,
        role: agent.role?.displayName ?? null,
        roleIcon: agent.role?.displayIcon ?? null,
        portrait: agent.fullPortrait,
        portraitV2: agent.fullPortraitV2,
        bustPortrait: agent.bustPortrait,
        killfeedPortrait: agent.killfeedPortrait,
        minimapPortrait: agent.minimapPortrait,
        background: agent.background,
        homeScreenPromoTileImage: agent.homeScreenPromoTileImage,
        abilityIcons: Array.isArray(agent.abilities) ? agent.abilities.map(ability => ({
          slot: ability.slot ?? null,
          name: ability.displayName ?? null,
          icon: ability.displayIcon ?? null,
        })) : [],
      };
    }
    log('STATIC', `Loaded data for ${data.length} agents`);
  } catch (err) {
    log('WARN', `Failed to load agent data — ${err.message}`);
  }
}

module.exports = { AGENT_DATA, initAgentData };
