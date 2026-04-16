import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import "./App.css";
import type { GalleryItem, PlaylistItem } from "./types/media";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:4000";
const HER_NAME = import.meta.env.VITE_HER_NAME ?? "Monia";
const LOVE_PASSCODE = import.meta.env.VITE_LOVE_PASSCODE ?? "2026";
const UNLOCK_KEY = "finest-monia-unlocked";
const INTRO_DONE_KEY = "finest-monia-intro-done";
const LETTER_TEXT = `My Love,

Every picture in here is a heartbeat. Every song is a memory. Every video is a moment I never want to lose.

You are my peace, my spark, and my sweetest chapter. This space is just a small reflection of how beautiful you make my life.

Forever yours.`;

type SpotifyTrack = {
  id: string;
  name: string;
  preview_url: string | null;
  artists: Array<{ name: string }>;
  external_urls?: { spotify?: string };
  album?: { images?: Array<{ url: string }> };
};

type YouTubeResult = {
  id: { videoId: string };
  snippet: {
    title: string;
    channelTitle: string;
    thumbnails?: { medium?: { url: string }; high?: { url: string } };
  };
};

type LoveLetter = {
  id: number;
  content: string;
  author: string;
  created_at: string;
};

function App() {
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([]);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [loveLetters, setLoveLetters] = useState<LoveLetter[]>([]);
  const [newLetterContent, setNewLetterContent] = useState("");
  const [activeSection, setActiveSection] = useState(() => localStorage.getItem("monia-active-section") || "home");
  const [showLetterHistory, setShowLetterHistory] = useState(false);
  const [selectedArchiveLetter, setSelectedArchiveLetter] = useState<LoveLetter | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [musicFileName, setMusicFileName] = useState<string | null>(null);
  const [galleryFileName, setGalleryFileName] = useState<string | null>(null);
  const [isSidebarPinned, setIsSidebarPinned] = useState(false);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);

  useEffect(() => {
    localStorage.setItem("monia-active-section", activeSection);
  }, [activeSection]);
  const [showIntro, setShowIntro] = useState<boolean>(() => {
    return localStorage.getItem(INTRO_DONE_KEY) !== "1";
  });
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    return localStorage.getItem(UNLOCK_KEY) === "1";
  });
  const [passcodeInput, setPasscodeInput] = useState("");
  const [passcodeError, setPasscodeError] = useState("");
  const [draggedTrackId, setDraggedTrackId] = useState<number | null>(null);
  const [mediaFocusIndex, setMediaFocusIndex] = useState(0);
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [editingMomentId, setEditingMomentId] = useState<number | null>(null);
  const [editingMomentTitle, setEditingMomentTitle] = useState("");
  const [isSavingMomentTitle, setIsSavingMomentTitle] = useState(false);
  const [momentsFilter, setMomentsFilter] = useState<"all" | "photos" | "videos">("all");
  const [momentsQuery, setMomentsQuery] = useState("");
  const [viewerId, setViewerId] = useState<number | null>(null);
  const [musicSearchQuery, setMusicSearchQuery] = useState("");
  const [musicSearchResults, setMusicSearchResults] = useState<SpotifyTrack[]>([]);
  const [isSearchingMusic, setIsSearchingMusic] = useState(false);
  const [musicSearchError, setMusicSearchError] = useState<string | null>(null);
  const [homeSearchOpen, setHomeSearchOpen] = useState(true);
  const [fullPlayerTrackId, setFullPlayerTrackId] = useState<string | null>(null);
  const [youtubePreviewId, setYoutubePreviewId] = useState<string | null>(null);
  const [spotifyPreviewUrl, setSpotifyPreviewUrl] = useState<string | null>(null);
  const [musicSource, setMusicSource] = useState<"youtube" | "spotify">("youtube");
  const [embeddedPlaying, setEmbeddedPlaying] = useState(true);
  const [youtubeResults, setYoutubeResults] = useState<YouTubeResult[]>([]);
  const [durationSec, setDurationSec] = useState(0);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [volume, setVolume] = useState(0.9);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const spotifyPreviewRef = useRef<HTMLAudioElement | null>(null);
  const ytPlayerRef = useRef<HTMLIFrameElement | null>(null);

  const homeMedia = useMemo(() => gallery.slice(0, 12), [gallery]);
  const selectedTrack = useMemo(() => {
    if (!playlist.length) return undefined;
    return playlist.find((track) => track.id === selectedTrackId) ?? playlist[0];
  }, [playlist, selectedTrackId]);
  const sidebarExpanded = isSidebarPinned || isSidebarHovered;
  const filteredMoments = useMemo(() => {
    const q = momentsQuery.trim().toLowerCase();
    return gallery.filter((m) => {
      const matchesType =
        momentsFilter === "all" ? true : momentsFilter === "photos" ? m.media_type === "image" : m.media_type === "video";
      const matchesQuery = q ? `${m.title} ${m.note}`.toLowerCase().includes(q) : true;
      return matchesType && matchesQuery;
    });
  }, [gallery, momentsFilter, momentsQuery]);

  const viewerItem = useMemo(() => {
    if (viewerId === null) return undefined;
    return gallery.find((m) => m.id === viewerId);
  }, [gallery, viewerId]);

  const selectedTrackIndex = useMemo(() => {
    if (!selectedTrack) return -1;
    return playlist.findIndex((t) => t.id === selectedTrack.id);
  }, [playlist, selectedTrack]);

  async function loadData() {
    const [playlistRes, galleryRes, lettersRes] = await Promise.all([
      fetch(`${API_BASE}/api/playlist`),
      fetch(`${API_BASE}/api/gallery`),
      fetch(`${API_BASE}/api/letters`),
    ]);

    if (!playlistRes.ok || !galleryRes.ok || !lettersRes.ok) {
      throw new Error("Could not load data");
    }

    const nextPlaylist = (await playlistRes.json()) as PlaylistItem[];
    const nextGallery = (await galleryRes.json()) as GalleryItem[];
    const nextLetters = (await lettersRes.json()) as LoveLetter[];
    setPlaylist(nextPlaylist);
    setGallery(nextGallery);
    setLoveLetters(nextLetters);
    setSelectedTrackId((prev) => prev ?? nextPlaylist[0]?.id ?? null);
  }

  async function submitLoveLetter(e: FormEvent) {
    e.preventDefault();
    if (!newLetterContent.trim()) return;
    setIsBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/letters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newLetterContent, author: "Partner" })
      });
      if (res.ok) {
        const newLetter = await res.json() as LoveLetter;
        setLoveLetters([newLetter, ...loveLetters]);
        setNewLetterContent("");
        setFlashMessage("Letter saved forever! ♥");
        setTimeout(() => setFlashMessage(null), 3000);
      }
    } catch {
      setFlashMessage("Failed to save letter.");
      setTimeout(() => setFlashMessage(null), 3000);
    } finally {
      setIsBusy(false);
    }
  }

  function resolveMediaUrl(fileUrl: string) {
    if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
    return `${API_BASE}${fileUrl}`;
  }

  useEffect(() => {
    const introTimer = setTimeout(() => {
      setShowIntro(false);
      localStorage.setItem(INTRO_DONE_KEY, "1");
    }, 2800);

    return () => clearTimeout(introTimer);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadData();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (homeMedia.length < 2) return;
    const timer = setInterval(() => {
      setMediaFocusIndex((prev) => (prev + 1) % homeMedia.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [homeMedia.length]);

  async function submitPlaylist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const mediaFile = formData.get("media");
    setIsBusy(true);

    const res = await fetch(`${API_BASE}/api/playlist`, {
      method: "POST",
      body: formData,
    });

    setIsBusy(false);
    if (!res.ok) return;
    form.reset();
    setMusicFileName(null);
    if (mediaFile instanceof File) {
      setFlashMessage(`✅ "${mediaFile.name}" has been added to your studio!`);
    }
    await loadData();
  }

  async function submitGallery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const mediaFile = formData.get("media");
    setIsBusy(true);

    const res = await fetch(`${API_BASE}/api/gallery`, {
      method: "POST",
      body: formData,
    });

    setIsBusy(false);
    if (!res.ok) return;
    form.reset();
    setGalleryFileName(null);
    if (mediaFile instanceof File) {
      setFlashMessage(`✅ "${mediaFile.name}" is now in your gallery!`);
    }
    await loadData();
  }

  useEffect(() => {
    if (!flashMessage) return;
    const timer = setTimeout(() => setFlashMessage(null), 2400);
    return () => clearTimeout(timer);
  }, [flashMessage]);

  async function deleteTrack(id: number) {
    await fetch(`${API_BASE}/api/playlist/${id}`, { method: "DELETE" });
    await loadData();
  }

  async function deleteMemory(id: number) {
    await fetch(`${API_BASE}/api/gallery/${id}`, { method: "DELETE" });
    await loadData();
  }

  async function deleteLetter(id: number) {
    if (!window.confirm("Delete this memory forever?")) return;
    await fetch(`${API_BASE}/api/letters/${id}`, { method: "DELETE" });
    await loadData();
  }

  async function startEditingMoment(memoryId: number, currentTitle: string) {
    setEditingMomentId(memoryId);
    setEditingMomentTitle(currentTitle);
  }

  async function saveMomentTitle() {
    if (editingMomentId === null) return;
    const title = editingMomentTitle.trim();
    if (!title) return;
    setIsSavingMomentTitle(true);
    const res = await fetch(`${API_BASE}/api/gallery/${editingMomentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setIsSavingMomentTitle(false);
    if (!res.ok) return;
    setFlashMessage(`"${title}" is saved.`);
    setEditingMomentId(null);
    setEditingMomentTitle("");
    await loadData();
  }

  async function savePlaylistOrder(items: PlaylistItem[]) {
    await fetch(`${API_BASE}/api/playlist/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: items.map((item) => item.id) }),
    });
  }

  async function handleTrackDrop(targetTrackId: number) {
    if (draggedTrackId === null || draggedTrackId === targetTrackId) return;
    const fromIndex = playlist.findIndex((item) => item.id === draggedTrackId);
    const toIndex = playlist.findIndex((item) => item.id === targetTrackId);
    if (fromIndex < 0 || toIndex < 0) return;

    const next = [...playlist];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setPlaylist(next);
    setDraggedTrackId(null);
    await savePlaylistOrder(next);
  }

  function unlockExperience(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passcodeInput !== LOVE_PASSCODE) {
      setPasscodeError("Wrong passcode. Try again, my love.");
      return;
    }
    setIsUnlocked(true);
    setPasscodeError("");
    localStorage.setItem(UNLOCK_KEY, "1");
  }

  function formatTime(totalSeconds: number) {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const m = Math.floor(seconds / 60);
    const s = String(seconds % 60).padStart(2, "0");
    return `${m}:${s}`;
  }

  function playTrackByIndex(index: number) {
    if (index < 0 || index >= playlist.length) return;
    setSelectedTrackId(playlist[index].id);
  }

  async function searchSpotify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = musicSearchQuery.trim();
    if (!q) return;
    setIsSearchingMusic(true);
    setMusicSearchError(null);
    const res = await fetch(`${API_BASE}/api/spotify/search?q=${encodeURIComponent(q)}`);
    setIsSearchingMusic(false);
    if (!res.ok) {
      setMusicSearchError("Search failed. Try again.");
      return;
    }
    const json = (await res.json()) as { tracks?: { items?: SpotifyTrack[] } };
    const results = Array.isArray(json.tracks?.items) ? json.tracks.items : [];
    setMusicSearchResults(results);
    if (results[0]?.preview_url) setSpotifyPreviewUrl(results[0].preview_url);
    if (results[0]?.id) setFullPlayerTrackId(results[0].id);
  }

  async function searchYouTube(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = musicSearchQuery.trim();
    if (!q) return;
    setIsSearchingMusic(true);
    setMusicSearchError(null);
    const res = await fetch(`${API_BASE}/api/youtube/search?q=${encodeURIComponent(q)}`);
    setIsSearchingMusic(false);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      setMusicSearchError(text || "YouTube search failed. Check server API key.");
      return;
    }
    const json = (await res.json()) as { items?: YouTubeResult[] };
    const results = Array.isArray(json.items) ? json.items : [];
    setYoutubeResults(results);
    if (results[0]?.id?.videoId) setYoutubePreviewId(results[0].id.videoId);
  }

  async function saveSpotifyTrack(track: SpotifyTrack) {
    setIsBusy(true);
    const res = await fetch(`${API_BASE}/api/playlist/spotify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        spotifyId: track.id,
        title: track.name,
        artist: track.artists?.map((a) => a.name).join(", ") || "Unknown Artist",
        previewUrl: track.preview_url,
        spotifyUrl: track.external_urls?.spotify,
        coverUrl: track.album?.images?.[0]?.url ?? "",
      }),
    });
    setIsBusy(false);
    if (!res.ok) {
      setFlashMessage("Could not save this track.");
      return;
    }
    setFlashMessage(`"${track.name}" is added.`);
    await loadData();
  }

  async function saveYouTubeTrack(item: YouTubeResult) {
    const videoId = item.id?.videoId;
    if (!videoId) return;
    const title = item.snippet?.title ?? "YouTube Track";
    const channelTitle = item.snippet?.channelTitle ?? "YouTube";
    const thumbUrl =
      item.snippet?.thumbnails?.high?.url ?? item.snippet?.thumbnails?.medium?.url ?? "";

    setIsBusy(true);
    const res = await fetch(`${API_BASE}/api/playlist/youtube`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId, title, channelTitle, thumbUrl }),
    });
    setIsBusy(false);
    if (!res.ok) {
      setFlashMessage("Could not save this track.");
      return;
    }
    setFlashMessage(`"${title}" is added.`);
    await loadData();
  }

  function openFullSpotify(trackId: string) {
    setFullPlayerTrackId(trackId);
    setFlashMessage("Opening full player (Spotify)…");
    setTimeout(() => setFlashMessage(null), 1200);
  }

  function playYouTubeNow(videoId: string) {
    if (!videoId) return;
    setYoutubePreviewId(videoId);
  }

  function playSpotifyNow(previewUrl: string | null) {
    if (!previewUrl) return;
    setSpotifyPreviewUrl(previewUrl);
  }

  function nextTrack() {
    if (!playlist.length) return;
    const next = selectedTrackIndex >= 0 ? (selectedTrackIndex + 1) % playlist.length : 0;
    playTrackByIndex(next);
  }

  function prevTrack() {
    if (!playlist.length) return;
    const prev =
      selectedTrackIndex >= 0
        ? (selectedTrackIndex - 1 + playlist.length) % playlist.length
        : 0;
    playTrackByIndex(prev);
  }

  function toggleEmbeddedPlayback() {
    const iframe = ytPlayerRef.current;
    if (selectedTrack?.source === "youtube" && iframe?.contentWindow) {
      const func = embeddedPlaying ? "pauseVideo" : "playVideo";
      iframe.contentWindow.postMessage(
        JSON.stringify({ event: "command", func, args: [] }),
        "*"
      );
    }
    setEmbeddedPlaying((p) => !p);
  }

  function handleYTIframeLoad() {
    const iframe = ytPlayerRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage(
      JSON.stringify({ event: "listening", id: 1 }),
      "*"
    );
  }

  useEffect(() => {
    if (selectedTrack?.source !== "youtube") return;

    function handleYTMessage(event: MessageEvent) {
      if (!event.origin.includes("youtube.com")) return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.info?.playerState === 0) {
          nextTrack();
        }
      } catch {
        // ignore non-JSON messages
      }
    }

    window.addEventListener("message", handleYTMessage);
    return () => window.removeEventListener("message", handleYTMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTrack?.source, selectedTrackIndex, playlist.length]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoaded = () => setDurationSec(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onTime = () => setCurrentTimeSec(audio.currentTime);
    const onEnded = () => {
      nextTrack();
    };

    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioRef.current, selectedTrackIndex, playlist.length]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    setCurrentTimeSec(0);
    setDurationSec(Number.isFinite(audio.duration) ? audio.duration : 0);
    if (isPlaying) void audio.play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTrack?.file_url]);

  useEffect(() => {
    const audio = spotifyPreviewRef.current;
    if (!audio || !spotifyPreviewUrl) return;
    void audio.play().catch(() => {
      // autoplay may be blocked by browser policy until user gesture
    });
  }, [spotifyPreviewUrl]);

  useEffect(() => {
    setEmbeddedPlaying(true);
  }, [selectedTrackId]);

  function shiftMedia(direction: -1 | 1) {
    if (homeMedia.length === 0) return;
    setMediaFocusIndex((prev) => (prev + direction + homeMedia.length) % homeMedia.length);
  }

  function getCardOffset(index: number) {
    if (homeMedia.length === 0) return 0;
    let offset = index - mediaFocusIndex;
    const half = Math.floor(homeMedia.length / 2);
    if (offset > half) offset -= homeMedia.length;
    if (offset < -half) offset += homeMedia.length;
    return offset;
  }

  if (!isUnlocked) {
    return (
      <div className="lock-screen">
        <div className="lock-card">
          <h1>Finest Monia</h1>
          <p>A private world for only two souls.</p>
          <form onSubmit={unlockExperience} className="lock-form">
            <input
              type="password"
              value={passcodeInput}
              onChange={(event) => setPasscodeInput(event.target.value)}
              placeholder="Enter your secret passcode"
              required
            />
            <button>Enter</button>
            {passcodeError && <small>{passcodeError}</small>}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="romance-app">
      {flashMessage && <div className="flash-toast">{flashMessage}</div>}
      {showIntro && (
        <div className="intro-overlay">
          <div className="intro-content">
            <p>Welcome, my love</p>
            <h1>{HER_NAME}</h1>
          </div>
        </div>
      )}

      <div className="layout-shell">
        <aside
          className={sidebarExpanded ? "sidebar expanded" : "sidebar collapsed"}
          onMouseEnter={() => setIsSidebarHovered(true)}
          onMouseLeave={() => setIsSidebarHovered(false)}
        >
          <button className="sidebar-logo" onClick={() => setIsSidebarPinned((prev) => !prev)} aria-label="Toggle sidebar">
            <svg viewBox="0 0 100 100" width="38" height="38" className="logo-heart">
              <defs>
                <linearGradient id="hg" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#f43f5e"/>
                  <stop offset="50%" stopColor="#fb7185"/>
                  <stop offset="100%" stopColor="#c084fc"/>
                </linearGradient>
              </defs>
              <path d="M50 88C50 88 8 58 8 32C8 15 20 5 34 5C43 5 48 11 50 18C52 11 57 5 66 5C80 5 92 15 92 32C92 58 50 88 50 88Z" fill="url(#hg)"/>
              <text x="50" y="55" textAnchor="middle" fontFamily="Georgia,serif" fontSize="28" fontWeight="bold" fontStyle="italic" fill="white" opacity="0.92">M</text>
            </svg>
            <span className="nav-label brand-name">Finest Monia</span>
          </button>
          <nav className="side-nav">
            {[
              { id: "home", icon: "🏠", label: "Home" },
              { id: "love letter", icon: "💌", label: "Love Letter" },
              { id: "music", icon: "🎵", label: "Music" },
              { id: "search music", icon: "🔎", label: "Search Music" },
              { id: "moments", icon: "🎬", label: "Moments" },
              { id: "private studio", icon: "✨", label: "Private Studio" },
            ].map((item) => (
              <button
                key={item.id}
                className={activeSection === item.id ? "side-btn active" : "side-btn"}
                onClick={() => setActiveSection(item.id)}
              >
                <span className="side-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </button>
            ))}
          </nav>
          
          <div className="sidebar-footer">
            <button
              className="side-btn logout-btn"
              onClick={() => {
                if(window.confirm('Are you sure you want to log out? This will lock the app.')) {
                  localStorage.removeItem('finest-monia-unlocked');
                  window.location.reload();
                }
              }}
            >
              <span className="side-icon">🚪</span>
              <span className="nav-label">Logout</span>
            </button>
          </div>
        </aside>

        <main className="content">
          {activeSection === "home" && (
            <>
              <section className="media-stage">
                <button className="stage-arrow left" onClick={() => shiftMedia(-1)} type="button">
                  ‹
                </button>
                <div className="stage-track">
                  {homeMedia.length > 0 ? (
                    homeMedia.map((memory, index) => {
                      const offset = getCardOffset(index);
                      const distance = Math.abs(offset);
                      const hidden = Math.abs(offset) > 2;
                      const className = [
                        "stage-card",
                        offset === 0 ? "active" : "",
                        offset < 0 ? "left" : "",
                        offset > 0 ? "right" : "",
                        hidden ? "hidden" : "",
                      ]
                        .join(" ")
                        .trim();

                      return (
                        <article
                          key={memory.id}
                          className={className}
                          style={
                            {
                              transform: `translateX(${offset * 140}px) translateZ(${distance * -90}px) rotateY(${Math.sign(offset) * -12}deg) scale(${1 - distance * 0.04})`,
                              zIndex: 30 - distance,
                              opacity: hidden ? 0 : offset === 0 ? 1 : 0.85,
                            } as CSSProperties
                          }
                          onClick={() => setMediaFocusIndex(index)}
                        >
                          {memory.media_type === "image" ? (
                            <img src={`${API_BASE}${memory.file_url}`} alt={memory.title} />
                          ) : (
                            <video
                              src={`${API_BASE}${memory.file_url}`}
                              muted
                              loop
                              playsInline
                              autoPlay
                            />
                          )}
                        </article>
                      );
                    })
                  ) : (
                    <div className="slide-placeholder">
                      Add pictures and videos to unlock this cinematic memory carousel.
                    </div>
                  )}
                </div>
                <button className="stage-arrow right" onClick={() => shiftMedia(1)} type="button">
                  ›
                </button>
                <div className="stage-dots">
                  {homeMedia.map((item, index) => (
                    <button
                      key={item.id}
                      type="button"
                      className={index === mediaFocusIndex ? "dot active" : "dot"}
                      onClick={() => setMediaFocusIndex(index)}
                    />
                  ))}
                </div>
                <div className="hero-overlay">
                  <h2>Our Beautiful Story</h2>
                  <p>Every moment with you is my forever favorite ♥</p>
                </div>
              </section>


              <section className="player-shell">
                <div className="now-panel">
                  <div className="player-search player-search-top">
                    <div className="player-search-head">
                      <strong>Search & save music</strong>
                      <div className="player-search-right">
                        <div className="segmented player-source">
                          <button
                            type="button"
                            className={musicSource === "youtube" ? "seg active" : "seg"}
                            onClick={() => setMusicSource("youtube")}
                          >
                            YouTube (full)
                          </button>
                          <button
                            type="button"
                            className={musicSource === "spotify" ? "seg active" : "seg"}
                            onClick={() => setMusicSource("spotify")}
                          >
                            Spotify
                          </button>
                        </div>
                      </div>
                    </div>
                      <form
                          onSubmit={musicSource === "youtube" ? searchYouTube : searchSpotify}
                          className="player-search-form"
                        >
                          <input
                            className="player-search-input"
                            value={musicSearchQuery}
                            onChange={(e) => setMusicSearchQuery(e.target.value)}
                            placeholder={
                              musicSource === "youtube"
                                ? "Search on YouTube…"
                                : "Search on Spotify…"
                            }
                          />
                          <button disabled={isSearchingMusic}>
                            {isSearchingMusic ? "…" : "Search"}
                          </button>
                        </form>
                        {musicSearchError && <p className="player-error">{musicSearchError}</p>}

                        {musicSource === "youtube" ? (
                          <>
                            {youtubePreviewId && (
                              <div className="player-full">
                                <div className="player-full-head">
                                  <span>Now playing from YouTube</span>
                                </div>
                                <iframe
                                  title="YouTube Search Player"
                                  src={`https://www.youtube.com/embed/${youtubePreviewId}?autoplay=1&rel=0`}
                                  width="100%"
                                  height="220"
                                  frameBorder="0"
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                  allowFullScreen
                                />
                              </div>
                            )}

                            <div className="player-results">
                              {youtubeResults.slice(0, 6).map((item) => (
                                <article
                                  key={item.id.videoId}
                                  className="player-result clickable"
                                  onClick={() => playYouTubeNow(item.id.videoId)}
                                >
                                  <img
                                    className="player-cover"
                                    src={
                                      item.snippet?.thumbnails?.medium?.url ??
                                      item.snippet?.thumbnails?.high?.url ??
                                      ""
                                    }
                                    alt=""
                                    loading="lazy"
                                  />
                                  <div className="player-result-meta">
                                    <strong title={item.snippet?.title}>{item.snippet?.title}</strong>
                                    <p>{item.snippet?.channelTitle}</p>
                                  </div>
                                  <div className="player-result-actions">
                                    <div className="player-result-buttons">
                                      <button
                                        disabled={isBusy}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          void saveYouTubeTrack(item);
                                        }}
                                        type="button"
                                      >
                                        Save
                                      </button>
                                    </div>
                                  </div>
                                </article>
                              ))}
                            </div>
                          </>
                        ) : (
                          <>
                            {spotifyPreviewUrl && (
                              <div className="player-full">
                                <div className="player-full-head">
                                  <span>Now previewing from Spotify</span>
                                </div>
                                <audio ref={spotifyPreviewRef} controls autoPlay src={spotifyPreviewUrl} />
                              </div>
                            )}

                            {fullPlayerTrackId && (
                              <div className="player-full">
                                <div className="player-full-head">
                                  <span>Full Spotify player</span>
                                  <button
                                    type="button"
                                    className="ghost"
                                    onClick={() => setFullPlayerTrackId(null)}
                                  >
                                    Close
                                  </button>
                                </div>
                                <iframe
                                  title="Spotify Player"
                                  src={`https://open.spotify.com/embed/track/${fullPlayerTrackId}?utm_source=generator&theme=0`}
                                  width="100%"
                                  height="152"
                                  frameBorder="0"
                                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                                />
                              </div>
                            )}

                            <div className="player-results">
                              {musicSearchResults.slice(0, 6).map((track) => (
                                <article
                                  key={track.id}
                                  className="player-result clickable"
                                  onClick={() => playSpotifyNow(track.preview_url)}
                                >
                                  <img
                                    className="player-cover"
                                    src={track.album?.images?.[0]?.url ?? ""}
                                    alt=""
                                    loading="lazy"
                                  />
                                  <div className="player-result-meta">
                                    <strong title={track.name}>{track.name}</strong>
                                    <p>{track.artists?.map((a) => a.name).join(", ")}</p>
                                  </div>
                                  <div className="player-result-actions">
                                    {track.preview_url ? (
                                      <audio controls src={track.preview_url} />
                                    ) : (
                                      <p className="player-hint">No 30s preview for this track.</p>
                                    )}
                                    <div className="player-result-buttons">
                                      <button
                                        type="button"
                                        className="ghost"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openFullSpotify(track.id);
                                        }}
                                      >
                                        Full
                                      </button>
                                      <button
                                        disabled={isBusy}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          void saveSpotifyTrack(track);
                                        }}
                                        type="button"
                                      >
                                        Save
                                      </button>
                                    </div>
                                  </div>
                                </article>
                              ))}
                            </div>
                            <p className="player-hint">
                              Spotify previews are optional. Use Full to stream via Spotify embed.
                            </p>
                          </>
                        )}
                    </div>

                  <div className="now-top">
                    <div className="now-meta-inline">
                      <span className="eyebrow inline">NOW PLAYING:</span>
                      <strong className="track-title" title={selectedTrack?.title}>{selectedTrack?.title ?? "Your romantic playlist"}</strong>
                      <span className="track-artist subtle" title={selectedTrack?.artist}> — {selectedTrack?.artist ?? "Add songs from Private Studio"}</span>
                    </div>
                  </div>


                  {selectedTrack?.media_type === "audio" && (
                    <>
                      <audio
                        ref={audioRef}
                        src={resolveMediaUrl(selectedTrack.file_url)}
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                      />

                      <div className="seek-row">
                        <span className="time">{formatTime(currentTimeSec)}</span>
                        <input
                          className="seek"
                          type="range"
                          min={0}
                          max={Math.max(0.01, durationSec)}
                          step={0.1}
                          value={Math.min(currentTimeSec, durationSec || 0)}
                          onChange={(e) => {
                            const next = Number(e.target.value);
                            if (audioRef.current) audioRef.current.currentTime = next;
                            setCurrentTimeSec(next);
                          }}
                        />
                        <span className="time">{formatTime(durationSec)}</span>
                      </div>

                      <div className="controls-row">
                        <button type="button" className="icon" aria-label="Shuffle" title="Shuffle">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>
                        </button>
                        <button type="button" className="icon" onClick={prevTrack} aria-label="Previous">
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" /></svg>
                        </button>
                        <button
                          type="button"
                          className="play"
                          onClick={() => {
                            if (!audioRef.current) return;
                            if (audioRef.current.paused) {
                              void audioRef.current.play();
                              setIsPlaying(true);
                              return;
                            }
                            audioRef.current.pause();
                            setIsPlaying(false);
                          }}
                          aria-label={isPlaying ? "Pause" : "Play"}
                        >
                          {isPlaying ? (
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                          ) : (
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                          )}
                        </button>
                        <button type="button" className="icon" onClick={nextTrack} aria-label="Next">
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" /></svg>
                        </button>
                        <button type="button" className="icon" aria-label="Repeat" title="Repeat all">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>
                        </button>

                        <div className="volume">
                          <span aria-hidden="true">🔊</span>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            value={volume}
                            onChange={(e) => setVolume(Number(e.target.value))}
                          />
                        </div>
                      </div>
                    </>
                  )}
                  {(selectedTrack?.source === "youtube" || selectedTrack?.source === "spotify") && (
                    <div className="controls-row embed-controls">
                      <button type="button" className="icon" aria-label="Shuffle" title="Shuffle">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>
                      </button>
                      <button type="button" className="icon" onClick={prevTrack} aria-label="Previous">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" /></svg>
                      </button>
                      <button
                        type="button"
                        className="play"
                        onClick={toggleEmbeddedPlayback}
                        aria-label={embeddedPlaying ? "Pause" : "Play"}
                      >
                        {embeddedPlaying ? (
                          <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                        ) : (
                          <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                        )}
                      </button>
                      <button type="button" className="icon" onClick={nextTrack} aria-label="Next">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" /></svg>
                      </button>
                      <button type="button" className="icon" aria-label="Repeat" title="Repeat all">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>
                      </button>
                    </div>
                  )}

                  {selectedTrack?.source === "youtube" ? (
                    <iframe
                      ref={ytPlayerRef}
                      key={`yt-${selectedTrack.id}`}
                      title="YouTube Player"
                      className="yt-player"
                      src={`https://www.youtube.com/embed/${selectedTrack.external_id}?autoplay=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      onLoad={handleYTIframeLoad}
                    />
                  ) : selectedTrack?.source === "spotify" ? (
                    <iframe
                      key={`sp-${selectedTrack.id}`}
                      title="Spotify Player"
                      className="yt-player"
                      src={`https://open.spotify.com/embed/track/${selectedTrack.external_id}?utm_source=generator&theme=0`}
                      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    />
                  ) : selectedTrack?.media_type === "video" ? (
                    <video controls src={resolveMediaUrl(selectedTrack.file_url)} />
                  ) : null}
                </div>

                <div className="queue-panel">
                  <h4>Playlist Queue</h4>
                  <div className="queue-list">
                    {playlist.map((track) => (
                      <article
                        className={selectedTrack?.id === track.id ? "queue-item active" : "queue-item"}
                        key={track.id}
                        draggable
                        onClick={() => setSelectedTrackId(track.id)}
                        onDragStart={() => setDraggedTrackId(track.id)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => void handleTrackDrop(track.id)}
                      >
                        <div className="queue-meta">
                          <strong>{track.title}</strong>
                          <p>{track.artist}</p>
                        </div>
                        <div className="queue-menu-wrap">
                          <button className="kebab-btn">⋮</button>
                          <div className="queue-menu">
                            <button
                              className="danger-text"
                              onClick={(event) => {
                                event.stopPropagation();
                                void deleteTrack(track.id);
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </section>
            </>
          )}

          {activeSection === "music" && (
            <section className="glass-card">
              <div className="moments-header">
                <div>
                  <h3>Private Studio Queue</h3>
                  <p className="muted">Your saved romantic tracks. Click any track to play it on the Home player.</p>
                </div>
              </div>
              <div className="deezer-grid">
                {playlist.map((track) => (
                  <article
                    className="deezer-card clickable"
                    key={track.id}
                    onClick={() => setSelectedTrackId(track.id)}
                  >
                    <div className="deezer-row">
                      <img
                        className="deezer-cover"
                        style={{ width: "56px", height: "56px", objectFit: "cover", borderRadius: "10px" }}
                        src={track.cover_url || "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&q=80"}
                        alt=""
                      />
                      <div className="deezer-meta">
                        <strong title={track.title}>{track.title}</strong>
                        <p>{track.artist}</p>
                      </div>
                    </div>
                    <button 
                      className="ghost danger-text" 
                      onClick={(e) => { e.stopPropagation(); void deleteTrack(track.id); }} 
                      type="button"
                    >
                      Delete Track
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeSection === "search music" && (
            <section className="glass-card">
              <div className="moments-header">
                <div>
                  <h3>Search YouTube Music</h3>
                  <p className="muted">Find the perfect romantic YouTube song and save it to your Private Studio queue.</p>
                </div>
              </div>

              <form onSubmit={searchYouTube} className="deezer-search">
                <input
                  className="moments-search"
                  value={musicSearchQuery}
                  onChange={(e) => setMusicSearchQuery(e.target.value)}
                  placeholder="Search on YouTube..."
                />
                <button disabled={isSearchingMusic}>{isSearchingMusic ? "Searching…" : "Search"}</button>
              </form>
              {musicSearchError && <p className="empty-copy">{musicSearchError}</p>}

              <div className="deezer-grid">
                {youtubeResults.map((item) => (
                  <article key={item.id.videoId} className="deezer-card">
                    <div className="deezer-row">
                      <img
                        className="deezer-cover"
                        style={{ width: "56px", height: "56px", objectFit: "cover", borderRadius: "10px" }}
                        src={
                          item.snippet?.thumbnails?.medium?.url ??
                          item.snippet?.thumbnails?.high?.url ??
                          ""
                        }
                        alt=""
                      />
                      <div className="deezer-meta">
                        <strong title={item.snippet?.title}>{item.snippet?.title}</strong>
                        <p>{item.snippet?.channelTitle}</p>
                      </div>
                    </div>
                    <button disabled={isBusy} onClick={() => void saveYouTubeTrack(item)} type="button">
                      Save to Playlist
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeSection === "moments" && (
            <section className="glass-card">
              <div className="moments-header">
                <div>
                  <h3>Moments</h3>
                  <p className="muted">All your memories — clean, organized, and beautiful.</p>
                </div>

                <div className="moments-controls">
                  <div className="segmented">
                    <button
                      type="button"
                      className={momentsFilter === "all" ? "seg active" : "seg"}
                      onClick={() => setMomentsFilter("all")}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      className={momentsFilter === "photos" ? "seg active" : "seg"}
                      onClick={() => setMomentsFilter("photos")}
                    >
                      Photos
                    </button>
                    <button
                      type="button"
                      className={momentsFilter === "videos" ? "seg active" : "seg"}
                      onClick={() => setMomentsFilter("videos")}
                    >
                      Videos
                    </button>
                  </div>

                  <input
                    className="moments-search"
                    value={momentsQuery}
                    onChange={(e) => setMomentsQuery(e.target.value)}
                    placeholder="Search memories…"
                  />
                </div>
              </div>

              <div className="moments-grid">
                {filteredMoments.map((memory) => (
                  <article key={memory.id} className="moment-card">
                    <button
                      type="button"
                      className="moment-media"
                      onClick={() => setViewerId(memory.id)}
                      aria-label="Open memory"
                    >
                      {memory.media_type === "image" ? (
                        <img src={`${API_BASE}${memory.file_url}`} alt={memory.title} loading="lazy" />
                      ) : (
                        <video src={`${API_BASE}${memory.file_url}`} muted playsInline preload="metadata" />
                      )}
                      <span className="badge">{memory.media_type === "image" ? "Photo" : "Video"}</span>
                    </button>

                    <div className="moment-meta">
                      {editingMomentId === memory.id ? (
                        <>
                          <input
                            value={editingMomentTitle}
                            onChange={(e) => setEditingMomentTitle(e.target.value)}
                            placeholder="Rename this moment…"
                          />
                          <div className="moment-actions">
                            <button
                              type="button"
                              onClick={() => void saveMomentTitle()}
                              disabled={isSavingMomentTitle}
                            >
                              {isSavingMomentTitle ? "Saving…" : "Save"}
                            </button>
                            <button
                              type="button"
                              className="ghost"
                              onClick={() => {
                                setEditingMomentId(null);
                                setEditingMomentTitle("");
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="moment-buttons">
                            <button
                              type="button"
                              className="ghost"
                              onClick={() => void startEditingMoment(memory.id, memory.title)}
                            >
                              Rename
                            </button>
                            <button className="danger" onClick={() => void deleteMemory(memory.id)}>
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {viewerItem && (
            <div className="viewer" role="dialog" aria-modal="true" onClick={() => setViewerId(null)}>
              <div className="viewer-inner" onClick={(e) => e.stopPropagation()}>
                <button className="viewer-close" type="button" onClick={() => setViewerId(null)}>
                  ✕
                </button>
                {viewerItem.media_type === "image" ? (
                  <img src={`${API_BASE}${viewerItem.file_url}`} alt={viewerItem.title} />
                ) : (
                  <video src={`${API_BASE}${viewerItem.file_url}`} controls autoPlay />
                )}
                <div className="viewer-caption">
                  <strong>{viewerItem.title}</strong>
                </div>
              </div>
            </div>
          )}

          {activeSection === "love letter" && (
            <div className={`letter-split-layout ${showLetterHistory ? 'history-open' : 'history-closed'}`} style={{ position: 'relative' }}>
              <div className="letter-hearts" aria-hidden="true">
                {Array.from({ length: 32 }).map((_, i) => (
                  <span
                    key={i}
                    className="floating-heart"
                    style={{
                      left: `${Math.random() * 100}%`,
                      animationDelay: `${Math.random() * 10}s`,
                      animationDuration: `${6 + Math.random() * 8}s`,
                      fontSize: `${0.6 + Math.random() * 1.2}rem`,
                    }}
                  >
                    ♥
                  </span>
                ))}
              </div>

              <div className="letter-main" style={{ position: 'relative', zIndex: 1 }}>
                <div className="letter-top-actions">
                  <button 
                    className="side-btn archive-toggle-btn-far" 
                    onClick={() => setShowLetterHistory(!showLetterHistory)}
                  >
                    {showLetterHistory ? "📜 Hide Archive" : "📚 View Archive"}
                  </button>
                </div>

                <section className="letter-section" style={{ minHeight: 'auto' }}>
                  <div className="letter-card">
                    <div className="letter-wax">♥</div>
                    <h2>Words I Keep For You</h2>
                    <div className="letter-divider">
                      <span>✦</span>
                    </div>
                    <p style={{ whiteSpace: 'pre-wrap' }}>
                      {loveLetters[0]?.content || LETTER_TEXT}
                    </p>
                    <div className="letter-closing">
                      <span className="letter-sign">~ Forever & Always ~</span>
                    </div>
                  </div>
                </section>

                <div className="glass-card letter-composer" style={{ marginTop: '2rem' }}>
                  <h3>Write a New Letter</h3>
                  <textarea
                    placeholder="Type your message here..."
                    value={newLetterContent}
                    onChange={(e) => setNewLetterContent(e.target.value)}
                  />
                  <button 
                    disabled={isBusy || !newLetterContent.trim()} 
                    onClick={submitLoveLetter}
                  >
                    {isBusy ? "Saving..." : "Save to History ♥"}
                  </button>
                </div>
              </div>

              {showLetterHistory && (
                <aside className="letter-history" style={{ animation: 'fade-in 0.4s ease' }}>
                  <h3 className="history-title">History of Us</h3>
                  <div className="history-stack">
                    {loveLetters.length === 0 ? (
                      <p className="muted" style={{ textAlign: 'center', marginTop: '2rem' }}>
                        No letters yet.
                      </p>
                    ) : (
                      loveLetters.map((letter) => (
                        <article 
                          key={letter.id} 
                          className="history-item clickable"
                          onClick={() => setSelectedArchiveLetter(letter)}
                        >
                          <button 
                            className="archive-delete-x"
                            onClick={(e) => {
                              e.stopPropagation();
                              void deleteLetter(letter.id);
                            }}
                          >
                            ✖
                          </button>
                          <div className="history-wax">♥</div>
                          <p>{letter.content.length > 80 ? letter.content.substring(0, 77) + "..." : letter.content}</p>
                          <div className="history-date-row">
                            <span className="history-date">
                              {new Date(letter.created_at).toLocaleDateString(undefined, { 
                                month: 'short', 
                                day: 'numeric', 
                                year: 'numeric' 
                              })}
                            </span>
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                </aside>
              )}

              {selectedArchiveLetter && (
                <div className="viewer" role="dialog" aria-modal="true" onClick={() => setSelectedArchiveLetter(null)}>
                  <div className="viewer-inner letter-modal-stage" onClick={(e) => e.stopPropagation()}>
                    <button className="viewer-close modern-close" type="button" onClick={() => setSelectedArchiveLetter(null)}>
                      ✕
                    </button>
                    <div className="letter-card cinematic-parchment">
                      <div className="letter-wax-large">♥</div>
                      <span className="letter-decoration top-left">❦</span>
                      <span className="letter-decoration bottom-right">❦</span>
                      
                      <div className="letter-modal-head">
                        <h3>A Moment from the Heart</h3>
                      </div>

                      <div className="letter-divider">
                        <span>✦ ✦ ✦</span>
                      </div>
                      
                      <div className="letter-content-scroll">
                        <p>{selectedArchiveLetter.content}</p>
                      </div>

                      <div className="letter-closing">
                        <span className="letter-sign">~ Forever & Always ~</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeSection === "private studio" && (
            <section className="studio-grid">
              <form className="glass-card upload-card content-card" onSubmit={submitPlaylist}>
                <div className="upload-icon">🎵</div>
                <div className="upload-meta">
                  <h3>Add Music / Video</h3>
                  <p>Drop your songs or music videos here. The system will auto-detect everything.</p>
                </div>
                <div className="file-input-wrapper">
                  <input
                    name="media"
                    type="file"
                    id="music-upload"
                    accept="audio/*,video/*"
                    required
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      setMusicFileName(f ? f.name : null);
                    }}
                  />
                  <label htmlFor="music-upload" className={`file-label ${musicFileName ? 'file-selected' : ''}`}>
                    {musicFileName ? (
                      <span className="file-name-display">
                        <span className="file-check">✓</span> {musicFileName}
                      </span>
                    ) : (
                      <span>🎶 Click to choose a song or video</span>
                    )}
                  </label>
                </div>
                <button className="upload-btn" disabled={isBusy || !musicFileName}>
                  {isBusy ? "Uploading..." : "Upload to Studio"}
                </button>
              </form>

              <form className="glass-card upload-card gallery-card" onSubmit={submitGallery}>
                <div className="upload-icon">📸</div>
                <div className="upload-meta">
                  <h3>Add Moment</h3>
                  <p>Upload a romantic picture or video to your shared gallery.</p>
                </div>
                <div className="file-input-wrapper">
                  <input
                    name="media"
                    type="file"
                    id="gallery-upload"
                    accept="image/*,video/*"
                    required
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      setGalleryFileName(f ? f.name : null);
                    }}
                  />
                  <label htmlFor="gallery-upload" className={`file-label ${galleryFileName ? 'file-selected' : ''}`}>
                    {galleryFileName ? (
                      <span className="file-name-display">
                        <span className="file-check">✓</span> {galleryFileName}
                      </span>
                    ) : (
                      <span>📷 Click to choose a photo or video</span>
                    )}
                  </label>
                </div>
                <button className="upload-btn" disabled={isBusy || !galleryFileName}>
                  {isBusy ? "Uploading..." : "Save to Gallery"}
                </button>
              </form>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
