/* Tunables and the block palette — the only file you should touch to rebalance */
export const WORLD         = 32;                       // 32 x 32 block grid
export const MAX_Y         = 48;                       // building height limit
export const MAX_INSTANCES = WORLD * WORLD * 16;       // budget for the one InstancedMesh

export const GRAVITY = 24;
export const JUMP    = 8.6;
export const WALK    = 5.2;
export const SPRINT  = 7.6;
export const REACH   = 7;                              // block-pick distance (world units)

/* block palette: name -> base color */
export const TYPES  = { grass: 0x55a63b, dirt: 0x8a5a34, stone: 0x9a9a9a, sand: 0xd8cf8f, wood: 0xa06a3a };
export const HOTBAR = ['grass', 'dirt', 'stone', 'wood'];

