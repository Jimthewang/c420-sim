import type { BoatState, Vec2 } from '../physics/types';

export type GraphicsQuality = 'low' | 'medium' | 'high';

/** Structurally matches the race course, without making rendering own game rules. */
export interface RenderCourse {
  startPin: Vec2;
  committee: Vec2;
  windward: Vec2;
  gatePort: Vec2;
  gateStarboard: Vec2;
  windDirectionDeg: number;
  length: number;
}

export interface RenderExtras {
  opponents?: { id: string; name: string; boat: BoatState; color?: number }[];
  course?: RenderCourse | null;
  target?: Vec2 | null;
  difficulty?: 'beginner' | 'intermediate' | 'realistic';
  quality?: GraphicsQuality;
  spinnaker?: boolean;
  outlines?: boolean;
  daylight?: number;
  terrainSeed?: number;
}
