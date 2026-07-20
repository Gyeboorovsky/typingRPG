// Single source of truth for world (canvas) colors. UI colors live in style.css.
export const PAL = {
  grassA: '#5cb85c', grassB: '#55ac55',
  sandA: '#d9c184', sandB: '#d2b97a',
  waterA: '#3b7dd8', waterB: '#4f8fe4',
  forestA: '#3c7a44', forestB: '#367040', // Elderwood floor (darker, cooler green)
  mossA: '#4f9455', mossB: '#488b4e',     // clearing floors — a touch lighter than forest
  ashA: '#6e6a63', ashB: '#66625b',       // Ashen Highlands ground
  snowA: '#d8e2ea', snowB: '#cfdae4',     // Frostreach Frontier ground
  stoneA: '#7e7e8a', stoneB: '#767682',   // dungeon stone floor
  mountainA: '#7a6250', mountainB: '#6e5847', // impassable highland (fly-over later)
  voidTile: '#000000',                    // outside the painted map
  tileEdge: 'rgba(0,0,0,0.08)',
  treeTrunk: '#7a5230', treeLeafA: '#2e7d4f', treeLeafB: '#266b43',
  rockA: '#8d8d99', rockB: '#72727e',
  shroomCap: '#c94f4f', shroomDot: '#f0e6d2', shroomStem: '#e8ddc8', // decorative mushrooms
  shadow: 'rgba(0,0,0,0.25)',

  skin: '#e8b98a',

  // per-class hero look: body/bodyDark = torso, legs, accent/accentEdge =
  // weapon or its glow, hair = hair or headwear
  classLooks: {
    warrior: { body: '#8c2f2f', bodyDark: '#6d2424', legs: '#3f3a5a', accent: '#cfd6e4', accentEdge: '#f2f6fc', hair: '#4a3220' },
    ninja: { body: '#2b2b35', bodyDark: '#18181e', legs: '#232330', accent: '#c9c9d6', accentEdge: '#7fe0c9', hair: '#101014' },
    wizard: { body: '#3a2f7d', bodyDark: '#281f5c', legs: '#241c52', accent: '#8f6fe0', accentEdge: '#c9b3ff', hair: '#e4dff5' },
    priest: { body: '#e8e2c8', bodyDark: '#c3bb95', legs: '#a89a6e', accent: '#ffd75e', accentEdge: '#fff6d8', hair: '#f0e6d2' },
  },
  hilt: '#7a5230',

  dummy: '#cbab74', dummyDark: '#a3823f', dummyPost: '#7a5230', // burlap sack + wooden post
  slime: '#59c8a0', slimeDark: '#3da181', eye: '#1c2430',
  boar: '#8a5a3b', boarDark: '#6e4730', tusk: '#f0ead8', snout: '#b97f57',
  cultist: '#4a3a68', cultistDark: '#372b4f', cultistEye: '#c94fe0',
  boss: '#8b2fc9', bossDark: '#691fa0', horn: '#e8d9a0',
  enrage: 'rgba(255,60,60,0.4)', shieldRing: '#5fc9f0',
  // Elderwood natives
  wolf: '#7d8591', wolfDark: '#5c636e', wolfEye: '#e8b13c',
  sporeCap: '#b85c8a', sporeCapDot: '#f0e0ea', sporeBody: '#d8c9a8',
  thorn: '#4e7a35', thornDark: '#3b5e28', thornEye: '#d8e84a',
  treant: '#6b4a2e', treantDark: '#523822', treantLeaf: '#2e6b3f', treantEye: '#7de08a',
  golem: '#9a948c', golemDark: '#7b756d', golemEye: '#e8a13c', golemMoss: '#5c8a55',
  root: '#4a3b28', rootDark: '#382c1e', rootLeaf: '#3f8a4f', rootEye: '#8af09a',
  // Portals
  portal: '#5fd8c9', portalCore: '#bafff4',

  ring: '#ffd75e',
  exitRing: '#ff5a5a',  // Esc hold-to-exit progress ring (track = same color, lower alpha)
  // Per-mob attack-range rings (aggroed mobs only): faint, highly transparent —
  // the alpha lives here with the color so the whole look is one config knob.
  mobRangeRing: '#ff8a5e', mobRangeRingAlpha: 0.14,
  mobBarBack: 'rgba(0,0,0,0.55)', mobBarFill: '#e0484f',
  dmgText: '#ffffff', hurtText: '#ff6b6b', xpText: '#ffd75e',
  blockText: '#9fb4c8', // mob dodged/blocked the player's hit
  burst: '#ffd75e', shieldBurst: '#5fc9f0',
};
