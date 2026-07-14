// English word pools per mob tier and prompt generation.
import { PROMPT_TARGET_LEN } from './constants';
import { pick } from './rng';
import type { RngCarrier } from './rng';
import type { Tier } from './types';

const TIER1 = ( // 3–5 letters, lowercase
  'cat dog run sun map axe orb elf fox owl bee ant war paw gem ash oak' +
  ' fire wind rock leaf claw fang bone dust rain moon star wolf bear boar' +
  ' slime blade sword charm skull torch stone grass water swamp haste might' +
  ' arrow spear staff cloak boots gold coin ring herb root cave path camp' +
  ' hunt prey trap bait dusk dawn mist fog thorn vine mud clay sand tide' +
  ' king lord mage monk seer bard rune sage lance shield helm glove chest'
).trim().split(/\s+/);

const TIER2 = ( // 6–8 letters
  'battle danger poison shadow spirit temple dungeon monster warrior cursed' +
  ' ancient crystal phantom serpent villain destiny fortune journey lantern' +
  ' mystery pendant scholar terrain venture warlock wyverns javelin gauntlet' +
  ' merchant crusade phoenix griffin basilisk paladin sorcery alchemy elixirs' +
  ' cauldron enchanted fortress rampart citadel bastion vanguard sentinel' +
  ' guardian revenant specter wraiths banshee seraphim colossus behemoth' +
  ' leviathan obsidian emerald sapphire scimitar halberds warhorse stallion'
).trim().split(/\s+/);

const TIER3 = ( // long words and short phrases
  'devastation,annihilation,resurrection,enchantment,necromancer,apocalypse,' +
  'catastrophe,malevolence,retribution,vengeance calls,dark ritual,blood moon,' +
  'forbidden spell,cursed grimoire,eternal night,shattered realm,frozen throne,' +
  'burning legion,silent assassin,venomous strike,arcane barrier,soul harvest,' +
  'grim reckoning,mortal wound,savage onslaught,relentless fury,spectral chains,' +
  'infernal pact,celestial wrath,abyssal depths,dread citadel,phantom legion,' +
  'crimson covenant,twilight requiem,obsidian heart,merciless tempest'
).split(',');

const TIER4 = [ // boss phrases: capitals and punctuation
  'The words devour you whole!',
  'Fear sharpens every keystroke.',
  'Typhon hungers for your typos!',
  'Precision is the only shield.',
  'Your fingers betray your fate.',
  'Silence falls; the beast speaks.',
  "Do not falter, do not fail!",
  'Every letter is a heartbeat.',
  'The Word-Eater knows your name.',
  'Steel your mind, still your hands.',
  'One mistake feeds the abyss.',
  'Speak swiftly or be swallowed!',
  "The alphabet bends to Typhon's will.",
  'Chaos reigns where accuracy dies.',
  'Type as if your soul depends on it!',
  'A trembling hand digs its own grave.',
  'Glory belongs to the flawless.',
  'The storm of letters never ends.',
  'Courage, hero: the final word is yours.',
  'Even gods fear a perfect streak.',
];

const POOLS: Record<Tier, readonly string[]> = { 1: TIER1, 2: TIER2, 3: TIER3, 4: TIER4 };

/** Build a prompt of at least the tier's target length from its pool. */
export function promptFor(s: RngCarrier, tier: Tier): string {
  const pool = POOLS[tier];
  const target = PROMPT_TARGET_LEN[tier];
  let out = pick(s, pool);
  while (out.length < target) out += ' ' + pick(s, pool);
  return out;
}
