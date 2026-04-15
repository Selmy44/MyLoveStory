export type PlaylistMediaType = "audio" | "video";
export type GalleryMediaType = "image" | "video";

export interface PlaylistItem {
  id: number;
  title: string;
  artist: string;
  media_type: PlaylistMediaType;
  file_url: string;
  source?: "upload" | "spotify" | "youtube";
  external_id?: string | null;
  cover_url?: string | null;
  sort_order: number;
  created_at: string;
}

export interface GalleryItem {
  id: number;
  title: string;
  note: string;
  media_type: GalleryMediaType;
  file_url: string;
  created_at: string;
}
