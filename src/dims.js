/** Scale from input mm to scene metres. */
export const MM = 0.001;

/** Fixed body proportions in mm, shared by the 3D model and the 2D vector map. */
export const CLEARANCE = 320, CORNER = 90, BELLOWS_INSET = 150, ARCH_GAP = 110;
export const END_EDGE = CLEARANCE + CORNER;  // lower edge of a flat end face above ground: where the rounding to the skirt ends
export const TYRE_W = 295, TYRE_INSET = 160, TWIN_GAP = 310, RIM_R = 290, HUB_R = 110;
export const POD_LEN = 3200, POD_MAX = 0.5, POD_AT = 0.45, POD_W = 0.75;
