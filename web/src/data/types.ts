// Types for export/seats.json (see ../README.md). Coordinates are three.js Y-up, in meters.

export type Vec3 = [x: number, y: number, z: number];
/** One seat: [seat_number, x, y, z, yaw]. The chair faces +X at yaw 0; instance rotation.y = yaw. */
export type SeatTuple = [seat: number, x: number, y: number, z: number, yaw: number];
export type SectionStatus = 'open' | 'side_view' | 'closed';
export type SectionLevel = '100' | '300' | 'FLOOR';
export type ChairName = 'Chair_Lower' | 'Chair_Upper' | 'Chair_Floor';
export type TierId = 'P1' | 'P1B' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7' | 'X';

export interface CameraPose { pos: Vec3; target: Vec3 }

export interface RowData { label: string; seats: SeatTuple[] }

export interface SectionData {
  id: string;
  mesh: string;              // name of the SEC_<id> mesh in arena_venue.glb
  name: string;
  level: SectionLevel;
  status: SectionStatus;
  tier: TierId;
  price: number;
  chair: ChairName;
  center: Vec3;
  zoom_camera: CameraPose;
  row_count: number;
  seat_count: number;
  rows: RowData[];
}

export interface StageData { front_center: Vec3; look_target: Vec3; deck_bbox_min: Vec3; deck_bbox_max: Vec3 }

export interface SeatsFile {
  venue: string;
  units: 'meters';
  coords: string;
  config: string;
  seat_format: ['seat_number', 'x', 'y', 'z', 'yaw'];
  seat_notes: string;
  eye_height: number;
  stage: StageData;
  camera_presets: { overview: CameraPose; exterior: CameraPose };
  tiers: Record<TierId, [name: string, price: number]>;
  sections: SectionData[];
  total_seats: number;
  sellable_seats: number;
}

/** userData on a SEC_<id> mesh, from the glTF node extras. */
export interface SectionUserData {
  section_id: string;
  level: SectionLevel;
  status: SectionStatus;
  tier: TierId;
  tier_name: string;
  price: number;
  rows: number;
  seat_count: number;
  kind: 'section';
}

/** A seat by index into seats.json: sections[section].rows[row].seats[seat]. */
export interface SeatRef { section: number; row: number; seat: number }

/** What the cart and checkout carry. */
export interface CartSeat { section: string; row: string; seat: number; price: number }
