"use client";

import Image from "next/image";
import { Ma_Shan_Zheng } from "next/font/google";
import {
  type CSSProperties,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  useMemo,
} from "react";
import type { SiteModelPicture, SiteModelSummary } from "@/lib/site-models";
import type {
  DirectionalLight,
  Material,
  Mesh,
  Object3D,
  PerspectiveCamera,
  ShadowMaterial,
  WebGLRenderer,
} from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

type ViewerState =
  | { kind: "loading"; message: string }
  | { kind: "ready"; message: string }
  | { kind: "error"; message: string };

type ModelViewerProps = {
  models: SiteModelSummary[];
  initialSlug?: string | null;
};

type OverviewStageProps = {
  models: SiteModelSummary[];
  onSelect: (slug: string) => void;
  activeThemeRoute: ThemeRoute | null;
  onThemeRouteChange: (routeId: ThemeRouteId | null) => void;
  isBackgroundAudioEnabled: boolean;
  onBackgroundAudioToggle: () => void;
  tourProgress: TourProgress;
  visitedModelSlugs: ReadonlySet<string>;
};

type SingleModelStageProps = {
  models: SiteModelSummary[];
  model: SiteModelSummary;
  onSelect: (slug: string) => void;
  onBack: () => void;
  activeThemeRoute: ThemeRoute | null;
  isBackgroundAudioEnabled: boolean;
  onBackgroundAudioToggle: () => void;
  tourProgress: TourProgress;
  visitedModelSlugs: ReadonlySet<string>;
};

type OverviewMapFrameProps = {
  highlightedModel?: SiteModelSummary | null;
  mapMode: MapMode;
  models: SiteModelSummary[];
  activeThemeRoute: ThemeRoute | null;
  visitedModelSlugs: ReadonlySet<string>;
  children?: ReactNode;
};

type MapLabelProps = {
  model: SiteModelSummary;
  onSelect: (slug: string) => void;
  onPreview: (slug: string) => void;
  onPreviewClear: () => void;
  isPreviewed: boolean;
  isVisited: boolean;
  routeOrder?: number;
};

type DirectoryDrawerProps = {
  models: SiteModelSummary[];
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onSelect: (slug: string) => void;
  onPreview?: (slug: string) => void;
  onPreviewClear?: () => void;
  tourProgress?: TourProgress;
  visitedModelSlugs?: ReadonlySet<string>;
};

type InkTransitionPhase = "covering" | "revealing" | "hidden";
type InkTransitionKind = "initial" | "switch";
type MapMode = "normal" | "heat";
type InterpretationMode = "intro" | "detail";
type OverviewIntroPanelPhase = "visible" | "leaving" | "hidden";
type ThemeRouteId =
  | "first-visit"
  | "lotus"
  | "borrowed-view"
  | "scholar-study"
  | "seasonal";

type SiteModelHeatData = {
  value: number;
  level: "极热" | "高热" | "中热" | "温和" | "清静";
  color: RgbColor;
  radius: number;
  opacity: number;
};

type TourProgress = {
  visitedCount: number;
  totalCount: number;
};

type NormalizedMapPoint = {
  x: number;
  y: number;
};

type ThemeRouteWaypoint = NormalizedMapPoint | { slug: string };

type ThemeRoute = {
  id: ThemeRouteId;
  label: string;
  shortLabel: string;
  summary: string;
  description: string;
  waypoints: readonly ThemeRouteWaypoint[];
  accent: RgbColor;
};

type InkWashOverlayProps = {
  phase: InkTransitionPhase;
  label: string;
  isMapFontReady: boolean;
};

type BackgroundAudioButtonProps = {
  isEnabled: boolean;
  onToggle: () => void;
  className?: string;
};

type TourProgressBadgeProps = {
  progress: TourProgress;
  className?: string;
};

type ThemeRouteSelectorPanelProps = {
  models: SiteModelSummary[];
  activeRoute: ThemeRoute | null;
  visitedModelSlugs: ReadonlySet<string>;
  onSelectRoute: (routeId: ThemeRouteId) => void;
  onClearRoute: () => void;
  onStartRoute: () => void;
};

type BuildingGalleryPanelProps = {
  model: SiteModelSummary;
  pictures: SiteModelPicture[];
  currentIndex: number;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onExpand: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSelect: (index: number) => void;
};

type BuildingGalleryLightboxProps = {
  model: SiteModelSummary;
  pictures: SiteModelPicture[];
  currentIndex: number;
  isOpen: boolean;
  rotation: number;
  scale: number;
  pan: NormalizedMapPoint;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onPanChange: (pan: NormalizedMapPoint) => void;
  onSelect: (index: number) => void;
};

const FALLBACK_MAP_POSITION = { x: 0.5, y: 0.93 };
const LOCATION_IMAGE_WIDTH = 2038;
const LOCATION_IMAGE_HEIGHT = 1280;
const LOCATION_IMAGE_RATIO = LOCATION_IMAGE_WIDTH / LOCATION_IMAGE_HEIGHT;
const LABEL_DOT_OFFSET = 33;
const MODEL_INTRO_ROTATION_DURATION_MS = 4500;
const MODEL_CAMERA_DISTANCE_MULTIPLIER = 0.86;
const INTERPRETATION_TYPE_INTERVAL_MS = 58;
const NARRATION_AUDIO_DIRECTORY = "/audio";
const NARRATION_AUDIO_EXTENSIONS = ["mp3", "m4a", "wav", "ogg"] as const;
const BACKGROUND_AUDIO_SOURCE = "/audio/background.flac";
const BACKGROUND_AUDIO_VOLUME = 0.36;
const INK_TRANSITION_INITIAL_HOLD_MS = 320;
const INK_TRANSITION_COVER_MS = 720;
const INK_TRANSITION_REVEAL_MS = 1160;
const OVERVIEW_INTRO_PANEL_HOLD_MS = 2600;
const OVERVIEW_INTRO_PANEL_SLIDE_MS = 1500;
const mapLabelFont = Ma_Shan_Zheng({
  weight: "400",
  display: "swap",
  preload: false,
  fallback: ["STKaiti", "Kaiti SC", "KaiTi", "Songti SC", "serif"],
});
const MAP_LABEL_TEXT_STYLE: CSSProperties = {
  WebkitTextStroke: "4px rgba(247, 242, 232, 0.96)",
  paintOrder: "stroke fill",
  textShadow:
    "0 2px 8px rgba(255, 248, 236, 0.88), 0 8px 18px rgba(42, 28, 16, 0.16)",
};
const PAPER_PANEL_CLASS =
  "border border-[#65513f]/10 bg-[linear-gradient(180deg,_rgba(255,255,252,0.95)_0%,_rgba(247,243,236,0.98)_100%)] shadow-[0_24px_56px_rgba(72,51,32,0.16)]";
const PAPER_BUTTON_CLASS =
  "border border-[#4d3b2d]/10 bg-[linear-gradient(180deg,_rgba(255,255,253,0.96)_0%,_rgba(247,243,236,0.98)_100%)] text-[#2f2118] shadow-[0_14px_28px_rgba(73,52,34,0.12)]";
const JADE_BUTTON_CLASS =
  "shrink-0 items-center justify-center rounded-full border border-[#7b6247]/16 bg-[radial-gradient(circle_at_38%_30%,_rgba(255,255,255,0.96)_0%,_rgba(248,243,235,0.9)_36%,_rgba(217,202,181,0.82)_100%)] text-[#5a4839] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_6px_14px_rgba(45,31,20,0.12)] transition hover:border-[#6f563d]/28 hover:bg-[radial-gradient(circle_at_38%_30%,_rgba(255,255,255,1)_0%,_rgba(250,246,240,0.98)_38%,_rgba(226,211,190,0.92)_100%)] disabled:cursor-not-allowed disabled:opacity-45";
const MODEL_ROUTE_PREFIX = "/models";
const VISITED_SITE_MODELS_STORAGE_KEY = "web3d:visited-site-models:v1";
let hasOverviewIntroPanelBeenShown = false;

type RgbColor = readonly [number, number, number];

type DaylightStyleStop = {
  progress: number;
  label: string;
  skyTop: RgbColor;
  skyMiddle: RgbColor;
  skyBottom: RgbColor;
  wash: RgbColor;
  sun: RgbColor;
  ground: RgbColor;
};

type DaylightControlProps = {
  progress: number;
  label: string;
  onProgressChange: (progress: number) => void;
};

const DAYLIGHT_STYLE_STOPS: readonly DaylightStyleStop[] = [
  {
    progress: 0,
    label: "日出",
    skyTop: [237, 246, 244],
    skyMiddle: [238, 242, 232],
    skyBottom: [222, 219, 207],
    wash: [232, 226, 190],
    sun: [239, 233, 190],
    ground: [211, 207, 195],
  },
  {
    progress: 0.5,
    label: "正午",
    skyTop: [255, 254, 251],
    skyMiddle: [248, 246, 240],
    skyBottom: [234, 228, 219],
    wash: [255, 254, 236],
    sun: [255, 249, 205],
    ground: [222, 216, 207],
  },
  {
    progress: 1,
    label: "日落",
    skyTop: [226, 235, 240],
    skyMiddle: [218, 224, 225],
    skyBottom: [205, 208, 202],
    wash: [216, 214, 186],
    sun: [226, 220, 176],
    ground: [197, 199, 192],
  },
] as const;

const SITE_MODEL_HEAT_BY_SLUG: Record<string, SiteModelHeatData> = {
  yuanxiangtang: {
    value: 96,
    level: "极热",
    color: [214, 45, 42],
    radius: 0.205,
    opacity: 0.78,
  },
  xiangzhou: {
    value: 92,
    level: "极热",
    color: [214, 45, 42],
    radius: 0.188,
    opacity: 0.72,
  },
  xiaofeihong: {
    value: 88,
    level: "高热",
    color: [232, 111, 42],
    radius: 0.172,
    opacity: 0.67,
  },
  sanshiliuyuanyangguan: {
    value: 86,
    level: "高热",
    color: [232, 111, 42],
    radius: 0.17,
    opacity: 0.66,
  },
  hefengsimianting: {
    value: 85,
    level: "高热",
    color: [232, 111, 42],
    radius: 0.164,
    opacity: 0.64,
  },
  jianshanlou: {
    value: 82,
    level: "中热",
    color: [229, 184, 45],
    radius: 0.152,
    opacity: 0.6,
  },
  xuexiangyunweiting: {
    value: 78,
    level: "中热",
    color: [229, 184, 45],
    radius: 0.142,
    opacity: 0.56,
  },
  linglongguan: {
    value: 72,
    level: "温和",
    color: [68, 165, 99],
    radius: 0.128,
    opacity: 0.5,
  },
  wuzhuyouju: {
    value: 79,
    level: "中热",
    color: [229, 184, 45],
    radius: 0.144,
    opacity: 0.56,
  },
  fucuige: {
    value: 76,
    level: "中热",
    color: [229, 184, 45],
    radius: 0.136,
    opacity: 0.54,
  },
  yushuitongzuoxuan: {
    value: 80,
    level: "中热",
    color: [229, 184, 45],
    radius: 0.146,
    opacity: 0.58,
  },
  tingyuxuan: {
    value: 74,
    level: "温和",
    color: [68, 165, 99],
    radius: 0.132,
    opacity: 0.52,
  },
  daishuangting: {
    value: 73,
    level: "温和",
    color: [68, 165, 99],
    radius: 0.13,
    opacity: 0.5,
  },
  daoyinglou: {
    value: 71,
    level: "温和",
    color: [68, 165, 99],
    radius: 0.128,
    opacity: 0.5,
  },
  liuyinluqu: {
    value: 70,
    level: "温和",
    color: [68, 165, 99],
    radius: 0.124,
    opacity: 0.48,
  },
  yulantang: {
    value: 68,
    level: "温和",
    color: [68, 165, 99],
    radius: 0.12,
    opacity: 0.46,
  },
  haitangchunwu: {
    value: 66,
    level: "清静",
    color: [68, 165, 99],
    radius: 0.116,
    opacity: 0.44,
  },
  nanxuan: {
    value: 64,
    level: "清静",
    color: [68, 165, 99],
    radius: 0.112,
    opacity: 0.42,
  },
};

const THEME_ROUTES = [
  {
    id: "first-visit",
    label: "初游路线",
    shortLabel: "初游",
    summary: "从东南入园，先疏后密，完整串起主景与水岸。",
    description: "适合第一次进入拙政园的完整导览，从庭院、水心、山楼一路走到西部水岸。",
    accent: [139, 70, 45],
    waypoints: [
      { x: 0.94, y: 0.68 },
      { x: 0.88, y: 0.68 },
      { slug: "tingyuxuan" },
      { x: 0.86, y: 0.68 },
      { slug: "haitangchunwu" },
      { slug: "linglongguan" },
      { slug: "wuzhuyouju" },
      { x: 0.78, y: 0.54 },
      { slug: "daishuangting" },
      { x: 0.7, y: 0.45 },
      { slug: "xuexiangyunweiting" },
      { x: 0.565, y: 0.47 },
      { slug: "hefengsimianting" },
      { x: 0.52, y: 0.502 },
      { x: 0.492, y: 0.49 },
      { x: 0.452, y: 0.475 },
      { slug: "liuyinluqu" },
      { x: 0.405, y: 0.46 },
      { x: 0.415, y: 0.43 },
      { x: 0.455, y: 0.36 },
      { slug: "jianshanlou" },
      { x: 0.4, y: 0.325 },
      { slug: "daoyinglou" },
      { x: 0.23, y: 0.38 },
      { slug: "fucuige" },
      { x: 0.22, y: 0.48 },
      { slug: "yushuitongzuoxuan" },
      { x: 0.23, y: 0.61 },
      { slug: "sanshiliuyuanyangguan" },
      { x: 0.33, y: 0.7 },
      { slug: "yulantang" },
      { x: 0.435, y: 0.7 },
      { x: 0.46, y: 0.66 },
      { slug: "xiangzhou" },
      { x: 0.515, y: 0.66 },
      { slug: "nanxuan" },
      { x: 0.54, y: 0.7 },
      { slug: "xiaofeihong" },
      { x: 0.57, y: 0.72 },
      { x: 0.6, y: 0.7 },
      { x: 0.63, y: 0.66 },
      { slug: "yuanxiangtang" },
      { x: 0.705, y: 0.655 },
      { x: 0.735, y: 0.68 },
      { x: 0.94, y: 0.35 },
    ],
  },
  {
    id: "lotus",
    label: "赏荷路线",
    shortLabel: "赏荷",
    summary: "围绕中部水面行进，重点看荷香、池心、画舫与桥影。",
    description: "夏日优先选择，从远香堂到荷风四面亭、香洲、小飞虹，沿水感受荷香与风。",
    accent: [61, 137, 105],
    waypoints: [
      { x: 0.72, y: 0.66 },
      { slug: "yuanxiangtang" },
      { x: 0.62, y: 0.59 },
      { slug: "hefengsimianting" },
      { x: 0.525, y: 0.61 },
      { slug: "xiangzhou" },
      { x: 0.515, y: 0.66 },
      { slug: "nanxuan" },
      { x: 0.54, y: 0.7 },
      { slug: "xiaofeihong" },
      { x: 0.48, y: 0.72 },
      { slug: "yulantang" },
      { x: 0.43, y: 0.68 },
      { x: 0.46, y: 0.58 },
      { slug: "liuyinluqu" },
    ],
  },
  {
    id: "borrowed-view",
    label: "借景路线",
    shortLabel: "借景",
    summary: "登楼、过桥、临水回望，专看框景、对景与远借塔影。",
    description: "适合想理解造园技法的游览，把高处眺望、窗框取景和水面倒影串起来。",
    accent: [62, 111, 145],
    waypoints: [
      { slug: "yuanxiangtang" },
      { x: 0.61, y: 0.55 },
      { slug: "hefengsimianting" },
      { x: 0.56, y: 0.47 },
      { slug: "xuexiangyunweiting" },
      { x: 0.52, y: 0.37 },
      { slug: "jianshanlou" },
      { x: 0.43, y: 0.36 },
      { x: 0.4, y: 0.45 },
      { slug: "liuyinluqu" },
      { x: 0.45, y: 0.56 },
      { slug: "xiangzhou" },
      { x: 0.52, y: 0.68 },
      { slug: "xiaofeihong" },
    ],
  },
  {
    id: "scholar-study",
    label: "文人书斋路线",
    shortLabel: "文人",
    summary: "从听雨、梧竹、海棠到玉兰，走一条更安静的书斋庭院线。",
    description: "适合慢游，重点看文人起居、植物寄意、听雨声景与庭院停留。",
    accent: [126, 86, 116],
    waypoints: [
      { x: 0.94, y: 0.68 },
      { slug: "tingyuxuan" },
      { x: 0.858, y: 0.68 },
      { slug: "haitangchunwu" },
      { slug: "linglongguan" },
      { x: 0.842, y: 0.56 },
      { slug: "wuzhuyouju" },
      { x: 0.78, y: 0.48 },
      { slug: "daishuangting" },
      { x: 0.69, y: 0.55 },
      { slug: "yuanxiangtang" },
      { x: 0.56, y: 0.68 },
      { slug: "yulantang" },
      { x: 0.45, y: 0.67 },
      { slug: "xiangzhou" },
    ],
  },
  {
    id: "seasonal",
    label: "四季景观路线",
    shortLabel: "四季",
    summary: "春花、夏荷、秋霜、冬梅连读，按季相理解园林时间感。",
    description: "不限定当季，也能通过题名与植物想象四时流转，适合看季节主题。",
    accent: [173, 91, 70],
    waypoints: [
      { slug: "haitangchunwu" },
      { x: 0.82, y: 0.58 },
      { slug: "wuzhuyouju" },
      { x: 0.78, y: 0.48 },
      { slug: "daishuangting" },
      { x: 0.69, y: 0.45 },
      { slug: "xuexiangyunweiting" },
      { x: 0.57, y: 0.47 },
      { slug: "hefengsimianting" },
      { x: 0.61, y: 0.58 },
      { slug: "yuanxiangtang" },
      { x: 0.56, y: 0.69 },
      { slug: "xiaofeihong" },
      { x: 0.49, y: 0.72 },
      { slug: "yulantang" },
    ],
  },
] as const satisfies readonly ThemeRoute[];

type InterpretationAudioRefs = {
  audioRef: MutableRefObject<HTMLAudioElement | null>;
  audioSessionRef: MutableRefObject<number>;
};

function disposeMaterial(material: Material) {
  material.dispose();
}

function getNarrationAudioCandidates(slug: string) {
  return NARRATION_AUDIO_EXTENSIONS.map(
    (extension) => `${NARRATION_AUDIO_DIRECTORY}/${slug}.${extension}`
  );
}

async function findNarrationAudioSource(slug: string, signal: AbortSignal) {
  for (const candidate of getNarrationAudioCandidates(slug)) {
    try {
      const response = await fetch(candidate, {
        method: "HEAD",
        cache: "no-store",
        signal,
      });

      if (response.ok) {
        return candidate;
      }
    } catch {
      if (signal.aborted) {
        return null;
      }
    }
  }

  return null;
}

function stopNarrationAudio(
  refs: InterpretationAudioRefs,
  resetToStart: boolean
) {
  refs.audioSessionRef.current += 1;
  const audio = refs.audioRef.current;

  if (!audio) {
    return;
  }

  audio.pause();
  audio.onended = null;
  audio.onerror = null;

  if (resetToStart) {
    try {
      audio.currentTime = 0;
    } catch {}
  }
}

function smoothStep(value: number) {
  return value * value * (3 - 2 * value);
}

function getSegment<T extends { progress: number }>(
  stops: readonly T[],
  progress: number
) {
  const clampedProgress = Math.min(Math.max(progress, 0), 1);

  for (let index = 0; index < stops.length - 1; index += 1) {
    const left = stops[index];
    const right = stops[index + 1];

    if (clampedProgress <= right.progress) {
      const span = right.progress - left.progress || 1;
      return {
        left,
        right,
        amount: smoothStep((clampedProgress - left.progress) / span),
      };
    }
  }

  const last = stops[stops.length - 1];

  return {
    left: last,
    right: last,
    amount: 0,
  };
}

function mixNumber(left: number, right: number, amount: number) {
  return left + (right - left) * amount;
}

function clampProgress(progress: number) {
  return Math.min(Math.max(progress, 0), 1);
}

function mixRgb(left: RgbColor, right: RgbColor, amount: number): RgbColor {
  return [
    Math.round(mixNumber(left[0], right[0], amount)),
    Math.round(mixNumber(left[1], right[1], amount)),
    Math.round(mixNumber(left[2], right[2], amount)),
  ];
}

function toRgb(color: RgbColor, alpha = 1) {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

function getHeatOuterColor(heatData: SiteModelHeatData): RgbColor {
  if (heatData.value < 75) {
    return [91, 180, 105];
  }

  if (heatData.value < 84) {
    return [229, 184, 45];
  }

  return [238, 181, 50];
}

function getThemeRouteById(routeId: ThemeRouteId | null) {
  if (!routeId) {
    return null;
  }

  return THEME_ROUTES.find((route) => route.id === routeId) ?? null;
}

function getThemeRouteStopSlugs(route: ThemeRoute | null) {
  if (!route) {
    return [];
  }

  return route.waypoints.flatMap((waypoint) =>
    "slug" in waypoint ? [waypoint.slug] : []
  );
}

function resolveThemeRouteStops(
  route: ThemeRoute | null,
  models: SiteModelSummary[]
) {
  if (!route) {
    return [];
  }

  const modelBySlug = new Map(models.map((model) => [model.slug, model]));

  return getThemeRouteStopSlugs(route).flatMap((slug) => {
    const model = modelBySlug.get(slug);

    return model ? [model] : [];
  });
}

function getThemeRouteStopOrder(route: ThemeRoute | null) {
  const orderBySlug = new Map<string, number>();

  getThemeRouteStopSlugs(route).forEach((slug, index) => {
    if (!orderBySlug.has(slug)) {
      orderBySlug.set(slug, index);
    }
  });

  return orderBySlug;
}

function resolveThemeRoutePoints(
  route: ThemeRoute | null,
  models: SiteModelSummary[]
): NormalizedMapPoint[] {
  if (!route) {
    return [];
  }

  const modelBySlug = new Map(models.map((model) => [model.slug, model]));

  return route.waypoints.flatMap((waypoint) => {
    if ("slug" in waypoint) {
      const model = modelBySlug.get(waypoint.slug);

      return model ? [model.mapPosition ?? FALLBACK_MAP_POSITION] : [];
    }

    return [waypoint];
  });
}

function toRouteSvgPoint(point: NormalizedMapPoint) {
  return {
    x: point.x * 1000,
    y: point.y * 1000,
  };
}

function getRoutePointDistance(
  left: ReturnType<typeof toRouteSvgPoint>,
  right: ReturnType<typeof toRouteSvgPoint>
) {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function getRouteCornerPoint(
  from: ReturnType<typeof toRouteSvgPoint>,
  corner: ReturnType<typeof toRouteSvgPoint>,
  offset: number
) {
  const distance = getRoutePointDistance(from, corner);

  if (distance === 0) {
    return corner;
  }

  const amount = offset / distance;

  return {
    x: corner.x + (from.x - corner.x) * amount,
    y: corner.y + (from.y - corner.y) * amount,
  };
}

function toRoutePath(points: NormalizedMapPoint[]) {
  if (points.length === 0) {
    return "";
  }

  const svgPoints = points.map(toRouteSvgPoint);

  if (svgPoints.length === 1) {
    return `M ${svgPoints[0].x} ${svgPoints[0].y}`;
  }

  let path = `M ${svgPoints[0].x} ${svgPoints[0].y}`;

  for (let index = 1; index < svgPoints.length - 1; index += 1) {
    const previousPoint = svgPoints[index - 1];
    const currentPoint = svgPoints[index];
    const nextPoint = svgPoints[index + 1];
    const previousDistance = getRoutePointDistance(previousPoint, currentPoint);
    const nextDistance = getRoutePointDistance(currentPoint, nextPoint);
    const cornerOffset = Math.min(26, previousDistance * 0.32, nextDistance * 0.32);
    const curveStart = getRouteCornerPoint(
      previousPoint,
      currentPoint,
      cornerOffset
    );
    const curveEnd = getRouteCornerPoint(nextPoint, currentPoint, cornerOffset);

    path += ` L ${curveStart.x} ${curveStart.y}`;
    path += ` Q ${currentPoint.x} ${currentPoint.y}, ${curveEnd.x} ${curveEnd.y}`;
  }

  const lastPoint = svgPoints[svgPoints.length - 1];
  path += ` L ${lastPoint.x} ${lastPoint.y}`;

  return path;
}

function getDaylightSceneStyle(progress: number) {
  const clampedProgress = clampProgress(progress);
  const { left, right, amount } = getSegment(
    DAYLIGHT_STYLE_STOPS,
    clampedProgress
  );
  const skyTop = mixRgb(left.skyTop, right.skyTop, amount);
  const skyMiddle = mixRgb(left.skyMiddle, right.skyMiddle, amount);
  const skyBottom = mixRgb(left.skyBottom, right.skyBottom, amount);
  const wash = mixRgb(left.wash, right.wash, amount);
  const sun = mixRgb(left.sun, right.sun, amount);
  const ground = mixRgb(left.ground, right.ground, amount);
  const sunX = mixNumber(14, 86, clampedProgress);
  const sunY = 68 - Math.sin(clampedProgress * Math.PI) * 47;
  const label =
    clampedProgress < 0.33
      ? "日出"
      : clampedProgress < 0.67
        ? "正午"
        : "日落";

  return {
    label,
    background: `linear-gradient(180deg, ${toRgb(skyTop)} 0%, ${toRgb(
      skyMiddle
    )} 48%, ${toRgb(skyBottom)} 100%)`,
    wash: `radial-gradient(circle at ${sunX}% ${sunY}%, ${toRgb(
      sun,
      0.74
    )} 0%, ${toRgb(sun, 0.22)} 18%, transparent 42%), linear-gradient(115deg, ${toRgb(
      wash,
      0.18
    )} 0%, transparent 48%)`,
    atmosphere: `linear-gradient(${mixNumber(
      116,
      244,
      clampedProgress
    )}deg, ${toRgb(wash, 0.16)} 0%, transparent 52%)`,
    ground: `linear-gradient(180deg, transparent 0%, transparent 61%, ${toRgb(
      ground,
      0.44
    )} 86%, ${toRgb(ground, 0.66)} 100%)`,
  };
}

function DaylightControl({
  progress,
  label,
  onProgressChange,
}: DaylightControlProps) {
  const sliderValue = Math.round(clampProgress(progress) * 1000) / 10;

  return (
    <div className="pointer-events-auto w-[min(calc(100vw-12rem),28rem)] min-w-[12rem] rounded-full border border-white/72 bg-white/84 px-4 py-2 shadow-[0_10px_24px_rgba(38,45,42,0.13)] backdrop-blur-xl sm:w-[min(calc(100vw-13.5rem),28rem)] sm:px-6 sm:py-2.5 lg:w-[min(78vw,28rem)]">
      <div className="grid grid-cols-3 text-[11px] font-medium tracking-[0.1em] text-[#202723] sm:text-[12px]">
        <span>日出</span>
        <span className="text-center">正午</span>
        <span className="text-right">日落</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={0.1}
        value={sliderValue}
        aria-label="调整日照时间"
        aria-valuetext={label}
        className="daylight-slider mt-2.5"
        onChange={(event) => {
          onProgressChange(Number(event.currentTarget.value) / 100);
        }}
      />
    </div>
  );
}

function BackgroundAudioButton({
  isEnabled,
  onToggle,
  className = "",
}: BackgroundAudioButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={isEnabled}
      aria-label={isEnabled ? "关闭背景音乐" : "开启背景音乐"}
      className={`${PAPER_BUTTON_CLASS} flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-md transition hover:border-[#4d3b2d]/20 hover:bg-[linear-gradient(180deg,_rgba(255,255,255,0.98)_0%,_rgba(250,246,240,1)_100%)] sm:h-12 sm:w-12 ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-[18px] w-[18px] text-[#5a4839] sm:h-5 sm:w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 9v6h4l5 4V5l-5 4H5z" />
        {isEnabled ? (
          <>
            <path d="M18 9.5a4 4 0 0 1 0 5" />
            <path d="M20.5 7a7.5 7.5 0 0 1 0 10" />
          </>
        ) : (
          <path d="M4 4l16 16" />
        )}
      </svg>
    </button>
  );
}

function TourProgressBadge({
  progress,
  className = "",
}: TourProgressBadgeProps) {
  const completionRatio =
    progress.totalCount > 0 ? progress.visitedCount / progress.totalCount : 0;
  const completionPercent = Math.min(Math.max(completionRatio * 100, 0), 100);

  return (
    <span
      className={`inline-flex min-w-[7.75rem] items-center gap-2 rounded-full border border-[#4d3b2d]/10 bg-[rgba(255,255,255,0.88)] px-2.5 py-1 text-[#5c4a3a] shadow-[inset_0_1px_0_rgba(255,255,255,0.84)] ${className}`}
      aria-label={`已游览 ${progress.visitedCount}/${progress.totalCount}`}
    >
      <span className="shrink-0 text-[10px] leading-none tracking-[0.14em]">
        已游览
      </span>
      <span className="shrink-0 text-[11px] font-semibold leading-none tracking-[0.08em] text-[#2f2118]">
        {progress.visitedCount}/{progress.totalCount}
      </span>
      <span className="h-1.5 min-w-8 flex-1 overflow-hidden rounded-full bg-[#d8c6ae]/62">
        <span
          className="block h-full rounded-full bg-[linear-gradient(90deg,_#8f5a3d_0%,_#c28a4b_100%)] transition-[width] duration-500"
          style={{ width: `${completionPercent}%` }}
        />
      </span>
    </span>
  );
}

function HeatLegendPill() {
  return (
    <div
      className={`${PAPER_BUTTON_CLASS} pointer-events-none flex h-11 w-[min(13.75rem,calc(100vw-2rem))] items-center gap-3 rounded-full px-3.5 backdrop-blur-md sm:h-12 sm:w-[15rem] sm:px-4`}
      aria-label="人气颜色说明"
    >
      <span className="shrink-0 text-[11px] font-semibold tracking-[0.14em] text-[#3e332a]">
        人气
      </span>
      <div className="min-w-0 flex-1">
        <div className="h-2 rounded-full bg-[linear-gradient(90deg,_#44a563_0%,_#e5b82d_42%,_#e86f2a_70%,_#d62d2a_100%)] shadow-[inset_0_1px_2px_rgba(30,24,18,0.16)]" />
        <div className="mt-1 flex justify-between text-[9px] font-semibold leading-none tracking-[0.08em] text-[#5a4839] sm:text-[10px]">
          <span>清静</span>
          <span>适中</span>
          <span>热门</span>
          <span>拥挤</span>
        </div>
      </div>
    </div>
  );
}

function BuildingGalleryPanel({
  model,
  pictures,
  currentIndex,
  isOpen,
  onOpen,
  onClose,
  onExpand,
  onPrevious,
  onNext,
  onSelect,
}: BuildingGalleryPanelProps) {
  const pictureCount = pictures.length;
  const activePicture = pictures[currentIndex] ?? pictures[0];
  const displayIndex = Math.min(currentIndex + 1, pictureCount);

  if (!activePicture) {
    return null;
  }

  return (
    <div className="absolute right-4 top-[10.5rem] z-10 w-[min(19rem,calc(100vw-2rem))] sm:right-6 sm:top-[5.5rem] sm:w-[22.5rem] lg:w-[26rem]">
      {isOpen ? (
        <div className="relative w-full">
          <button
            type="button"
            onClick={onClose}
            aria-label="收起园影相册"
            className={`${PAPER_BUTTON_CLASS} absolute right-3 -top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-md transition hover:border-[#4d3b2d]/20 hover:bg-[linear-gradient(180deg,_rgba(255,255,255,0.98)_0%,_rgba(250,246,240,1)_100%)] sm:left-auto sm:right-full sm:top-3 sm:mr-3`}
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-[18px] w-[18px] text-[#5a4839]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>

          <aside
            className={`${PAPER_PANEL_CLASS} relative w-full overflow-hidden rounded-[1.5rem] px-4 py-4 backdrop-blur-xl sm:px-5 sm:py-5`}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,_rgba(255,255,255,0.7)_0%,_transparent_34%),linear-gradient(180deg,_rgba(134,108,76,0.03)_0%,_rgba(255,255,255,0)_100%)]" />
            <div className="relative flex items-center justify-between gap-3">
              <h3
                className={`${mapLabelFont.className} shrink-0 text-[1.52rem] leading-none tracking-[0.03em] text-[#2f2118]`}
              >
                园影相册
              </h3>
              <span className="shrink-0 rounded-full border border-[#4d3b2d]/10 bg-[rgba(255,255,255,0.68)] px-2.5 py-1 text-[11px] font-medium leading-none tracking-[0.12em] text-[#6b5645]">
                {String(displayIndex).padStart(2, "0")} /{" "}
                {String(pictureCount).padStart(2, "0")}
              </span>
            </div>

            <button
              type="button"
              onClick={onExpand}
              aria-label={`大屏查看 ${model.label} 相册第${displayIndex}张`}
              className="relative mt-4 block h-[12rem] w-full overflow-hidden rounded-[1.1rem] border border-[#6b5645]/10 bg-[linear-gradient(180deg,_rgba(236,226,213,0.56)_0%,_rgba(248,244,238,0.9)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.86)] transition hover:border-[#4d3b2d]/22 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_16px_28px_rgba(72,51,32,0.12)] sm:h-[17.5rem] lg:h-[21rem]"
            >
              <Image
                key={activePicture.src}
                src={activePicture.src}
                alt={`${model.label}相册第${displayIndex}张`}
                fill
                sizes="(min-width: 1024px) 26rem, (min-width: 640px) 22.5rem, 19rem"
                className="object-contain p-2"
              />
              <span className="pointer-events-none absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full border border-[#4d3b2d]/12 bg-[rgba(255,255,255,0.88)] text-[#5a4839] shadow-[0_8px_18px_rgba(72,51,32,0.12)]">
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="h-[17px] w-[17px]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M8 4H4v4" />
                  <path d="M4 4l5.5 5.5" />
                  <path d="M16 20h4v-4" />
                  <path d="M20 20l-5.5-5.5" />
                </svg>
              </span>
            </button>

            <div className="relative mt-3 flex h-9 items-center justify-between gap-3">
              <button
                type="button"
                onClick={onPrevious}
                disabled={pictureCount <= 1}
                aria-label="查看上一张图片"
                className={`${PAPER_BUTTON_CLASS} flex h-9 w-9 shrink-0 items-center justify-center rounded-full backdrop-blur-md transition hover:border-[#4d3b2d]/20 hover:bg-[linear-gradient(180deg,_rgba(255,255,255,0.98)_0%,_rgba(250,246,240,1)_100%)] disabled:cursor-not-allowed disabled:opacity-45`}
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="h-4 w-4 text-[#5a4839]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>

              <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 overflow-hidden">
                {pictures.map((picture, index) => (
                  <button
                    key={picture.src}
                    type="button"
                    onClick={() => onSelect(index)}
                    aria-label={`查看第 ${index + 1} 张图片`}
                    className={`h-2.5 w-2.5 shrink-0 rounded-full border transition ${
                      index === currentIndex
                        ? "border-[#5a4839] bg-[#5a4839]"
                        : "border-[#8c7156]/34 bg-white/72 hover:border-[#5a4839]/62"
                    }`}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={onNext}
                disabled={pictureCount <= 1}
                aria-label="查看下一张图片"
                className={`${PAPER_BUTTON_CLASS} flex h-9 w-9 shrink-0 items-center justify-center rounded-full backdrop-blur-md transition hover:border-[#4d3b2d]/20 hover:bg-[linear-gradient(180deg,_rgba(255,255,255,0.98)_0%,_rgba(250,246,240,1)_100%)] disabled:cursor-not-allowed disabled:opacity-45`}
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="h-4 w-4 text-[#5a4839]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            </div>
          </aside>
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          aria-label="展开园影相册"
          className={`${PAPER_BUTTON_CLASS} ml-auto flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-md transition hover:border-[#4d3b2d]/20 hover:bg-[linear-gradient(180deg,_rgba(255,255,255,0.98)_0%,_rgba(250,246,240,1)_100%)]`}
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="h-[18px] w-[18px] text-[#5a4839]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
      )}
    </div>
  );
}

function BuildingGalleryLightbox({
  model,
  pictures,
  currentIndex,
  isOpen,
  rotation,
  scale,
  pan,
  onClose,
  onPrevious,
  onNext,
  onRotateLeft,
  onRotateRight,
  onZoomIn,
  onZoomOut,
  onPanChange,
  onSelect,
}: BuildingGalleryLightboxProps) {
  const pictureCount = pictures.length;
  const activePicture = pictures[currentIndex] ?? pictures[0];
  const displayIndex = Math.min(currentIndex + 1, pictureCount);
  const zoomPercent = Math.round(scale * 100);

  if (!isOpen || !activePicture) {
    return null;
  }

  const handleDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (scale <= 1) {
      return;
    }

    const originPan = pan;
    const originX = event.clientX;
    const originY = event.clientY;
    const target = event.currentTarget;

    target.setPointerCapture(event.pointerId);

    const handleDragMove = (moveEvent: PointerEvent) => {
      onPanChange({
        x: originPan.x + moveEvent.clientX - originX,
        y: originPan.y + moveEvent.clientY - originY,
      });
    };

    const handleDragEnd = () => {
      target.removeEventListener("pointermove", handleDragMove);
      target.removeEventListener("pointerup", handleDragEnd);
      target.removeEventListener("pointercancel", handleDragEnd);
    };

    target.addEventListener("pointermove", handleDragMove);
    target.addEventListener("pointerup", handleDragEnd);
    target.addEventListener("pointercancel", handleDragEnd);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[rgba(18,14,10,0.84)] px-4 py-4 backdrop-blur-xl sm:px-6 sm:py-6"
      role="dialog"
      aria-modal="true"
      aria-label={`${model.label}园影相册大屏预览`}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭大屏相册"
        className={`${JADE_BUTTON_CLASS} absolute right-4 top-4 z-10 flex h-11 w-11 sm:right-6 sm:top-6`}
      >
        <span className="pointer-events-none absolute inset-[6px] rounded-full border border-[#8c7156]/14" />
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="relative h-[18px] w-[18px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 6l12 12" />
          <path d="M18 6 6 18" />
        </svg>
      </button>

      <div className="mx-auto flex h-full max-w-[92rem] flex-col gap-4">
        <div className="flex min-h-0 flex-1 items-center gap-3 pt-12 sm:gap-4 sm:pt-14">
          <button
            type="button"
            onClick={onPrevious}
            disabled={pictureCount <= 1}
            aria-label="查看上一张图片"
            className={`${JADE_BUTTON_CLASS} relative flex h-11 w-11 sm:h-12 sm:w-12`}
          >
            <span className="pointer-events-none absolute inset-[6px] rounded-full border border-[#8c7156]/14" />
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="relative h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          <div
            className={`relative min-h-0 flex-1 self-stretch overflow-hidden rounded-[1.35rem] border border-white/18 bg-[rgba(250,246,240,0.08)] shadow-[0_24px_72px_rgba(0,0,0,0.28)] ${
              scale > 1 ? "cursor-grab active:cursor-grabbing" : ""
            }`}
            onPointerDown={handleDragStart}
          >
            <div
              className="absolute inset-0 transition-transform duration-300 ease-[cubic-bezier(0.16,0.84,0.22,1)]"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scale(${scale})`,
              }}
            >
              <Image
                key={activePicture.src}
                src={activePicture.src}
                alt={`${model.label}相册第${displayIndex}张大屏预览`}
                fill
                sizes="100vw"
                draggable={false}
                className="select-none object-contain p-2 sm:p-4"
                priority
              />
            </div>
          </div>

          <button
            type="button"
            onClick={onNext}
            disabled={pictureCount <= 1}
            aria-label="查看下一张图片"
            className={`${JADE_BUTTON_CLASS} relative flex h-11 w-11 sm:h-12 sm:w-12`}
          >
            <span className="pointer-events-none absolute inset-[6px] rounded-full border border-[#8c7156]/14" />
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="relative h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>

        <div className="mx-auto flex h-11 max-w-[min(94vw,56rem)] items-center justify-center rounded-full border border-white/18 bg-[rgba(255,255,255,0.84)] px-2 py-1.5 backdrop-blur-md sm:h-12">
          <button
            type="button"
            onClick={onRotateLeft}
            aria-label="逆时针旋转图片"
            className={`${JADE_BUTTON_CLASS} relative flex h-8 w-8 sm:h-9 sm:w-9`}
          >
            <span className="pointer-events-none absolute inset-[5px] rounded-full border border-[#8c7156]/14" />
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="relative h-[17px] w-[17px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M8 4 4 8l4 4" />
              <path d="M5 8h8a6 6 0 1 1-4.24 10.24" />
            </svg>
          </button>

          <button
            type="button"
            onClick={onZoomOut}
            aria-label="缩小图片"
            className={`${JADE_BUTTON_CLASS} relative flex h-8 w-8 sm:h-9 sm:w-9`}
          >
            <span className="pointer-events-none absolute inset-[5px] rounded-full border border-[#8c7156]/14" />
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="relative h-[17px] w-[17px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 12h12" />
            </svg>
          </button>

          <div className="flex min-w-0 flex-1 items-center justify-center gap-2 px-2 sm:px-3">
            <span className="shrink-0 text-[11px] font-medium tracking-[0.14em] text-[#5a4839]">
              {String(displayIndex).padStart(2, "0")} /{" "}
              {String(pictureCount).padStart(2, "0")}
            </span>
            <span className="hidden shrink-0 text-[10px] font-medium tracking-[0.12em] text-[#8c7156] sm:inline">
              {zoomPercent}%
            </span>
            <div className="flex min-w-0 flex-wrap justify-center gap-1.5 sm:gap-2">
              {pictures.map((picture, index) => (
                <button
                  key={picture.src}
                  type="button"
                  onClick={() => onSelect(index)}
                  aria-label={`大屏查看第 ${index + 1} 张图片`}
                  className={`h-2.5 w-2.5 shrink-0 rounded-full border transition ${
                    index === currentIndex
                      ? "border-[#5a4839] bg-[#5a4839]"
                      : "border-[#8c7156]/34 bg-white/72 hover:border-[#5a4839]/62"
                  }`}
                />
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={onZoomIn}
            aria-label="放大图片"
            className={`${JADE_BUTTON_CLASS} relative flex h-8 w-8 sm:h-9 sm:w-9`}
          >
            <span className="pointer-events-none absolute inset-[5px] rounded-full border border-[#8c7156]/14" />
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="relative h-[17px] w-[17px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 6v12" />
              <path d="M6 12h12" />
            </svg>
          </button>

          <button
            type="button"
            onClick={onRotateRight}
            aria-label="顺时针旋转图片"
            className={`${JADE_BUTTON_CLASS} relative flex h-8 w-8 sm:h-9 sm:w-9`}
          >
            <span className="pointer-events-none absolute inset-[5px] rounded-full border border-[#8c7156]/14" />
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="relative h-[17px] w-[17px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m16 4 4 4-4 4" />
              <path d="M19 8h-8a6 6 0 1 0 4.24 10.24" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function toModelRoutePath(slug: string | null) {
  return slug ? `${MODEL_ROUTE_PREFIX}/${encodeURIComponent(slug)}` : "/";
}

function getSlugFromRoutePath(pathname: string, models: SiteModelSummary[]) {
  if (pathname === "/") {
    return null;
  }

  const prefix = `${MODEL_ROUTE_PREFIX}/`;

  if (!pathname.startsWith(prefix)) {
    return null;
  }

  let slug = "";

  try {
    slug = decodeURIComponent(pathname.slice(prefix.length));
  } catch {
    return null;
  }

  return models.some((model) => model.slug === slug) ? slug : null;
}

function readVisitedSiteModelSlugs(modelSlugSet: ReadonlySet<string>) {
  if (typeof window === "undefined") {
    return new Set<string>();
  }

  try {
    const rawValue = window.localStorage.getItem(
      VISITED_SITE_MODELS_STORAGE_KEY
    );

    if (!rawValue) {
      return new Set<string>();
    }

    const parsedValue = JSON.parse(rawValue) as unknown;

    if (!Array.isArray(parsedValue)) {
      return new Set<string>();
    }

    return new Set(
      parsedValue.filter(
        (value): value is string =>
          typeof value === "string" && modelSlugSet.has(value)
      )
    );
  } catch {
    return new Set<string>();
  }
}

function writeVisitedSiteModelSlugs(visitedModelSlugs: ReadonlySet<string>) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      VISITED_SITE_MODELS_STORAGE_KEY,
      JSON.stringify(Array.from(visitedModelSlugs).sort())
    );
  } catch {}
}

function normalizeInterpretationText(text: string) {
  return text.replace(/\n\s*\n+/g, "\n");
}

function renderInlineMarkdownText(text: string) {
  const parts: ReactNode[] = [];
  const boldPattern = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;

  while ((match = boldPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    parts.push(
      <strong
        key={`bold-${match.index}`}
        className="font-semibold text-[#2f2118]"
      >
        {match[1]}
      </strong>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

function renderInterpretationContent(
  text: string,
  showCursor: boolean
): ReactNode[] {
  const lines = text.split("\n");

  return lines.map((line, index) => {
    const headingMatch = line.match(/^(【[^】]+】)\s*(.*)$/);
    const markdownHeadingMatch = line.match(/^\*\*([^*]+)\*\*[：:]?\s*$/);
    const isLastLine = index === lines.length - 1;
    const cursor = showCursor && isLastLine ? (
      <span className="ml-0.5 inline-block h-4 w-px animate-pulse bg-[#8c7156] align-[-2px]" />
    ) : null;

    if (line.trim() === "") {
      return (
        <div
          key={`line-${index}`}
          aria-hidden="true"
          className="h-3 sm:h-3.5"
        >
          {cursor}
        </div>
      );
    }

    if (/^-{3,}$/.test(line.trim())) {
      return (
        <div
          key={`line-${index}`}
          aria-hidden="true"
          className="my-4 h-px bg-[#8c7156]/18"
        />
      );
    }

    if (markdownHeadingMatch) {
      return (
        <p
          key={`line-${index}`}
          className={`${index === 0 ? "" : "mt-3"} text-[14px] font-semibold leading-8 text-[#2f2118] sm:text-[15px]`}
        >
          {markdownHeadingMatch[1]}
          {cursor}
        </p>
      );
    }

    return (
      <p
        key={`line-${index}`}
        className={`${index === 0 ? "" : "mt-2"} text-[14px] leading-8 text-[#5e4b3a] sm:text-[15px]`}
      >
        {headingMatch ? (
          <>
            <strong className="font-semibold text-[#2f2118]">
              {headingMatch[1]}
            </strong>
            {headingMatch[2] ? (
              <> {renderInlineMarkdownText(headingMatch[2])}</>
            ) : null}
          </>
        ) : (
          renderInlineMarkdownText(line)
        )}
        {cursor}
      </p>
    );
  });
}

function disposeObject(object: Object3D) {
  object.traverse((child: Object3D) => {
    if (!("isMesh" in child) || !child.isMesh) {
      return;
    }

    const mesh = child as Mesh;
    mesh.geometry.dispose();

    if (Array.isArray(mesh.material)) {
      mesh.material.forEach(disposeMaterial);
      return;
    }

    if (mesh.material) {
      disposeMaterial(mesh.material);
    }
  });
}

function InkWashOverlay({
  phase,
  label,
  isMapFontReady,
}: InkWashOverlayProps) {
  const isHidden = phase === "hidden";
  const isRevealing = phase === "revealing";
  const isCovering = phase === "covering";

  return (
    <div
      className={`absolute inset-0 z-[80] overflow-hidden transition-[opacity,transform,filter] duration-[1160ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
        isHidden
          ? "pointer-events-none opacity-0 scale-[1.035] blur-[2px]"
          : isRevealing
            ? "pointer-events-auto opacity-0 scale-[1.015] blur-[1px]"
            : "pointer-events-auto opacity-100 scale-100 blur-0"
      }`}
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-[linear-gradient(180deg,_rgba(249,245,237,0.98)_0%,_rgba(241,233,220,0.98)_55%,_rgba(232,220,203,0.98)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,_rgba(255,255,255,0.55)_0%,_transparent_30%),radial-gradient(circle_at_76%_20%,_rgba(255,248,236,0.34)_0%,_transparent_24%),radial-gradient(circle_at_50%_82%,_rgba(148,116,85,0.12)_0%,_transparent_26%)]" />
      <div
        className={`absolute -left-[16%] top-[2%] h-[56%] w-[52%] rounded-full bg-[radial-gradient(circle,_rgba(37,26,18,0.82)_0%,_rgba(67,47,31,0.54)_34%,_rgba(98,72,48,0.18)_58%,_transparent_76%)] blur-[52px] transition-[opacity,transform,filter] duration-[1320ms] ease-out ${
          isHidden
            ? "scale-[0.84] opacity-0"
            : isRevealing
              ? "translate-x-[-4%] scale-[1.34] opacity-0"
              : isCovering
                ? "scale-100 opacity-100"
                : "scale-100 opacity-100"
        }`}
      />
      <div
        className={`absolute right-[-10%] top-[12%] h-[40%] w-[36%] rounded-full bg-[radial-gradient(circle,_rgba(43,30,20,0.66)_0%,_rgba(84,61,41,0.34)_42%,_rgba(124,97,72,0.1)_64%,_transparent_80%)] blur-[44px] transition-[opacity,transform] duration-[1180ms] ease-out ${
          isHidden
            ? "translate-y-[-4%] scale-[0.88] opacity-0"
            : isRevealing
              ? "translate-y-[-5%] scale-[1.28] opacity-0"
              : "scale-100 opacity-100"
        }`}
      />
      <div
        className={`absolute left-[18%] top-[48%] h-[34%] w-[28%] rounded-full bg-[radial-gradient(circle,_rgba(31,22,15,0.58)_0%,_rgba(70,52,35,0.28)_42%,_rgba(120,94,68,0.08)_68%,_transparent_80%)] blur-[34px] transition-[opacity,transform] duration-[1200ms] ease-out ${
          isHidden
            ? "translate-y-[3%] scale-[0.9] opacity-0"
            : isRevealing
              ? "translate-y-[8%] scale-[1.3] opacity-0"
              : "scale-100 opacity-100"
        }`}
      />
      <div
        className={`absolute right-[8%] bottom-[-6%] h-[42%] w-[48%] rounded-full bg-[radial-gradient(circle,_rgba(54,39,27,0.42)_0%,_rgba(96,73,51,0.2)_44%,_rgba(138,108,78,0.06)_66%,_transparent_82%)] blur-[48px] transition-[opacity,transform] duration-[1320ms] ease-out ${
          isHidden
            ? "translate-x-[4%] scale-[0.88] opacity-0"
            : isRevealing
              ? "translate-x-[6%] scale-[1.22] opacity-0"
              : "scale-100 opacity-100"
        }`}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_34%_28%,_rgba(255,255,255,0.24)_0%,_transparent_18%),radial-gradient(circle_at_66%_58%,_rgba(255,255,255,0.12)_0%,_transparent_22%)] mix-blend-screen" />
      <div
        className={`absolute left-1/2 top-1/2 flex w-[min(94vw,46rem)] -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center transition-opacity duration-[720ms] ease-out ${
          isHidden || isRevealing ? "opacity-0" : "opacity-100"
        }`}
      >
        <h2
          className={`${mapLabelFont.className} whitespace-nowrap leading-none text-[#1e140f] transition-opacity duration-300 ${
            isMapFontReady
              ? "opacity-100 text-[clamp(1.7rem,4.8vw,4rem)] tracking-[0.04em]"
              : "opacity-0 text-[clamp(1.7rem,4.8vw,4rem)] tracking-[0.04em]"
          }`}
          style={MAP_LABEL_TEXT_STYLE}
        >
          {label}
        </h2>
        <p className="mt-4 text-[11px] tracking-[0.38em] text-[#735844]/58 sm:text-xs">
          载入中
        </p>
        <div className="mt-4 flex items-center gap-2.5">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="h-2 w-2 rounded-full bg-[#2b1c14]/44 blur-[0.4px] animate-pulse"
              style={{ animationDelay: `${index * 220}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function MapBuildingLift({
  model,
  models,
  heatOverlay = false,
}: {
  model: SiteModelSummary;
  models: SiteModelSummary[];
  heatOverlay?: boolean;
}) {
  const mapPosition = model.mapPosition ?? FALLBACK_MAP_POSITION;
  const mapSize = model.mapSize;
  const safeWidth = Math.max(
    mapSize.width * (heatOverlay ? 2.08 : 1.68),
    mapSize.width + (heatOverlay ? 0.058 : 0.04),
    heatOverlay ? 0.13 : 0.108
  );
  const safeHeight = Math.max(
    mapSize.height * (heatOverlay ? 2.14 : 1.72),
    mapSize.height + (heatOverlay ? 0.052 : 0.036),
    heatOverlay ? 0.112 : 0.092
  );
  const cropLeft = mapPosition.x - safeWidth / 2;
  const cropTop = mapPosition.y - safeHeight / 2;
  const cropWidthPercent = 100 / safeWidth;
  const cropHeightPercent = 100 / safeHeight;
  const cropLeftPercent = -(cropLeft / safeWidth) * 100;
  const cropTopPercent = -(cropTop / safeHeight) * 100;
  const surfaceMask = heatOverlay
    ? "radial-gradient(ellipse at center, rgba(0,0,0,0.98) 0%, rgba(0,0,0,0.92) 24%, rgba(0,0,0,0.58) 48%, rgba(0,0,0,0.18) 68%, transparent 90%)"
    : "radial-gradient(ellipse at center, rgba(0,0,0,1) 20%, rgba(0,0,0,0.78) 45%, rgba(0,0,0,0.28) 72%, transparent 100%)";

  return (
    <>
      <div
        className="pointer-events-none absolute z-[6] -translate-x-1/2 -translate-y-1/2"
        style={{
          left: `${mapPosition.x * 100}%`,
          top: `${mapPosition.y * 100}%`,
          width: `${safeWidth * 100}%`,
          height: `${safeHeight * 100}%`,
        }}
        aria-hidden="true"
      >
        {!heatOverlay ? (
          <div
            className="map-building-lift-glow absolute inset-[-26%] rounded-full bg-[radial-gradient(circle,_rgba(255,247,236,0.9)_0%,_rgba(255,247,236,0.46)_42%,_rgba(255,247,236,0)_82%)] blur-2xl"
          />
        ) : null}
        <div
          className={`map-building-lift-surface absolute inset-0 isolate overflow-hidden ${
            heatOverlay
              ? "map-building-lift-surface--heat"
              : "drop-shadow-[0_14px_22px_rgba(58,36,18,0.26)]"
          }`}
          style={{
            WebkitMaskImage: surfaceMask,
            maskImage: surfaceMask,
          }}
        >
          <div
            className={`absolute bg-no-repeat ${
              heatOverlay
                ? "brightness-[0.92] saturate-[0.62] contrast-[0.94]"
                : ""
            }`}
            style={{
              left: `${cropLeftPercent}%`,
              top: `${cropTopPercent}%`,
              width: `${cropWidthPercent}%`,
              height: `${cropHeightPercent}%`,
              backgroundImage: "url('/api/layout-image')",
              backgroundSize: "100% 100%",
            }}
          />
          {heatOverlay ? (
            <MapHeatLayerCrop
              models={models}
              highlightedSlug={model.slug}
              cropLeft={cropLeft}
              cropTop={cropTop}
              cropWidth={safeWidth}
              cropHeight={safeHeight}
            />
          ) : null}
        </div>
      </div>

      <style jsx>{`
        .map-building-lift-glow {
          animation: map-building-lift-glow 980ms
            cubic-bezier(0.18, 0.84, 0.22, 1) both;
          will-change: opacity, transform;
        }

        .map-building-lift-surface {
          animation: map-building-lift-surface 920ms
            cubic-bezier(0.16, 0.82, 0.24, 1) both;
          will-change: opacity, transform;
        }

        .map-building-lift-surface--heat {
          animation-name: map-building-lift-surface-heat;
        }

        @keyframes map-building-lift-glow {
          0% {
            opacity: 0;
            transform: scale(0.84);
          }

          100% {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes map-building-lift-surface {
          0% {
            opacity: 0;
            transform: translateY(-3%) scale(1.02);
          }

          100% {
            opacity: 1;
            transform: translateY(-12%) scale(1.1);
          }
        }

        @keyframes map-building-lift-surface-heat {
          0% {
            opacity: 0;
            transform: translateY(-2%) scale(1.01);
          }

          100% {
            opacity: 1;
            transform: translateY(-6%) scale(1.045);
          }
        }
      `}</style>
    </>
  );
}

function MapVisitedFootprintLayer({
  models,
  visitedModelSlugs,
}: {
  models: SiteModelSummary[];
  visitedModelSlugs: ReadonlySet<string>;
}) {
  const visitedModels = models.filter((model) =>
    visitedModelSlugs.has(model.slug)
  );

  if (visitedModels.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-[7]">
      {visitedModels.map((model) => {
        const mapPosition = model.mapPosition ?? FALLBACK_MAP_POSITION;
        const washWidth = Math.max(model.mapSize.width * 176, 7.4);
        const washHeight = Math.max(
          model.mapSize.height * LOCATION_IMAGE_RATIO * 176,
          5.8
        );

        return (
          <div
            key={model.slug}
            className="absolute"
            style={{
              left: `${mapPosition.x * 100}%`,
              top: `${mapPosition.y * 100}%`,
              width: `${washWidth}%`,
              height: `${washHeight}%`,
              transform: "translate(-50%, -50%)",
            }}
            aria-hidden="true"
          >
            <span
              className="absolute inset-0 rounded-full bg-[rgba(248,242,231,0.58)] shadow-[0_0_26px_rgba(255,248,236,0.48)] mix-blend-screen"
            />
          </div>
        );
      })}
    </div>
  );
}

function MapHeatLayerCrop({
  models,
  highlightedSlug,
  cropLeft,
  cropTop,
  cropWidth,
  cropHeight,
}: {
  models: SiteModelSummary[];
  highlightedSlug?: string | null;
  cropLeft: number;
  cropTop: number;
  cropWidth: number;
  cropHeight: number;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,_rgba(33,31,28,0.08)_0%,_rgba(33,31,28,0.16)_100%)]" />
      {models.map((model) => {
        const heatData = SITE_MODEL_HEAT_BY_SLUG[model.slug];

        if (!heatData) {
          return null;
        }

        const mapPosition = model.mapPosition ?? FALLBACK_MAP_POSITION;
        const isHighlighted = highlightedSlug === model.slug;
        const spotWidth = (heatData.radius / cropWidth) * 100;
        const spotHeight =
          ((heatData.radius * LOCATION_IMAGE_RATIO) / cropHeight) * 100;
        const spotLeft = ((mapPosition.x - cropLeft) / cropWidth) * 100;
        const spotTop = ((mapPosition.y - cropTop) / cropHeight) * 100;
        const color = heatData.color;
        const outerColor = getHeatOuterColor(heatData);

        return (
          <div
            key={model.slug}
            className="absolute rounded-full mix-blend-multiply transition-transform duration-[720ms] ease-[cubic-bezier(0.16,0.82,0.24,1)]"
            style={{
              left: `${spotLeft}%`,
              top: `${spotTop}%`,
              width: `${spotWidth}%`,
              height: `${spotHeight}%`,
              opacity: heatData.opacity,
              filter: `blur(${Math.round(10 + heatData.value * 0.055)}px)`,
              transform: isHighlighted
                ? "translate(-50%, -50%) scale(1.12)"
                : "translate(-50%, -50%) scale(1)",
              zIndex: isHighlighted ? 2 : 1,
              background: `radial-gradient(ellipse at center, ${toRgb(
                color,
                0.92
              )} 0%, ${toRgb(color, 0.58)} 28%, ${toRgb(
                outerColor,
                0.36
              )} 52%, transparent 78%)`,
            }}
            aria-hidden="true"
          />
        );
      })}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(255,255,255,0)_0%,_rgba(255,255,255,0.08)_68%,_rgba(255,255,255,0.18)_100%)] mix-blend-screen" />
    </div>
  );
}

function MapHeatLayer({
  models,
  highlightedSlug,
}: {
  models: SiteModelSummary[];
  highlightedSlug?: string | null;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[4] overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,_rgba(33,31,28,0.08)_0%,_rgba(33,31,28,0.16)_100%)]" />
      {models.map((model) => {
        const heatData = SITE_MODEL_HEAT_BY_SLUG[model.slug];

        if (!heatData) {
          return null;
        }

        const mapPosition = model.mapPosition ?? FALLBACK_MAP_POSITION;
        const isHighlighted = highlightedSlug === model.slug;
        const spotWidth = heatData.radius * 100;
        const spotHeight = heatData.radius * LOCATION_IMAGE_RATIO * 100;
        const color = heatData.color;
        const outerColor = getHeatOuterColor(heatData);

        return (
          <div
            key={model.slug}
            className="absolute rounded-full mix-blend-multiply transition-transform duration-[720ms] ease-[cubic-bezier(0.16,0.82,0.24,1)]"
          style={{
              left: `${mapPosition.x * 100}%`,
              top: `${mapPosition.y * 100}%`,
              width: `${spotWidth}%`,
              height: `${spotHeight}%`,
              opacity: heatData.opacity,
              filter: `blur(${Math.round(10 + heatData.value * 0.055)}px)`,
              transform: isHighlighted
                ? "translate(-50%, -50%) scale(1.12)"
                : "translate(-50%, -50%) scale(1)",
              zIndex: isHighlighted ? 2 : 1,
              background: `radial-gradient(ellipse at center, ${toRgb(
                color,
                0.92
              )} 0%, ${toRgb(color, 0.58)} 28%, ${toRgb(
                outerColor,
                0.36
              )} 52%, transparent 78%)`,
          }}
            aria-hidden="true"
          />
        );
      })}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(255,255,255,0)_0%,_rgba(255,255,255,0.08)_68%,_rgba(255,255,255,0.18)_100%)] mix-blend-screen" />
    </div>
  );
}

function MapThemeRouteLayer({
  models,
  route,
}: {
  models: SiteModelSummary[];
  route: ThemeRoute;
}) {
  const routePoints = resolveThemeRoutePoints(route, models);
  const routeStops = resolveThemeRouteStops(route, models);
  const routePath = toRoutePath(routePoints);
  const routeColor = toRgb(route.accent, 0.88);
  const routeGlowColor = toRgb(route.accent, 0.2);
  const routeFlowColor = toRgb(route.accent, 0.42);
  const routeFilterId = `theme-route-shadow-${route.id}`;

  if (!routePath) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-[5]">
      <svg
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        className="h-full w-full overflow-visible"
        aria-hidden="true"
      >
        <defs>
          <filter
            id={routeFilterId}
            x="-8%"
            y="-8%"
            width="116%"
            height="116%"
          >
            <feDropShadow
              dx="0"
              dy="2"
              stdDeviation="2.2"
              floodColor="#3a2a1d"
              floodOpacity="0.24"
            />
          </filter>
        </defs>

        <path
          d={routePath}
          fill="none"
          stroke="rgba(250,243,225,0.74)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={12}
          vectorEffect="non-scaling-stroke"
          filter={`url(#${routeFilterId})`}
        />
        <path
          className="theme-route-line"
          d={routePath}
          fill="none"
          stroke={routeColor}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={5.5}
          vectorEffect="non-scaling-stroke"
        />
        <path
          className="theme-route-flow"
          d={routePath}
          fill="none"
          pathLength={1}
          stroke={routeFlowColor}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.6}
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {routeStops.map((stop, index) => {
        const mapPosition = stop.mapPosition ?? FALLBACK_MAP_POSITION;

        return (
          <span
            key={`${route.id}-${stop.slug}`}
            className="absolute flex h-6 w-6 items-center justify-center rounded-full border border-white/80 bg-[rgba(255,252,245,0.92)] text-[11px] font-semibold leading-none shadow-[0_8px_18px_rgba(48,34,23,0.2)]"
            style={{
              left: `${mapPosition.x * 100}%`,
              top: `${mapPosition.y * 100}%`,
              color: routeColor,
              boxShadow: `0 0 0 4px ${routeGlowColor}, 0 8px 18px rgba(48,34,23,0.2)`,
              transform: "translate(-50%, calc(-50% + 33px))",
            }}
            aria-hidden="true"
          >
            {index + 1}
          </span>
        );
      })}

      <style jsx>{`
        .theme-route-line {
          opacity: 1;
        }

        .theme-route-flow {
          opacity: 0;
          stroke-dasharray: 0.085 0.18;
          animation:
            theme-route-flow 3600ms linear infinite,
            theme-route-flow-in 360ms ease-out 180ms forwards;
        }

        @keyframes theme-route-flow {
          from {
            stroke-dashoffset: 0.265;
          }

          to {
            stroke-dashoffset: 0;
          }
        }

        @keyframes theme-route-flow-in {
          to {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

function OverviewMapFrame({
  highlightedModel,
  mapMode,
  models,
  activeThemeRoute,
  visitedModelSlugs,
  children,
}: OverviewMapFrameProps) {
  const isHeatMode = mapMode === "heat";

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#ece2d5]">
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: `max(100vw, calc(100vh * ${LOCATION_IMAGE_RATIO}))`,
          height: `max(100vh, calc(100vw / ${LOCATION_IMAGE_RATIO}))`,
          transform: "translate(-50%, -50%)",
        }}
      >
        <div className="relative h-full w-full">
          <Image
            src="/api/layout-image"
            alt="园林建筑位置总览"
            fill
            priority
            unoptimized
            draggable={false}
            onDragStart={(event) => event.preventDefault()}
            sizes="100vw"
            className={`select-none object-cover transition-[filter,opacity] duration-500 ${
              isHeatMode ? "brightness-[0.92] saturate-[0.62] contrast-[0.94]" : ""
            }`}
          />

          {isHeatMode ? (
            <MapHeatLayer
              models={models}
              highlightedSlug={highlightedModel?.slug}
            />
          ) : null}
          {activeThemeRoute ? (
            <MapThemeRouteLayer models={models} route={activeThemeRoute} />
          ) : null}
          <MapVisitedFootprintLayer
            models={models}
            visitedModelSlugs={visitedModelSlugs}
          />
          {highlightedModel ? (
            <MapBuildingLift
              model={highlightedModel}
              models={models}
              heatOverlay={isHeatMode}
            />
          ) : null}
          {children ? <div className="absolute inset-0 z-10">{children}</div> : null}
        </div>
      </div>
    </div>
  );
}

function MapLabel({
  model,
  onSelect,
  onPreview,
  onPreviewClear,
  isPreviewed,
  isVisited,
  routeOrder,
}: MapLabelProps) {
  const mapPosition = model.mapPosition ?? FALLBACK_MAP_POSITION;
  const shouldPlaceStampLeft = mapPosition.x > 0.72;
  const isRouteStop = routeOrder !== undefined;

  return (
    <div
      className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
      style={{
        left: `${mapPosition.x * 100}%`,
        top: `${mapPosition.y * 100}%`,
      }}
    >
      <button
        type="button"
        onClick={() => onSelect(model.slug)}
        onPointerEnter={() => onPreview(model.slug)}
        onPointerDown={() => onPreview(model.slug)}
        onPointerLeave={onPreviewClear}
        onFocus={() => onPreview(model.slug)}
        onBlur={onPreviewClear}
        className={`group relative border-0 bg-transparent p-0 transition-transform duration-[720ms] ease-[cubic-bezier(0.16,0.84,0.22,1)] ${
          isPreviewed ? "-translate-y-2 scale-[1.025]" : ""
        }`}
        aria-label={`${isRouteStop ? `主题路线第 ${routeOrder + 1} 站，` : ""}${
          isVisited ? "已游览，" : ""
        }查看 ${model.label} 模型`}
        title={`查看 ${model.label}`}
      >
        <span
          className={`pointer-events-none absolute left-1/2 top-1/2 -z-10 h-14 w-[calc(100%+2rem)] -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl transition duration-[720ms] ease-[cubic-bezier(0.16,0.84,0.22,1)] ${
            isPreviewed
              ? "bg-[rgba(255,248,236,0.78)]"
              : "bg-white/0 group-hover:bg-[rgba(255,248,236,0.72)] group-focus-visible:bg-[rgba(255,248,236,0.72)]"
          }`}
        />
        <span
          className={`pointer-events-none absolute left-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/80 bg-white transition duration-[720ms] ease-[cubic-bezier(0.16,0.84,0.22,1)] ${
            isPreviewed
              ? "scale-125 border-[#6e3128]/80 bg-[#f3ddbd] shadow-[0_0_0_1.5px_rgba(91,43,32,0.72),0_0_18px_rgba(255,255,255,0.84)]"
              : isRouteStop
                ? "border-[#8b462d]/80 bg-[#f4dfbd] shadow-[0_0_0_1.5px_rgba(139,70,45,0.5),0_0_18px_rgba(255,255,255,0.76)] group-hover:scale-125 group-hover:shadow-[0_0_0_1.5px_rgba(91,43,32,0.72),0_0_18px_rgba(255,255,255,0.84)] group-focus-visible:scale-125 group-focus-visible:shadow-[0_0_0_1.5px_rgba(91,43,32,0.72),0_0_18px_rgba(255,255,255,0.84)]"
              : isVisited
                ? "border-[#8e3f31]/64 bg-[#f3ddbd] shadow-[0_0_0_1px_rgba(142,63,49,0.38),0_0_10px_rgba(255,255,255,0.42)] group-hover:scale-125 group-hover:shadow-[0_0_0_1.5px_rgba(91,43,32,0.72),0_0_18px_rgba(255,255,255,0.84)] group-focus-visible:scale-125 group-focus-visible:shadow-[0_0_0_1.5px_rgba(91,43,32,0.72),0_0_18px_rgba(255,255,255,0.84)]"
                : "shadow-[0_0_0_1px_rgba(0,0,0,0.78),0_0_10px_rgba(255,255,255,0.62)] group-hover:scale-125 group-hover:shadow-[0_0_0_1.5px_rgba(0,0,0,0.86),0_0_18px_rgba(255,255,255,0.84)] group-focus-visible:scale-125 group-focus-visible:shadow-[0_0_0_1.5px_rgba(0,0,0,0.86),0_0_18px_rgba(255,255,255,0.84)]"
          }`}
          style={{ top: `calc(50% + ${LABEL_DOT_OFFSET}px)` }}
        />
        <span
          className={`${mapLabelFont.className} relative block whitespace-nowrap text-[clamp(1.7rem,2vw,2.5rem)] leading-none tracking-[0.02em] transition duration-[720ms] ease-[cubic-bezier(0.16,0.84,0.22,1)] ${
            isPreviewed
              ? "scale-[1.03] text-[#3a2010]"
              : isRouteStop
                ? "text-[#5e3324] group-hover:scale-[1.03] group-hover:text-[#3a2010] group-focus-visible:scale-[1.03] group-focus-visible:text-[#3a2010]"
              : isVisited
                ? "text-[#6f5948] group-hover:scale-[1.03] group-hover:text-[#3a2010] group-focus-visible:scale-[1.03] group-focus-visible:text-[#3a2010]"
                : "text-[#18110d] group-hover:scale-[1.03] group-hover:text-[#3a2010] group-focus-visible:scale-[1.03] group-focus-visible:text-[#3a2010]"
          }`}
          style={MAP_LABEL_TEXT_STYLE}
        >
          {model.label}
        </span>
        {isVisited ? (
          <span
            className={`${mapLabelFont.className} pointer-events-none absolute top-[-0.42rem] z-20 flex h-[2.15rem] w-[2.15rem] items-center justify-center rounded-full border-2 border-[#8e3f31]/64 bg-[rgba(255,249,239,0.76)] text-[0.88rem] leading-none tracking-[0.06em] text-[#8e3f31] shadow-[0_5px_12px_rgba(58,36,20,0.14)] ${
              shouldPlaceStampLeft
                ? "right-[calc(100%+0.3rem)] rotate-[-8deg]"
                : "left-[calc(100%+0.3rem)] rotate-[8deg]"
            }`}
            aria-hidden="true"
          >
            已游
          </span>
        ) : null}
      </button>
    </div>
  );
}

function DirectoryDrawer({
  models,
  isOpen,
  onToggle,
  onClose,
  onSelect,
  onPreview = () => {},
  onPreviewClear = () => {},
  tourProgress,
  visitedModelSlugs,
}: DirectoryDrawerProps) {
  return (
    <>
      <div
        className={`absolute inset-0 z-20 bg-[rgba(250,248,244,0.16)] backdrop-blur-[6px] transition ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />

      <div className="pointer-events-none absolute right-4 top-4 z-30 flex max-h-[calc(100vh-2rem)] flex-col items-end gap-3 sm:right-6 sm:top-6 sm:max-h-[calc(100vh-3rem)]">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-label={
            tourProgress
              ? `打开建筑目录，已游览 ${tourProgress.visitedCount}/${tourProgress.totalCount}`
              : "打开建筑目录"
          }
          className={`${PAPER_PANEL_CLASS} pointer-events-auto group relative inline-flex items-center gap-2 overflow-hidden rounded-[1rem] px-3.5 py-2 backdrop-blur-md transition hover:border-[#4e3b2c]/18 hover:bg-[linear-gradient(180deg,_rgba(255,255,255,0.98)_0%,_rgba(250,246,240,1)_100%)]`}
        >
          <span className="pointer-events-none absolute inset-x-3 top-0 h-px bg-[rgba(255,255,255,0.96)]" />
          <span className="pointer-events-none absolute inset-x-4 bottom-0 h-px bg-[rgba(171,145,114,0.2)]" />
          <span
            className={`${mapLabelFont.className} relative text-[1.05rem] leading-none tracking-[0.04em] text-[#2f2118]`}
          >
            目录
          </span>
          {tourProgress ? (
            <TourProgressBadge
              progress={tourProgress}
              className="min-w-[7.2rem] py-0.5"
            />
          ) : (
            <span className="rounded-full border border-[#4d3b2d]/10 bg-[rgba(255,255,255,0.92)] px-2 py-0.5 text-[10px] leading-none tracking-[0.16em] text-[#5c4a3a]">
              {models.length}
            </span>
          )}
        </button>

        <aside
          className={`${PAPER_PANEL_CLASS} pointer-events-auto relative flex w-[min(82vw,332px)] flex-col gap-4 overflow-hidden rounded-[1.5rem] p-5 backdrop-blur-xl transition duration-200 sm:p-6 ${
            isOpen
              ? "translate-y-0 opacity-100"
              : "pointer-events-none -translate-y-2 opacity-0"
          }`}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,_rgba(255,255,255,0.72)_0%,_transparent_34%),linear-gradient(180deg,_rgba(134,108,76,0.03)_0%,_rgba(255,255,255,0)_100%)]" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="relative">
              <p className="text-xs font-medium uppercase tracking-[0.32em] text-[#7b6450]/72">
                园林图录
              </p>
              <h2
                className={`${mapLabelFont.className} mt-3 text-[1.6rem] leading-none tracking-[0.03em] text-[#2f2118]`}
              >
                循图入景
              </h2>
              {tourProgress ? (
                <TourProgressBadge
                  progress={tourProgress}
                  className="mt-3 w-[min(14rem,100%)]"
                />
              ) : null}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="relative shrink-0 whitespace-nowrap rounded-full border border-[#4d3b2d]/10 bg-[rgba(255,255,255,0.84)] px-3 py-1.5 text-xs text-[#5a4839] transition hover:border-[#4d3b2d]/20 hover:bg-[rgba(255,255,255,0.98)]"
            >
              收起
            </button>
          </div>

          <div className="relative overflow-hidden rounded-[1.1rem] border border-[#6b5645]/8 bg-[rgba(255,255,255,0.68)] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
            <div className="max-h-[calc(100vh-13rem)] overflow-y-auto pr-1 [scrollbar-gutter:stable]">
              {models.length > 0 ? (
                models.map((model, index) => {
                  const isVisited = visitedModelSlugs?.has(model.slug) ?? false;

                  return (
                    <button
                      key={model.slug}
                      type="button"
                      onClick={() => onSelect(model.slug)}
                      onPointerEnter={() => onPreview(model.slug)}
                      onPointerDown={() => onPreview(model.slug)}
                      onPointerLeave={onPreviewClear}
                      onFocus={() => onPreview(model.slug)}
                      onBlur={onPreviewClear}
                      className={`group flex w-full items-start gap-3 border-t border-[#8f7150]/8 px-4 py-3 text-left transition first:border-t-0 hover:bg-[rgba(250,245,238,0.92)] ${
                        isVisited ? "bg-[rgba(246,236,220,0.72)]" : ""
                      }`}
                    >
                      <span
                        className={`mt-1 shrink-0 text-[10px] leading-none tracking-[0.28em] ${
                          isVisited ? "text-[#8e3f31]" : "text-[#a18364]"
                        }`}
                      >
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p
                            className={`${mapLabelFont.className} text-[1.28rem] leading-none tracking-[0.03em] transition group-hover:text-[#3a2a1d] ${
                              isVisited ? "text-[#6f5948]" : "text-[#241913]"
                            }`}
                          >
                            {model.label}
                          </p>
                          <span
                            className={`mt-1 shrink-0 rounded-full px-2 py-0.5 text-[11px] leading-none ${
                              isVisited
                                ? "border border-[#8e3f31]/28 text-[#8e3f31]"
                                : "text-[#8c7156]"
                            }`}
                          >
                            {isVisited
                              ? "已游"
                              : model.hasModelFile
                                ? "入景"
                                : "待补"}
                          </span>
                        </div>
                        <p className="mt-1 text-[12px] leading-5 text-[#5e4b3a]">
                          {model.verse}
                        </p>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="px-4 py-4 text-sm leading-6 text-[#7c5131]">
                  图录中暂未配置导览点。
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function ThemeRouteSelectorPanel({
  models,
  activeRoute,
  visitedModelSlugs,
  onSelectRoute,
  onClearRoute,
  onStartRoute,
}: ThemeRouteSelectorPanelProps) {
  const activeRouteStops = resolveThemeRouteStops(activeRoute, models);
  const activeRouteVisitedCount = activeRouteStops.filter((stop) =>
    visitedModelSlugs.has(stop.slug)
  ).length;
  const firstActiveStop = activeRouteStops[0] ?? null;
  const lastActiveStop = activeRouteStops[activeRouteStops.length - 1] ?? null;

  return (
    <aside
      className={`${PAPER_PANEL_CLASS} pointer-events-auto relative w-[min(92vw,24rem)] overflow-hidden rounded-[1.25rem] p-3.5 backdrop-blur-xl sm:p-4`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,_rgba(255,255,255,0.72)_0%,_transparent_34%),linear-gradient(180deg,_rgba(134,108,76,0.03)_0%,_rgba(255,255,255,0)_100%)]" />
      <div className="relative flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.32em] text-[#7b6450]/72">
            主题游线
          </p>
          <h2
            className={`${mapLabelFont.className} mt-2 text-[1.38rem] leading-none tracking-[0.03em] text-[#2f2118]`}
          >
            跟着主题走
          </h2>
        </div>

        <button
          type="button"
          onClick={onClearRoute}
          disabled={!activeRoute}
          aria-label="取消已选主题游线"
          className={`relative shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-45 ${
            activeRoute
              ? "border-[#4d3b2d]/10 bg-[rgba(255,255,255,0.84)] text-[#5a4839] hover:border-[#4d3b2d]/20 hover:bg-[rgba(255,255,255,0.98)]"
              : "border-[#4d3b2d]/10 bg-[rgba(255,255,255,0.58)] text-[#7b6450]"
          }`}
        >
          取消选择
        </button>
      </div>

      <div className="relative mt-3 grid grid-cols-2 gap-2">
        {THEME_ROUTES.map((route) => {
          const routeStops = resolveThemeRouteStops(route, models);
          const visitedCount = routeStops.filter((stop) =>
            visitedModelSlugs.has(stop.slug)
          ).length;
          const isActive = activeRoute?.id === route.id;
          const accentColor = toRgb(route.accent, 0.9);

          return (
            <button
              key={route.id}
              type="button"
              onClick={() => onSelectRoute(route.id)}
              aria-pressed={isActive}
              className={`group min-h-[4.25rem] w-full rounded-[0.95rem] border px-3 py-2.5 text-left transition ${
                isActive
                  ? "bg-[rgba(255,250,241,0.94)]"
                  : "border-[#6b5645]/8 bg-[rgba(255,255,255,0.62)] hover:border-[#8a6a4d]/18 hover:bg-[rgba(255,250,244,0.9)]"
              }`}
              style={
                isActive
                  ? {
                      borderColor: toRgb(route.accent, 0.32),
                      boxShadow: `0 10px 22px ${toRgb(route.accent, 0.1)}`,
                    }
                  : undefined
              }
            >
              <div className="flex min-w-0 flex-col gap-2">
                <p
                  className={`${mapLabelFont.className} truncate text-[1.18rem] leading-none tracking-[0.03em] text-[#2f2118]`}
                >
                  {route.label}
                </p>
                <span
                  className="w-fit rounded-full border bg-white/76 px-2 py-1 text-[11px] leading-none"
                  style={{
                    borderColor: toRgb(route.accent, isActive ? 0.32 : 0.16),
                    color: accentColor,
                  }}
                >
                  {visitedCount}/{routeStops.length}站
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {activeRoute ? (
        <div className="relative mt-3 flex items-center justify-between gap-3 rounded-[0.95rem] border border-[#6b5645]/8 bg-[rgba(255,255,255,0.56)] px-3 py-2.5">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <p
                className={`${mapLabelFont.className} truncate text-[1.08rem] leading-none tracking-[0.03em] text-[#2f2118]`}
              >
                {activeRoute.label}
              </p>
              <span className="rounded-full border border-[#7a5f42]/12 bg-[rgba(255,255,255,0.72)] px-2 py-0.5 text-[11px] leading-none text-[#7b5138]">
                {activeRouteVisitedCount}/{activeRouteStops.length}站
              </span>
            </div>
            <p className="mt-1.5 truncate text-[12px] leading-5 text-[#5e4b3a]">
              {firstActiveStop && lastActiveStop ? (
                <>
                  {firstActiveStop.label}
                  <span className="px-1 text-[#9a8064]">→</span>
                  {lastActiveStop.label}
                </>
              ) : (
                activeRoute.summary
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onStartRoute}
            disabled={activeRouteStops.length === 0}
            className={`${PAPER_BUTTON_CLASS} inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-[12px] font-medium tracking-[0.1em] backdrop-blur-md transition hover:border-[#4d3b2d]/20 hover:bg-[linear-gradient(180deg,_rgba(255,255,255,0.98)_0%,_rgba(250,246,240,1)_100%)] disabled:cursor-not-allowed disabled:opacity-45`}
          >
            {firstActiveStop ? (
              <>
                <span
                  className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                  style={{ backgroundColor: toRgb(activeRoute.accent, 0.9) }}
                >
                  1
                </span>
                开始
              </>
            ) : (
              "开始"
            )}
          </button>
        </div>
      ) : (
        <p className="relative mt-3 rounded-full border border-[#6b5645]/8 bg-[rgba(255,255,255,0.48)] px-3 py-2 text-[12px] leading-none text-[#6b5744]">
          选择主题后，地图会显示线路和站序。
        </p>
      )}
    </aside>
  );
}

function OverviewStage({
  models,
  onSelect,
  activeThemeRoute,
  onThemeRouteChange,
  isBackgroundAudioEnabled,
  onBackgroundAudioToggle,
  tourProgress,
  visitedModelSlugs,
}: OverviewStageProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isRouteSelectorOpen, setIsRouteSelectorOpen] = useState(false);
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);
  const [mapMode, setMapMode] = useState<MapMode>("normal");
  const routeControlsRef = useRef<HTMLDivElement | null>(null);
  const [introPanelPhase, setIntroPanelPhase] =
    useState<OverviewIntroPanelPhase>(() =>
      hasOverviewIntroPanelBeenShown ? "hidden" : "visible"
    );
  const isIntroPanelVisible = introPanelPhase !== "hidden";
  const isIntroPanelLeaving = introPanelPhase === "leaving";
  const isIntroPanelFullyVisible = introPanelPhase === "visible";
  const isHeatMode = mapMode === "heat";

  useEffect(() => {
    if (introPanelPhase !== "visible") {
      return;
    }

    hasOverviewIntroPanelBeenShown = true;

    const leaveTimer = window.setTimeout(() => {
      setIntroPanelPhase("leaving");
    }, OVERVIEW_INTRO_PANEL_HOLD_MS);
    const hideTimer = window.setTimeout(() => {
      setIntroPanelPhase("hidden");
    }, OVERVIEW_INTRO_PANEL_HOLD_MS + OVERVIEW_INTRO_PANEL_SLIDE_MS);

    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(hideTimer);
    };
  }, [introPanelPhase]);

  useEffect(() => {
    if (!isRouteSelectorOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const routeControls = routeControlsRef.current;

      if (!routeControls || routeControls.contains(event.target as Node)) {
        return;
      }

      setIsRouteSelectorOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsRouteSelectorOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isRouteSelectorOpen]);

  const handleSelect = (slug: string) => {
    setIsDrawerOpen(false);
    setIsRouteSelectorOpen(false);
    onSelect(slug);
  };
  const handleThemeRouteSelect = (routeId: ThemeRouteId) => {
    onThemeRouteChange(routeId);
    setMapMode("normal");
    setPreviewSlug(null);
  };
  const handleThemeRouteStart = () => {
    const firstStop = resolveThemeRouteStops(activeThemeRoute, models)[0];

    if (!firstStop) {
      return;
    }

    handleSelect(firstStop.slug);
  };
  const activeRouteStopOrder = getThemeRouteStopOrder(activeThemeRoute);
  const previewModel =
    previewSlug === null
      ? null
      : models.find((model) => model.slug === previewSlug) ?? null;
  const overviewPrompt = previewModel
    ? {
        tag: previewModel.overviewTag,
        copy: previewModel.overviewCopy,
        hint: previewModel.overviewHint,
      }
    : {
        tag: activeThemeRoute ? `【${activeThemeRoute.label}】` : "拙政园",
        copy: activeThemeRoute
          ? activeThemeRoute.summary
          : "江南古典园林代表，以水为脉，亭台楼榭与花木山石相映成景。",
        hint: activeThemeRoute
          ? `共 ${resolveThemeRouteStops(activeThemeRoute, models).length} 站`
          : "",
      };

  return (
    <section className="relative h-screen w-full overflow-hidden bg-[#ece2d5]">
      <OverviewMapFrame
        highlightedModel={previewModel}
        mapMode={mapMode}
        models={models}
        activeThemeRoute={activeThemeRoute}
        visitedModelSlugs={visitedModelSlugs}
      >
        {models.map((model) => (
          <MapLabel
            key={model.slug}
            model={model}
            onSelect={handleSelect}
            onPreview={setPreviewSlug}
            onPreviewClear={() => setPreviewSlug(null)}
            isPreviewed={previewSlug === model.slug}
            isVisited={visitedModelSlugs.has(model.slug)}
            routeOrder={activeRouteStopOrder.get(model.slug)}
          />
        ))}
      </OverviewMapFrame>

      {isIntroPanelVisible ? (
        <div
          aria-hidden={isIntroPanelLeaving}
          className={`absolute left-4 top-4 z-20 w-[min(22.5rem,calc(100vw-6.5rem))] will-change-transform transition-transform duration-[1500ms] ease-[cubic-bezier(0.18,0.9,0.22,1)] sm:left-6 sm:top-6 sm:w-[22.5rem] ${
            isIntroPanelFullyVisible
              ? "translate-x-0"
              : "pointer-events-none -translate-x-[calc(100%+2rem)]"
          }`}
        >
          <div
            className={`${PAPER_PANEL_CLASS} pointer-events-none rounded-[1.5rem] pl-4 pr-6 py-[1.25rem] backdrop-blur-xl sm:pl-[1.15rem] sm:pr-[1.65rem] sm:py-[1.3rem]`}
          >
            <p className="text-xs font-medium uppercase tracking-[0.32em] text-[#7b6450]/72">
              园林总览
            </p>
            <h2
              className={`${mapLabelFont.className} mt-3 flex h-[2.35rem] items-center whitespace-nowrap leading-none tracking-[0.02em] text-[#2f2118] sm:h-[2.55rem]`}
            >
              <span className="inline-block origin-left scale-[1.18] text-[1.66rem] sm:text-[1.82rem]">
                一园入画·掌上云游
              </span>
            </h2>
            <p className="mt-3 text-sm leading-[1.75] text-[#5e4b3a]">
              咫尺乾坤，一步一江湖
            </p>
          </div>
        </div>
      ) : null}

      <div
        ref={routeControlsRef}
        className="absolute bottom-4 left-4 z-30 flex flex-col items-start gap-2 sm:bottom-6 sm:left-6"
      >
        {isHeatMode ? <HeatLegendPill /> : null}

        {isRouteSelectorOpen ? (
          <ThemeRouteSelectorPanel
            models={models}
            activeRoute={activeThemeRoute}
            visitedModelSlugs={visitedModelSlugs}
            onSelectRoute={handleThemeRouteSelect}
            onClearRoute={() => onThemeRouteChange(null)}
            onStartRoute={handleThemeRouteStart}
          />
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <BackgroundAudioButton
            isEnabled={isBackgroundAudioEnabled}
            onToggle={onBackgroundAudioToggle}
          />

          <button
            type="button"
            onClick={() =>
              setMapMode((mode) => (mode === "heat" ? "normal" : "heat"))
            }
            aria-pressed={isHeatMode}
            aria-label={isHeatMode ? "切换为导览图" : "切换为热力图"}
            className={`${PAPER_BUTTON_CLASS} inline-flex h-11 items-center gap-2 rounded-full px-4 text-[13px] font-medium tracking-[0.12em] backdrop-blur-md transition hover:border-[#4d3b2d]/20 hover:bg-[linear-gradient(180deg,_rgba(255,255,255,0.98)_0%,_rgba(250,246,240,1)_100%)] sm:h-12 sm:px-[1.125rem]`}
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-[17px] w-[17px] text-[#5a4839]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {isHeatMode ? (
                <>
                  <path d="M4 6.5 9 4l6 2.5 5-2.5v13.5L15 20l-6-2.5-5 2.5V6.5z" />
                  <path d="M9 4v13.5" />
                  <path d="M15 6.5V20" />
                </>
              ) : (
                <>
                  <path d="M12 3.5c3.2 2.8 5 5.4 5 8a5 5 0 0 1-10 0c0-2.6 1.8-5.2 5-8z" />
                  <path d="M9.5 12.5a2.5 2.5 0 0 0 5 0" />
                </>
              )}
            </svg>
            <span>{isHeatMode ? "导览图" : "热力图"}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsRouteSelectorOpen((value) => !value)}
            aria-expanded={isRouteSelectorOpen}
            aria-pressed={Boolean(activeThemeRoute)}
            aria-label={
              activeThemeRoute
                ? `已选择${activeThemeRoute.label}，打开主题游线`
                : "打开主题游线"
            }
            className={`${PAPER_BUTTON_CLASS} inline-flex h-11 items-center gap-2 rounded-full px-4 text-[13px] font-medium tracking-[0.12em] backdrop-blur-md transition hover:border-[#4d3b2d]/20 hover:bg-[linear-gradient(180deg,_rgba(255,255,255,0.98)_0%,_rgba(250,246,240,1)_100%)] sm:h-12 sm:px-[1.125rem] ${
              activeThemeRoute
                ? "border-[#8b462d]/25 text-[#5e3324] shadow-[0_14px_28px_rgba(112,70,42,0.14)]"
                : ""
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className={`h-[17px] w-[17px] ${
                activeThemeRoute ? "text-[#8b462d]" : "text-[#5a4839]"
              }`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 17c3.8-6.7 7.4 3.1 11-3.6 1.1-2 2.8-3.4 5-4.1" />
              <path d="m16.5 7.8 3.5 1.5-1.5 3.5" />
              <path d="M5.5 17.2h.01" />
              <path d="M12 15.4h.01" />
            </svg>
            <span>{activeThemeRoute?.label ?? "主题游线"}</span>
          </button>
        </div>
      </div>

      <DirectoryDrawer
        models={models}
        isOpen={isDrawerOpen}
        onToggle={() => setIsDrawerOpen((value) => !value)}
        onClose={() => setIsDrawerOpen(false)}
        onSelect={handleSelect}
        onPreview={setPreviewSlug}
        onPreviewClear={() => setPreviewSlug(null)}
        tourProgress={tourProgress}
        visitedModelSlugs={visitedModelSlugs}
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-[4.75rem] z-20 flex justify-center px-4 sm:bottom-5 sm:px-6">
        <div className="flex w-[min(92vw,44rem)] items-center justify-center gap-3 rounded-full border border-[#65513f]/10 bg-[linear-gradient(180deg,_rgba(255,255,252,0.9)_0%,_rgba(247,243,236,0.95)_100%)] px-4 py-2 text-center text-sm text-[#5e4b3a] shadow-[0_12px_24px_rgba(72,51,32,0.1)] backdrop-blur-md sm:px-5">
          <p
            className={`${mapLabelFont.className} max-w-[8rem] shrink-0 truncate text-[1.05rem] leading-none tracking-[0.03em] text-[#2f2118] sm:max-w-[10rem]`}
          >
            {overviewPrompt.tag}
          </p>
          <p className="min-w-0 max-w-[26rem] truncate text-[12px] leading-5 text-[#5e4b3a] sm:text-[13px]">
            {overviewPrompt.copy}
          </p>
          {overviewPrompt.hint ? (
            <p className="hidden shrink-0 text-[11px] leading-4 text-[#8c7156] md:block">
              {overviewPrompt.hint}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function SingleModelStage({
  models,
  model,
  onSelect,
  onBack,
  activeThemeRoute,
  isBackgroundAudioEnabled,
  onBackgroundAudioToggle,
  tourProgress,
  visitedModelSlugs,
}: SingleModelStageProps) {
  const introText = normalizeInterpretationText(model.interpretation);
  const detailText = normalizeInterpretationText(model.detail ?? "");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const daylightProgressRef = useRef(0.5);
  const sunLightRef = useRef<DirectionalLight | null>(null);
  const sunTargetRef = useRef<Object3D | null>(null);
  const shadowMaterialRef = useRef<ShadowMaterial | null>(null);
  const shadowRadiusRef = useRef(1);
  const [daylightProgress, setDaylightProgress] = useState(0.5);
  const [viewerState, setViewerState] = useState<ViewerState>(() =>
    model.hasModelFile
      ? {
          kind: "loading",
          message: `正在加载 ${model.label}…`,
        }
      : {
          kind: "ready",
          message: `${model.label} 点位已开放。`,
        }
  );
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isInterpretationReady, setIsInterpretationReady] = useState(
    () => !model.hasModelFile
  );
  const [isInterpretationOpen, setIsInterpretationOpen] = useState(true);
  const [isGalleryOpen, setIsGalleryOpen] = useState(true);
  const [isGalleryLightboxOpen, setIsGalleryLightboxOpen] = useState(false);
  const [galleryRotation, setGalleryRotation] = useState(0);
  const [galleryScale, setGalleryScale] = useState(1);
  const [galleryPan, setGalleryPan] = useState<NormalizedMapPoint>({
    x: 0,
    y: 0,
  });
  const [galleryPictures, setGalleryPictures] = useState(model.pictures);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [interpretationMode, setInterpretationMode] =
    useState<InterpretationMode>("intro");
  const [typedInterpretation, setTypedInterpretation] = useState("");
  const [hasIntroTypewriterCompleted, setHasIntroTypewriterCompleted] =
    useState(false);
  const [isNarrationEnabled, setIsNarrationEnabled] = useState(true);
  const [isNarrationAvailable, setIsNarrationAvailable] = useState<
    boolean | null
  >(null);
  const [narrationAudioSrc, setNarrationAudioSrc] = useState<string | null>(
    null
  );
  const narrationAudioRef = useRef<HTMLAudioElement | null>(null);
  const narrationAudioSessionRef = useRef(0);
  const isIntroInterpretationMode = interpretationMode === "intro";
  const hasDetailText = detailText.trim().length > 0;
  const displayedInterpretationText = isIntroInterpretationMode
    ? typedInterpretation
    : detailText;
  const shouldShowInterpretationCursor =
    isIntroInterpretationMode &&
    !(hasIntroTypewriterCompleted || typedInterpretation.length >= introText.length) &&
    typedInterpretation.length < introText.length;
  const isNarrationControlEnabled =
    isIntroInterpretationMode && Boolean(narrationAudioSrc);
  const galleryPictureCount = galleryPictures.length;
  const hasGalleryPictures = galleryPictureCount > 0;
  const activeGalleryIndex = hasGalleryPictures
    ? Math.min(galleryIndex, galleryPictureCount - 1)
    : 0;
  const daylightSceneStyle = getDaylightSceneStyle(daylightProgress);
  const currentModelIndex = Math.max(
    models.findIndex((item) => item.slug === model.slug),
    0
  );
  const previousModel =
    models[(currentModelIndex - 1 + models.length) % models.length];
  const nextModel = models[(currentModelIndex + 1) % models.length];
  const activeRouteStops = resolveThemeRouteStops(activeThemeRoute, models);
  const activeRouteModelIndex = activeRouteStops.findIndex(
    (item) => item.slug === model.slug
  );
  const isModelOnActiveRoute =
    Boolean(activeThemeRoute) && activeRouteModelIndex >= 0;
  const shouldUseRouteNavigation =
    isModelOnActiveRoute && activeRouteStops.length > 1;
  const previousNavigationModel = shouldUseRouteNavigation
    ? activeRouteStops[
        (activeRouteModelIndex - 1 + activeRouteStops.length) %
          activeRouteStops.length
      ]
    : previousModel;
  const nextNavigationModel = shouldUseRouteNavigation
    ? activeRouteStops[(activeRouteModelIndex + 1) % activeRouteStops.length]
    : nextModel;
  const syncDaylightShadow = useCallback((progress: number) => {
    const sunLight = sunLightRef.current;
    const sunTarget = sunTargetRef.current;
    const shadowMaterial = shadowMaterialRef.current;

    if (!sunLight || !sunTarget) {
      return;
    }

    const clampedProgress = clampProgress(progress);
    const noonAmount = Math.sin(clampedProgress * Math.PI);
    const radius = shadowRadiusRef.current;
    const sunX = mixNumber(-3.6, 3.6, clampedProgress) * radius;
    const sunY = mixNumber(1.15, 5.3, noonAmount) * radius;
    const sunZ = mixNumber(2.2, -2.1, clampedProgress) * radius;

    sunLight.position.set(sunX, sunY, sunZ);
    sunLight.intensity = mixNumber(2.1, 2.7, noonAmount);
    sunTarget.position.set(0, 0, 0);
    sunTarget.updateMatrixWorld();
    sunLight.shadow.needsUpdate = true;

    if (shadowMaterial) {
      shadowMaterial.opacity = mixNumber(0.3, 0.42, noonAmount);
    }
  }, []);

  useEffect(() => {
    daylightProgressRef.current = daylightProgress;
    syncDaylightShadow(daylightProgress);
  }, [daylightProgress, syncDaylightShadow]);

  useEffect(() => {
    return () => {
      stopNarrationAudio(
        {
          audioRef: narrationAudioRef,
          audioSessionRef: narrationAudioSessionRef,
        },
        true
      );
    };
  }, []);

  useEffect(() => {
    if (!isGalleryOpen) {
      return;
    }

    const controller = new AbortController();

    void fetch(`/api/model-pictures?slug=${encodeURIComponent(model.slug)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { pictures?: SiteModelPicture[] } | null) => {
        const nextPictures = payload?.pictures;

        if (controller.signal.aborted || !Array.isArray(nextPictures)) {
          return;
        }

        setGalleryPictures(nextPictures);
        setGalleryIndex((index) =>
          nextPictures.length > 0 ? Math.min(index, nextPictures.length - 1) : 0
        );
      })
      .catch(() => {});

    return () => {
      controller.abort();
    };
  }, [isGalleryOpen, model.slug]);

  useEffect(() => {
    if (!isGalleryLightboxOpen || typeof window === "undefined") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsGalleryLightboxOpen(false);
      }

      if (event.key === "ArrowLeft") {
        setGalleryIndex((index) =>
          galleryPictureCount > 0
            ? (index - 1 + galleryPictureCount) % galleryPictureCount
            : 0
        );
        setGalleryScale(1);
        setGalleryPan({ x: 0, y: 0 });
      }

      if (event.key === "ArrowRight") {
        setGalleryIndex((index) =>
          galleryPictureCount > 0 ? (index + 1) % galleryPictureCount : 0
        );
        setGalleryScale(1);
        setGalleryPan({ x: 0, y: 0 });
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isGalleryLightboxOpen, galleryPictureCount]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const controller = new AbortController();

    void findNarrationAudioSource(model.slug, controller.signal).then((src) => {
      if (controller.signal.aborted) {
        return;
      }

      setNarrationAudioSrc(src);
      setIsNarrationAvailable(Boolean(src));
    });

    return () => {
      controller.abort();
    };
  }, [model.slug]);

  const handleDrawerSelect = (slug: string) => {
    setIsDrawerOpen(false);
    onSelect(slug);
  };

  const selectGalleryIndex = (index: number) => {
    setGalleryIndex(index);
    setGalleryScale(1);
    setGalleryPan({ x: 0, y: 0 });
  };

  const handleGalleryPrevious = () => {
    setGalleryIndex((index) =>
      galleryPictureCount > 0
        ? (index - 1 + galleryPictureCount) % galleryPictureCount
        : 0
    );
    setGalleryScale(1);
    setGalleryPan({ x: 0, y: 0 });
  };

  const handleGalleryNext = () => {
    setGalleryIndex((index) =>
      galleryPictureCount > 0 ? (index + 1) % galleryPictureCount : 0
    );
    setGalleryScale(1);
    setGalleryPan({ x: 0, y: 0 });
  };

  const handleNarrationToggle = () => {
    if (!isNarrationControlEnabled) {
      return;
    }

    if (isNarrationEnabled) {
      setIsNarrationEnabled(false);
      return;
    }

    stopNarrationAudio(
      {
        audioRef: narrationAudioRef,
        audioSessionRef: narrationAudioSessionRef,
      },
      true
    );
    setIsNarrationEnabled(true);
  };

  const handleInterpretationModeChange = (mode: InterpretationMode) => {
    if (mode === interpretationMode) {
      return;
    }

    if (mode === "detail" && !hasDetailText) {
      return;
    }

    if (
      mode === "detail" &&
      isIntroInterpretationMode &&
      typedInterpretation.length < introText.length
    ) {
      setTypedInterpretation(introText);
      setHasIntroTypewriterCompleted(true);
    }

    setInterpretationMode(mode);
  };

  useEffect(() => {
    if (!isIntroInterpretationMode) {
      return;
    }

    if (
      hasIntroTypewriterCompleted ||
      typedInterpretation.length >= introText.length
    ) {
      return;
    }

    if (!isInterpretationReady) {
      return;
    }

    if (!isInterpretationOpen) {
      return;
    }

    const nextCharacter = introText[typedInterpretation.length];
    const delay =
      nextCharacter === "\n"
        ? INTERPRETATION_TYPE_INTERVAL_MS * 3
        : /[，。；：、“”]/.test(nextCharacter)
          ? INTERPRETATION_TYPE_INTERVAL_MS * 2
          : INTERPRETATION_TYPE_INTERVAL_MS;

    const timer = window.setTimeout(() => {
      setTypedInterpretation(
        introText.slice(0, typedInterpretation.length + 1)
      );
    }, delay);

    return () => window.clearTimeout(timer);
  }, [
    hasIntroTypewriterCompleted,
    isInterpretationOpen,
    isInterpretationReady,
    isIntroInterpretationMode,
    introText,
    typedInterpretation,
  ]);

  useEffect(() => {
    if (
      isIntroInterpretationMode &&
      isInterpretationOpen &&
      isNarrationEnabled
    ) {
      return;
    }

    stopNarrationAudio(
      {
        audioRef: narrationAudioRef,
        audioSessionRef: narrationAudioSessionRef,
      },
      true
    );
  }, [isInterpretationOpen, isIntroInterpretationMode, isNarrationEnabled]);

  useEffect(() => {
    if (
      !isIntroInterpretationMode ||
      !isNarrationEnabled ||
      !isInterpretationReady ||
      !isInterpretationOpen ||
      !narrationAudioSrc
    ) {
      return;
    }

    const audio = narrationAudioRef.current;

    if (!audio) {
      return;
    }

    const sessionId = narrationAudioSessionRef.current + 1;

    narrationAudioSessionRef.current = sessionId;
    audio.pause();
    audio.preload = "auto";
    audio.volume = 1;

    try {
      audio.currentTime = 0;
    } catch {}

    audio.onended = () => {
      if (narrationAudioSessionRef.current !== sessionId) {
        return;
      }
    };

    audio.onerror = () => {
      if (narrationAudioSessionRef.current !== sessionId) {
        return;
      }

      setNarrationAudioSrc(null);
      setIsNarrationAvailable(false);
    };

    void audio.play().catch(() => {});

    return () => {
      if (narrationAudioSessionRef.current !== sessionId) {
        return;
      }

      audio.pause();
      audio.onended = null;
      audio.onerror = null;

      try {
        audio.currentTime = 0;
      } catch {}
    };
  }, [
    isInterpretationOpen,
    isInterpretationReady,
    isIntroInterpretationMode,
    isNarrationEnabled,
    narrationAudioSrc,
  ]);

  useEffect(() => {
    if (!model.hasModelFile) {
      return;
    }

    const container = containerRef.current;

    if (!container) {
      return;
    }

    let isDisposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let renderer: WebGLRenderer | null = null;
    let loadedScene: Object3D | null = null;
    let shadowReceiverMaterial: ShadowMaterial | null = null;
    let shadowReceiverMesh: Mesh | null = null;
    let camera: PerspectiveCamera | null = null;
    let controls: OrbitControls | null = null;
    let introRotationStartTime = 0;
    let introRotationActive = false;

    setViewerState({
      kind: "loading",
      message: `正在加载 ${model.label}…`,
    });
    setIsInterpretationReady(false);

    const syncRendererSize = () => {
      if (!renderer || !camera) {
        return;
      }

      const { clientWidth, clientHeight } = container;

      if (!clientWidth || !clientHeight) {
        return;
      }

      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
    };

    const mountViewer = async () => {
      try {
        const THREE = await import("three");
        const { GLTFLoader } = await import(
          "three/examples/jsm/loaders/GLTFLoader.js"
        );
        const { OrbitControls } = await import(
          "three/examples/jsm/controls/OrbitControls.js"
        );

        if (isDisposed) {
          return;
        }

        const scene = new THREE.Scene();

        camera = new THREE.PerspectiveCamera(38, 1, 0.1, 5000);
        camera.position.set(3.5, 2.4, 6.8);

        renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        });
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        renderer.setClearAlpha(0);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFShadowMap;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        renderer.domElement.style.display = "block";
        renderer.domElement.style.touchAction = "none";

        container.appendChild(renderer.domElement);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.enablePan = false;
        controls.minPolarAngle = 0.08;
        controls.maxPolarAngle = Math.PI / 2.16;
        controls.rotateSpeed = 0.82;
        controls.zoomSpeed = 0.92;
        controls.target.set(0, 1.1, 0);

        const ambientLight = new THREE.AmbientLight(0xf8fbf6, 1.2);
        const hemiLight = new THREE.HemisphereLight(0xf4f8f6, 0xa7afa8, 2.2);
        const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
        const fillLight = new THREE.DirectionalLight(0xdce8e4, 1.35);
        const rimLight = new THREE.DirectionalLight(0xece8d6, 0.92);
        const sunTarget = new THREE.Object3D();

        keyLight.position.set(7, 10, 9);
        keyLight.castShadow = true;
        keyLight.target = sunTarget;
        keyLight.shadow.mapSize.set(2048, 2048);
        keyLight.shadow.bias = -0.00008;
        keyLight.shadow.normalBias = 0.02;
        fillLight.position.set(-6, 4, 7);
        rimLight.position.set(3, 4, -8);

        scene.add(
          ambientLight,
          hemiLight,
          sunTarget,
          keyLight,
          fillLight,
          rimLight
        );
        sunLightRef.current = keyLight;
        sunTargetRef.current = sunTarget;

        syncRendererSize();

        resizeObserver = new ResizeObserver(() => {
          syncRendererSize();
        });
        resizeObserver.observe(container);

        const loader = new GLTFLoader();

        loader.load(
          `/api/model?slug=${encodeURIComponent(model.slug)}`,
          (gltf: GLTF) => {
            if (isDisposed || !camera || !controls) {
              return;
            }

            loadedScene = gltf.scene || gltf.scenes[0];

            if (!loadedScene) {
              setViewerState({
                kind: "error",
                message: "模型文件为空，无法展示。",
              });
              return;
            }

            scene.add(loadedScene);

            const box = new THREE.Box3().setFromObject(loadedScene);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());
            const sphere = box.getBoundingSphere(new THREE.Sphere());
            const radius = Math.max(sphere.radius, 1);
            const bottomY = box.min.y - center.y;

            loadedScene.position.set(-center.x, -center.y, -center.z);
            loadedScene.rotation.y = Math.PI;

            loadedScene.traverse((child: Object3D) => {
              if (!("isMesh" in child) || !child.isMesh) {
                return;
              }

              const mesh = child as Mesh;
              mesh.castShadow = true;
              mesh.receiveShadow = false;
            });

            shadowReceiverMaterial = new THREE.ShadowMaterial({
              color: 0x232823,
              opacity: 0.42,
              transparent: true,
              depthWrite: false,
            });

            const receiverSize =
              Math.max(size.x, size.z, radius) * (radius > 3 ? 5 : 6.5);
            shadowReceiverMesh = new THREE.Mesh(
              new THREE.PlaneGeometry(receiverSize, receiverSize),
              shadowReceiverMaterial
            );
            shadowReceiverMesh.position.set(
              0,
              bottomY - Math.max(radius * 0.012, 0.01),
              0
            );
            shadowReceiverMesh.rotation.x = -Math.PI / 2;
            shadowReceiverMesh.receiveShadow = true;
            scene.add(shadowReceiverMesh);

            const shadowCamera = keyLight.shadow.camera;
            const shadowExtent = Math.max(radius * 4.2, receiverSize * 0.55, 4);
            shadowCamera.left = -shadowExtent;
            shadowCamera.right = shadowExtent;
            shadowCamera.top = shadowExtent;
            shadowCamera.bottom = -shadowExtent;
            shadowCamera.near = Math.max(radius * 0.02, 0.1);
            shadowCamera.far = Math.max(radius * 14, 60);
            shadowCamera.updateProjectionMatrix();

            shadowMaterialRef.current = shadowReceiverMaterial;
            shadowRadiusRef.current = radius;
            syncDaylightShadow(daylightProgressRef.current);

            const halfFov = THREE.MathUtils.degToRad(camera.fov * 0.5);
            const fitHeightDistance = radius / Math.tan(halfFov);
            const fitWidthDistance =
              fitHeightDistance / Math.max(camera.aspect, 0.1);
            const distance =
              Math.max(fitHeightDistance, fitWidthDistance) *
              MODEL_CAMERA_DISTANCE_MULTIPLIER;

            camera.near = Math.max(distance / 120, 0.1);
            camera.far = Math.max(distance * 35, 100);
            camera.position.set(
              radius * 0.28,
              Math.max(size.y * 0.1, radius * 0.18),
              distance
            );
            camera.updateProjectionMatrix();

            controls.target.set(0, 0, 0);
            controls.minDistance = Math.max(radius * 0.74, 1.1);
            controls.maxDistance = Math.max(radius * 5.5, 14);
            controls.enabled = false;
            controls.update();
            introRotationStartTime = 0;
            introRotationActive = true;

            setViewerState({
              kind: "ready",
              message: `${model.label} 已载入。`,
            });
          },
          (event: ProgressEvent<EventTarget>) => {
            if (isDisposed) {
              return;
            }

            if (event.total > 0) {
              const progress = Math.min(
                100,
                Math.round((event.loaded / event.total) * 100)
              );

              setViewerState({
                kind: "loading",
                message: `正在加载 ${model.label}… ${progress}%`,
              });
              return;
            }

            setViewerState({
              kind: "loading",
              message: `正在加载 ${model.label}…`,
            });
          },
          () => {
            if (isDisposed) {
              return;
            }

            setViewerState({
              kind: "error",
              message: `模型加载失败，请确认 ${model.label} 的模型文件可正常读取。`,
            });
          }
        );

        renderer.setAnimationLoop((time) => {
          if (introRotationActive && loadedScene && controls) {
            if (introRotationStartTime === 0) {
              introRotationStartTime = time;
            }

            const progress = Math.min(
              1,
              (time - introRotationStartTime) / MODEL_INTRO_ROTATION_DURATION_MS
            );
            const easedProgress = 1 - Math.pow(1 - progress, 3);

            loadedScene.rotation.y = Math.PI * (1 - easedProgress);

            if (progress >= 1) {
              loadedScene.rotation.y = 0;
              introRotationActive = false;
              controls.enabled = true;
              controls.update();
              setIsInterpretationReady(true);

              setViewerState({
                kind: "ready",
                message: `${model.label} 已就绪。`,
              });
            }
          } else {
            controls?.update();
          }

          renderer?.render(scene, camera!);
        });
      } catch {
        if (isDisposed) {
          return;
        }

        setViewerState({
          kind: "error",
          message: "Three.js 初始化失败，请检查浏览器 WebGL 支持。",
        });
      }
    };

    mountViewer();

    return () => {
      isDisposed = true;
      resizeObserver?.disconnect();
      controls?.dispose();

      if (renderer) {
        renderer.setAnimationLoop(null);
      }

      if (loadedScene) {
        disposeObject(loadedScene);
      }

      shadowReceiverMesh?.parent?.remove(shadowReceiverMesh);
      shadowReceiverMesh?.geometry.dispose();
      shadowReceiverMaterial?.dispose();

      sunLightRef.current = null;
      sunTargetRef.current = null;

      if (shadowMaterialRef.current === shadowReceiverMaterial) {
        shadowMaterialRef.current = null;
      }

      renderer?.dispose();

      if (renderer?.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [model.hasModelFile, model.label, model.slug, syncDaylightShadow]);

  return (
    <section className="relative h-screen w-full overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 transition-[background] duration-500"
        style={{ background: daylightSceneStyle.background }}
      />
      <div
        className="pointer-events-none absolute inset-0 transition-[background] duration-500"
        style={{ background: daylightSceneStyle.wash }}
      />
      <div
        className="pointer-events-none absolute inset-0 transition-[background] duration-500"
        style={{ background: daylightSceneStyle.atmosphere }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[46%] transition-[background] duration-500"
        style={{ background: daylightSceneStyle.ground }}
      />
      {model.hasModelFile ? (
        <div
          ref={containerRef}
          className="absolute inset-0 z-[4] cursor-grab active:cursor-grabbing"
        />
      ) : (
        <div className="pointer-events-none absolute inset-0 z-[4] flex items-center justify-center px-4">
          <div
            className={`${PAPER_PANEL_CLASS} max-w-[min(82vw,28rem)] rounded-[1.5rem] px-6 py-5 text-center backdrop-blur-md`}
          >
            <p
              className={`${mapLabelFont.className} text-[1.5rem] leading-none tracking-[0.04em] text-[#2f2118]`}
            >
              模型待补
            </p>
            <p className="mt-3 text-sm leading-7 text-[#5e4b3a]">
              {model.label} 的点位与文案已先加入，GLB 模型和解说音频等待补充。
            </p>
          </div>
        </div>
      )}

      <DirectoryDrawer
        models={models}
        isOpen={isDrawerOpen}
        onToggle={() => setIsDrawerOpen((value) => !value)}
        onClose={() => setIsDrawerOpen(false)}
        onSelect={handleDrawerSelect}
        tourProgress={tourProgress}
        visitedModelSlugs={visitedModelSlugs}
      />

      <div className="absolute bottom-2 left-4 z-40 flex items-center gap-2 sm:bottom-4 sm:left-6 sm:gap-2.5">
        <button
          type="button"
          onClick={onBack}
          aria-label="返回主页"
          className={`${PAPER_BUTTON_CLASS} flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-md transition hover:border-[#4d3b2d]/20 hover:bg-[linear-gradient(180deg,_rgba(255,255,255,0.98)_0%,_rgba(250,246,240,1)_100%)] sm:h-12 sm:w-12`}
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="h-[18px] w-[18px] text-[#5a4839] sm:h-5 sm:w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 10.8 12 3l9 7.8" />
            <path d="M5.5 9.5V21h13V9.5" />
            <path d="M9.5 21v-6h5v6" />
          </svg>
        </button>

        <BackgroundAudioButton
          isEnabled={isBackgroundAudioEnabled}
          onToggle={onBackgroundAudioToggle}
        />

        {isModelOnActiveRoute && activeThemeRoute ? (
          <div
            className={`${PAPER_BUTTON_CLASS} hidden h-11 items-center gap-2 rounded-full px-4 text-[12px] text-[#5e4b3a] backdrop-blur-md sm:flex sm:h-12`}
            aria-label={`${activeThemeRoute.label}第 ${
              activeRouteModelIndex + 1
            } 站，共 ${activeRouteStops.length} 站`}
          >
            <span
              className={`${mapLabelFont.className} text-[1rem] leading-none tracking-[0.03em] text-[#2f2118]`}
            >
              {activeThemeRoute.shortLabel}
            </span>
            <span className="rounded-full border border-[#7a5f42]/12 bg-white/72 px-2 py-0.5 text-[11px] leading-none">
              {activeRouteModelIndex + 1}/{activeRouteStops.length}
            </span>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => onSelect(previousNavigationModel.slug)}
          aria-label={
            shouldUseRouteNavigation
              ? `查看主题上一站：${previousNavigationModel.label}`
              : `查看上一个模型：${previousNavigationModel.label}`
          }
          className={`${PAPER_BUTTON_CLASS} flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-md transition hover:border-[#4d3b2d]/20 hover:bg-[linear-gradient(180deg,_rgba(255,255,255,0.98)_0%,_rgba(250,246,240,1)_100%)] sm:h-12 sm:w-12`}
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="h-4 w-4 text-[#5a4839] sm:h-[18px] sm:w-[18px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        <button
          type="button"
          onClick={() => onSelect(nextNavigationModel.slug)}
          aria-label={
            shouldUseRouteNavigation
              ? `查看主题下一站：${nextNavigationModel.label}`
              : `查看下一个模型：${nextNavigationModel.label}`
          }
          className={`${PAPER_BUTTON_CLASS} flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-md transition hover:border-[#4d3b2d]/20 hover:bg-[linear-gradient(180deg,_rgba(255,255,255,0.98)_0%,_rgba(250,246,240,1)_100%)] sm:h-12 sm:w-12`}
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="h-4 w-4 text-[#5a4839] sm:h-[18px] sm:w-[18px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      <div className="absolute bottom-[4.75rem] left-4 top-4 z-10 flex min-h-0 w-[min(19.75rem,calc(100vw-2rem))] flex-col gap-4 sm:bottom-[5rem] sm:left-6 sm:top-6 sm:w-[19.75rem]">
        <div className="w-full shrink-0">
          <div
            className={`${PAPER_PANEL_CLASS} pointer-events-none rounded-[1.5rem] pl-4 pr-6 py-[1.25rem] backdrop-blur-xl sm:pl-[1.15rem] sm:pr-[1.65rem] sm:py-[1.3rem]`}
          >
            <p className="text-xs font-medium uppercase tracking-[0.32em] text-[#7b6450]/72">
              园林光景
            </p>
            <h2
              className={`${mapLabelFont.className} mt-3 flex h-[2.35rem] max-w-[15.2rem] items-center leading-none tracking-[0.02em] text-[#2f2118] sm:h-[2.55rem] sm:max-w-[15.6rem]`}
            >
              <span className="inline-block origin-left scale-[1.24] text-[1.8rem] sm:text-[1.98rem]">
                {model.label}
              </span>
            </h2>
            <p className="mt-3.5 max-w-[15rem] text-sm leading-[1.78] text-[#5e4b3a] sm:max-w-[15.4rem]">
              {model.summary}
            </p>
            {isModelOnActiveRoute && activeThemeRoute ? (
              <p className="mt-3 inline-flex rounded-full border border-[#7a5f42]/12 bg-[rgba(255,255,255,0.62)] px-2.5 py-1 text-[11px] leading-none tracking-[0.08em] text-[#7b5138]">
                {activeThemeRoute.label} · 第 {activeRouteModelIndex + 1} 站
              </p>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 w-full flex-1">
          {isInterpretationReady && isInterpretationOpen ? (
            <div className="relative flex h-full min-h-0 w-full">
              <button
                type="button"
                onClick={() => setIsInterpretationOpen(false)}
                aria-label="收起解说"
                className={`${PAPER_BUTTON_CLASS} absolute right-3 -top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-md transition hover:border-[#4d3b2d]/20 hover:bg-[linear-gradient(180deg,_rgba(255,255,255,0.98)_0%,_rgba(250,246,240,1)_100%)] sm:left-full sm:right-auto sm:top-3 sm:ml-3`}
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="h-[18px] w-[18px] text-[#5a4839]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M15 6l-6 6 6 6" />
                </svg>
              </button>

              <aside
                className={`${PAPER_PANEL_CLASS} relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[1.5rem] px-4 py-4 backdrop-blur-xl sm:px-5 sm:py-5`}
              >
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,_rgba(255,255,255,0.7)_0%,_transparent_34%),linear-gradient(180deg,_rgba(134,108,76,0.03)_0%,_rgba(255,255,255,0)_100%)]" />
                <div className="relative flex min-w-0 items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                    <h3
                      className={`${mapLabelFont.className} shrink-0 text-[1.52rem] leading-none tracking-[0.03em] text-[#2f2118]`}
                    >
                      关于建筑
                    </h3>
                    <div
                      role="tablist"
                      aria-label="切换关于建筑文字"
                      className={`${PAPER_BUTTON_CLASS} relative inline-grid h-8 shrink-0 grid-cols-2 overflow-hidden rounded-full text-[12px] font-medium leading-none backdrop-blur-md`}
                    >
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute bottom-1.5 left-1/2 top-1.5 z-10 w-px bg-[#8c7156]/24"
                      />
                      <button
                        type="button"
                        role="tab"
                        aria-selected={interpretationMode === "intro"}
                        onClick={() => handleInterpretationModeChange("intro")}
                        className={`relative z-20 flex min-w-[3.15rem] items-center justify-center rounded-l-full px-3 transition ${
                          interpretationMode === "intro"
                            ? "bg-[rgba(255,255,255,0.68)] text-[#2f2118] shadow-[inset_0_0_0_1px_rgba(77,59,45,0.08)]"
                            : "text-[#7b6450] hover:bg-white/35 hover:text-[#2f2118]"
                        }`}
                      >
                        简介
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={interpretationMode === "detail"}
                        aria-disabled={!hasDetailText}
                        disabled={!hasDetailText}
                        onClick={() => handleInterpretationModeChange("detail")}
                        className={`relative z-20 flex min-w-[3.15rem] items-center justify-center rounded-r-full px-3 transition ${
                          interpretationMode === "detail"
                            ? "bg-[rgba(255,255,255,0.68)] text-[#2f2118] shadow-[inset_0_0_0_1px_rgba(77,59,45,0.08)]"
                            : hasDetailText
                              ? "text-[#7b6450] hover:bg-white/35 hover:text-[#2f2118]"
                              : "cursor-not-allowed text-[#8c7156]/45"
                        }`}
                      >
                        详情
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleNarrationToggle}
                    disabled={!isNarrationControlEnabled}
                    aria-pressed={
                      isNarrationControlEnabled ? isNarrationEnabled : false
                    }
                    aria-label={
                      !isIntroInterpretationMode
                        ? "简介音频仅在简介中可用"
                        : narrationAudioSrc
                        ? isNarrationEnabled
                          ? "关闭音频"
                          : "开启音频"
                        : isNarrationAvailable === false
                          ? "暂无解说音频"
                          : "正在检查音频"
                    }
                    className={`${PAPER_BUTTON_CLASS} flex h-9 w-9 shrink-0 items-center justify-center rounded-full backdrop-blur-md transition hover:border-[#4d3b2d]/20 hover:bg-[linear-gradient(180deg,_rgba(255,255,255,0.98)_0%,_rgba(250,246,240,1)_100%)] ${
                      isNarrationControlEnabled
                        ? ""
                        : "cursor-not-allowed opacity-45 hover:border-[#4d3b2d]/10 hover:bg-[linear-gradient(180deg,_rgba(255,255,253,0.96)_0%,_rgba(247,243,236,0.98)_100%)]"
                    }`}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      className="h-[15px] w-[15px] text-[#5a4839]"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 9v6h4l5 4V5l-5 4H5z" />
                      {isNarrationControlEnabled && isNarrationEnabled ? (
                        <>
                          <path d="M18 9.5a4 4 0 0 1 0 5" />
                          <path d="M20.5 7a7.5 7.5 0 0 1 0 10" />
                        </>
                      ) : (
                        <path d="M4 4l16 16" />
                      )}
                    </svg>
                  </button>
                </div>

                {narrationAudioSrc ? (
                  <audio
                    ref={narrationAudioRef}
                    src={narrationAudioSrc}
                    preload="metadata"
                    className="hidden"
                    aria-hidden="true"
                  />
                ) : null}

                <div className="paper-scrollarea relative mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
                  <div>
                    {renderInterpretationContent(
                      displayedInterpretationText,
                      shouldShowInterpretationCursor
                    )}
                  </div>
                </div>
              </aside>
            </div>
          ) : null}

          {isInterpretationReady ? (
            <button
              type="button"
              onClick={() => setIsInterpretationOpen((value) => !value)}
              aria-label={isInterpretationOpen ? "收起解说" : "展开解说"}
              className={`${PAPER_BUTTON_CLASS} relative flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-md transition hover:border-[#4d3b2d]/20 hover:bg-[linear-gradient(180deg,_rgba(255,255,255,0.98)_0%,_rgba(250,246,240,1)_100%)] ${
                isInterpretationOpen ? "hidden" : ""
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-[18px] w-[18px] text-[#5a4839]"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          ) : null}
        </div>
      </div>

      {hasGalleryPictures ? (
        <BuildingGalleryPanel
          model={model}
          pictures={galleryPictures}
          currentIndex={activeGalleryIndex}
          isOpen={isGalleryOpen}
          onOpen={() => setIsGalleryOpen(true)}
          onClose={() => setIsGalleryOpen(false)}
          onExpand={() => setIsGalleryLightboxOpen(true)}
          onPrevious={handleGalleryPrevious}
          onNext={handleGalleryNext}
          onSelect={selectGalleryIndex}
        />
      ) : null}

      {hasGalleryPictures ? (
        <BuildingGalleryLightbox
          model={model}
          pictures={galleryPictures}
          currentIndex={activeGalleryIndex}
          isOpen={isGalleryLightboxOpen}
          rotation={galleryRotation}
          scale={galleryScale}
          pan={galleryPan}
          onClose={() => setIsGalleryLightboxOpen(false)}
          onPrevious={handleGalleryPrevious}
          onNext={handleGalleryNext}
          onRotateLeft={() => setGalleryRotation((rotation) => rotation - 90)}
          onRotateRight={() => setGalleryRotation((rotation) => rotation + 90)}
          onZoomIn={() => setGalleryScale((scale) => Math.min(3, scale + 0.25))}
          onZoomOut={() =>
            setGalleryScale((scale) => {
              const nextScale = Math.max(0.5, scale - 0.25);

              if (nextScale <= 1) {
                setGalleryPan({ x: 0, y: 0 });
              }

              return nextScale;
            })
          }
          onPanChange={setGalleryPan}
          onSelect={selectGalleryIndex}
        />
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-end px-4 sm:bottom-6 sm:px-6 lg:justify-center lg:px-4">
        {viewerState.kind === "loading" ? (
          <div
            className={`${PAPER_PANEL_CLASS} w-[min(88vw,22rem)] rounded-[1.35rem] px-5 py-3 text-center backdrop-blur-md`}
          >
            <p
              className={`${mapLabelFont.className} text-[1.18rem] leading-none tracking-[0.04em] text-[#2f2118]`}
            >
              载入中
            </p>
            <p className="mt-1.5 text-[13px] leading-6 text-[#5e4b3a]">
              {viewerState.message}
            </p>
          </div>
        ) : viewerState.kind === "error" ? (
          <div
            className={`${PAPER_PANEL_CLASS} max-w-xl rounded-full px-4 py-2 text-center text-sm text-[#3f342c] backdrop-blur-md`}
          >
            {viewerState.message}
          </div>
        ) : (
          <DaylightControl
            progress={daylightProgress}
            label={daylightSceneStyle.label}
            onProgressChange={(progress) => {
              setDaylightProgress(clampProgress(progress));
            }}
          />
        )}
      </div>
    </section>
  );
}

export default function ModelViewer({
  models,
  initialSlug = null,
}: ModelViewerProps) {
  const initialModel = initialSlug
    ? models.find((model) => model.slug === initialSlug)
    : null;
  const [displayedSlug, setDisplayedSlug] = useState<string | null>(
    initialModel?.slug ?? null
  );
  const [isMapFontReady, setIsMapFontReady] = useState(false);
  const [transitionPhase, setTransitionPhase] =
    useState<InkTransitionPhase>("covering");
  const [transitionKind, setTransitionKind] =
    useState<InkTransitionKind>("initial");
  const [transitionLabel, setTransitionLabel] = useState(
    initialModel?.label ?? "一园入画·掌上云游"
  );
  const pendingSlugRef = useRef<string | null>(null);
  const shouldPushHistoryRef = useRef(false);
  const displayedSlugRef = useRef<string | null>(initialModel?.slug ?? null);
  const backgroundAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isBackgroundAudioEnabled, setIsBackgroundAudioEnabled] =
    useState(true);
  const [activeThemeRouteId, setActiveThemeRouteId] =
    useState<ThemeRouteId | null>(null);
  const modelSlugSet = useMemo(
    () => new Set(models.map((model) => model.slug)),
    [models]
  );
  const activeThemeRoute = useMemo(
    () => getThemeRouteById(activeThemeRouteId),
    [activeThemeRouteId]
  );
  const [visitedModelSlugs, setVisitedModelSlugs] = useState<Set<string>>(
    () => new Set()
  );
  const [hasLoadedVisitedModelSlugs, setHasLoadedVisitedModelSlugs] =
    useState(false);
  const tourProgress = useMemo<TourProgress>(() => {
    let visitedCount = 0;

    for (const model of models) {
      if (visitedModelSlugs.has(model.slug)) {
        visitedCount += 1;
      }
    }

    return {
      visitedCount,
      totalCount: models.length,
    };
  }, [models, visitedModelSlugs]);

  const playBackgroundAudio = useCallback(() => {
    const audio = backgroundAudioRef.current;

    if (!audio || !isBackgroundAudioEnabled) {
      return;
    }

    audio.volume = BACKGROUND_AUDIO_VOLUME;

    void audio.play().catch(() => {
      // Browsers often require a first user gesture before unmuted audio plays.
    });
  }, [isBackgroundAudioEnabled]);

  const handleBackgroundAudioToggle = useCallback(() => {
    setIsBackgroundAudioEnabled((isEnabled) => {
      const audio = backgroundAudioRef.current;

      if (isEnabled) {
        audio?.pause();
        return false;
      }

      if (audio) {
        audio.volume = BACKGROUND_AUDIO_VOLUME;
        void audio.play().catch(() => {});
      }

      return true;
    });
  }, []);

  useEffect(() => {
    displayedSlugRef.current = displayedSlug;
  }, [displayedSlug]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setVisitedModelSlugs(readVisitedSiteModelSlugs(modelSlugSet));
      setHasLoadedVisitedModelSlugs(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [modelSlugSet]);

  useEffect(() => {
    if (
      !hasLoadedVisitedModelSlugs ||
      displayedSlug === null ||
      !modelSlugSet.has(displayedSlug)
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      setVisitedModelSlugs((currentSlugs) => {
        if (currentSlugs.has(displayedSlug)) {
          return currentSlugs;
        }

        const nextSlugs = new Set(currentSlugs);
        nextSlugs.add(displayedSlug);
        return nextSlugs;
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [displayedSlug, hasLoadedVisitedModelSlugs, modelSlugSet]);

  useEffect(() => {
    if (!hasLoadedVisitedModelSlugs) {
      return;
    }

    writeVisitedSiteModelSlugs(visitedModelSlugs);
  }, [hasLoadedVisitedModelSlugs, visitedModelSlugs]);

  useEffect(() => {
    const audio = backgroundAudioRef.current;

    if (!audio) {
      return;
    }

    audio.volume = BACKGROUND_AUDIO_VOLUME;

    if (isBackgroundAudioEnabled) {
      playBackgroundAudio();
      return;
    }

    audio.pause();
  }, [isBackgroundAudioEnabled, playBackgroundAudio]);

  useEffect(() => {
    if (!isBackgroundAudioEnabled) {
      return;
    }

    const handleFirstInteraction = () => {
      playBackgroundAudio();
    };

    window.addEventListener("pointerdown", handleFirstInteraction);
    window.addEventListener("keydown", handleFirstInteraction);

    return () => {
      window.removeEventListener("pointerdown", handleFirstInteraction);
      window.removeEventListener("keydown", handleFirstInteraction);
    };
  }, [isBackgroundAudioEnabled, playBackgroundAudio]);

  useEffect(() => {
    if (typeof document === "undefined" || !("fonts" in document)) {
      const timer = window.setTimeout(() => {
        setIsMapFontReady(true);
      }, 0);

      return () => window.clearTimeout(timer);
    }

    let isCancelled = false;

    if (document.fonts.check('1em "Ma Shan Zheng"')) {
      const timer = window.setTimeout(() => {
        if (!isCancelled) {
          setIsMapFontReady(true);
        }
      }, 0);

      return () => {
        isCancelled = true;
        window.clearTimeout(timer);
      };
    }

    const fallbackTimer = window.setTimeout(() => {
      if (!isCancelled) {
        setIsMapFontReady(true);
      }
    }, 1400);

    document.fonts
      .load('1em "Ma Shan Zheng"')
      .then(() => {
        if (!isCancelled) {
          setIsMapFontReady(true);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setIsMapFontReady(true);
        }
      });

    return () => {
      isCancelled = true;
      window.clearTimeout(fallbackTimer);
    };
  }, []);

  useEffect(() => {
    if (transitionKind !== "initial") {
      return;
    }

    if (transitionPhase === "covering") {
      const timer = window.setTimeout(() => {
        setTransitionPhase("revealing");
      }, INK_TRANSITION_INITIAL_HOLD_MS);

      return () => window.clearTimeout(timer);
    }

    if (transitionPhase === "revealing") {
      const timer = window.setTimeout(() => {
        setTransitionPhase("hidden");
      }, INK_TRANSITION_REVEAL_MS);

      return () => window.clearTimeout(timer);
    }
  }, [transitionKind, transitionPhase]);

  useEffect(() => {
    if (transitionKind !== "switch") {
      return;
    }

    if (transitionPhase === "covering") {
      const timer = window.setTimeout(() => {
        const nextSlug = pendingSlugRef.current;
        const shouldPushHistory = shouldPushHistoryRef.current;

        startTransition(() => {
          setDisplayedSlug(nextSlug);
        });
        if (shouldPushHistory && typeof window !== "undefined") {
          window.history.pushState(null, "", toModelRoutePath(nextSlug));
        }
        setTransitionPhase("revealing");
      }, INK_TRANSITION_COVER_MS);

      return () => window.clearTimeout(timer);
    }

    if (transitionPhase === "revealing") {
      const timer = window.setTimeout(() => {
        setTransitionPhase("hidden");
      }, INK_TRANSITION_REVEAL_MS);

      return () => window.clearTimeout(timer);
    }
  }, [transitionKind, transitionPhase]);

  const runInkTransition = useCallback(
    (
      nextSlug: string | null,
      options: { updateHistory?: boolean } = {}
    ) => {
      if (transitionPhase !== "hidden") {
        return;
      }

      if (nextSlug === displayedSlugRef.current) {
        return;
      }

      pendingSlugRef.current = nextSlug;
      shouldPushHistoryRef.current = options.updateHistory ?? true;
      setTransitionLabel(
        nextSlug
          ? models.find((model) => model.slug === nextSlug)?.label ?? "入景"
          : "园林总览"
      );
      setTransitionKind("switch");
      setTransitionPhase("covering");
    },
    [models, transitionPhase]
  );

  useEffect(() => {
    const handlePopState = () => {
      const nextSlug = getSlugFromRoutePath(window.location.pathname, models);

      runInkTransition(nextSlug, { updateHistory: false });
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [models, runInkTransition]);

  const selectedModel =
    models.find((model) => model.slug === displayedSlug) ?? null;

  return (
    <div className="relative min-h-screen">
      <audio
        ref={backgroundAudioRef}
        src={BACKGROUND_AUDIO_SOURCE}
        loop
        preload="auto"
        className="hidden"
        aria-hidden="true"
      />
      {selectedModel ? (
        <SingleModelStage
          key={selectedModel.slug}
          models={models}
          model={selectedModel}
          onSelect={runInkTransition}
          onBack={() => runInkTransition(null)}
          activeThemeRoute={activeThemeRoute}
          isBackgroundAudioEnabled={isBackgroundAudioEnabled}
          onBackgroundAudioToggle={handleBackgroundAudioToggle}
          tourProgress={tourProgress}
          visitedModelSlugs={visitedModelSlugs}
        />
      ) : (
        <OverviewStage
          models={models}
          onSelect={runInkTransition}
          activeThemeRoute={activeThemeRoute}
          onThemeRouteChange={setActiveThemeRouteId}
          isBackgroundAudioEnabled={isBackgroundAudioEnabled}
          onBackgroundAudioToggle={handleBackgroundAudioToggle}
          tourProgress={tourProgress}
          visitedModelSlugs={visitedModelSlugs}
        />
      )}

      <InkWashOverlay
        phase={transitionPhase}
        label={transitionLabel}
        isMapFontReady={isMapFontReady}
      />
    </div>
  );
}
