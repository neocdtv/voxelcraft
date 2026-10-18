/* Tunables & block palette — the only file you should touch to rebalance */
export const WORLD         = 128;                       // 32 x 32 block grid
export const MAX_Y         = 48;                       // building height limit
export const MAX_INSTANCES = WORLD * WORLD * 16;       // budget for the one InstancedMesh

export const GRAVITY = 24;
export const JUMP    = 8.6;
export const WALK    = 5.2;
export const SPRINT  = 7.6;
export const REACH   = 7;                              // block-pick distance (world units)

/* day/night: full cycle length in seconds, t=0 is sunrise (6:00) */
export const DAY_LENGTH = 580;                         // 3-minute days

/* world-gen dials */
export const TREE_CHANCE   = 0.05;                     // ~one tree per 20 grass-topped columns
export const CACTUS_CHANCE = 0.06;                     // on dry sandy flats
export const CAVE_CUT      = 0.58;                     // noise above this gets carved — raise for fewer/smaller caves
export const ORE_CHANCE    = 0.05;                     // per stone cell (45% coal / 40% iron / 15% gold)
export const SEA           = 2;                        // highest water layer → surface sits at world height 3
export const SNOW_H        = 8;                        // tops at/above this get snow caps
export const DRY_C         = 0.62;                     // biome field above this → desert


/* block palette: name -> base color */
export const TYPES = {
  grass: 0x55a63b, dirt: 0x8a5a34, stone: 0x9a9a9a, sand: 0xd8cf8f,
  wood: 0xa06a3a, leaves: 0x3e8f2a, snow: 0xeef3f7, cactus: 0x6aa53f,
  coal: 0x2b2b2b, iron: 0xd2aa7f, gold: 0xf3c14b };

/* nine slots → keys 1–9; water is a derived fluid and intentionally not placeable */
export const HOTBAR = ['grass', 'dirt', 'stone', 'wood', 'leaves', 'coal', 'iron', 'gold', 'snow'];

