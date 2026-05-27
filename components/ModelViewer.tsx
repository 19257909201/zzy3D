"use client";

import Image from "next/image";
import { Ma_Shan_Zheng } from "next/font/google";
import {
  type CSSProperties,
  type MutableRefObject,
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SiteModelSummary } from "@/lib/site-models";
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
  isBackgroundAudioEnabled: boolean;
  onBackgroundAudioToggle: () => void;
};

type SingleModelStageProps = {
  models: SiteModelSummary[];
  model: SiteModelSummary;
  onSelect: (slug: string) => void;
  onBack: () => void;
  isBackgroundAudioEnabled: boolean;
  onBackgroundAudioToggle: () => void;
};

type OverviewMapFrameProps = {
  highlightedModel?: SiteModelSummary | null;
  mapMode: MapMode;
  models: SiteModelSummary[];
  showRecommendedRoute: boolean;
  children?: ReactNode;
};

type MapLabelProps = {
  model: SiteModelSummary;
  onSelect: (slug: string) => void;
  onPreview: (slug: string) => void;
  onPreviewClear: () => void;
  isPreviewed: boolean;
};

type DirectoryDrawerProps = {
  models: SiteModelSummary[];
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onSelect: (slug: string) => void;
  onPreview?: (slug: string) => void;
  onPreviewClear?: () => void;
};

type InkTransitionPhase = "covering" | "revealing" | "hidden";
type InkTransitionKind = "initial" | "switch";
type MapMode = "normal" | "heat";

type SiteModelHeatData = {
  value: number;
  level: "极热" | "高热" | "中热" | "温和";
  color: RgbColor;
  radius: number;
  opacity: number;
};

type NormalizedMapPoint = {
  x: number;
  y: number;
};

type RecommendedRouteWaypoint = NormalizedMapPoint | { slug: string };

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
const BACKGROUND_AUDIO_SOURCE = "/audio/backgroud.flac";
const BACKGROUND_AUDIO_VOLUME = 0.36;
const INK_TRANSITION_INITIAL_HOLD_MS = 320;
const INK_TRANSITION_COVER_MS = 720;
const INK_TRANSITION_REVEAL_MS = 1160;
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
const MODEL_ROUTE_PREFIX = "/models";

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
  yulantang: {
    value: 68,
    level: "温和",
    color: [68, 165, 99],
    radius: 0.12,
    opacity: 0.46,
  },
};

const RECOMMENDED_ROUTE_WAYPOINTS: readonly RecommendedRouteWaypoint[] = [
  { x: 0.94, y: 0.68 },
  { x: 0.88, y: 0.68 },
  { slug: "linglongguan" },
  { x: 0.77, y: 0.7 },
  { x: 0.735, y: 0.68 },
  { x: 0.705, y: 0.655 },
  { slug: "yuanxiangtang" },
  { x: 0.63, y: 0.66 },
  { x: 0.6, y: 0.7 },
  { x: 0.57, y: 0.72 },
  { slug: "xiaofeihong" },
  { x: 0.54, y: 0.7 },
  { x: 0.515, y: 0.66 },
  { slug: "xiangzhou" },
  { x: 0.46, y: 0.66 },
  { x: 0.435, y: 0.7 },
  { slug: "yulantang" },
  { x: 0.372, y: 0.72 },
  { x: 0.36, y: 0.655 },
  { x: 0.338, y: 0.61 },
  { x: 0.33, y: 0.525 },
  { x: 0.365, y: 0.455 },
  { x: 0.405, y: 0.385 },
  { x: 0.445, y: 0.335 },
  { slug: "jianshanlou" },
  { x: 0.455, y: 0.36 },
  { x: 0.415, y: 0.43 },
  { x: 0.405, y: 0.46 },
  { x: 0.452, y: 0.475 },
  { x: 0.492, y: 0.49 },
  { x: 0.52, y: 0.502 },
  { slug: "hefengsimianting" },
  { x: 0.565, y: 0.47 },
  { x: 0.59, y: 0.43 },
  { slug: "xuexiangyunweiting" },
  { x: 0.66, y: 0.39 },
  { x: 0.72, y: 0.37 },
  { x: 0.79, y: 0.35 },
  { x: 0.86, y: 0.35 },
  { x: 0.94, y: 0.35 },
] as const;

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

function resolveRecommendedRoutePoints(
  models: SiteModelSummary[]
): NormalizedMapPoint[] {
  const modelBySlug = new Map(models.map((model) => [model.slug, model]));

  return RECOMMENDED_ROUTE_WAYPOINTS.flatMap((waypoint) => {
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

function toRecommendedRoutePath(points: NormalizedMapPoint[]) {
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

function renderInterpretationContent(
  text: string,
  showCursor: boolean
): ReactNode[] {
  const lines = text.split("\n");

  return lines.map((line, index) => {
    const headingMatch = line.match(/^(【[^】]+】)\s*(.*)$/);
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
            {headingMatch[2] ? ` ${headingMatch[2]}` : null}
          </>
        ) : (
          line
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

function MapRecommendedRouteLayer({ models }: { models: SiteModelSummary[] }) {
  const routePoints = resolveRecommendedRoutePoints(models);
  const routePath = toRecommendedRoutePath(routePoints);

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
            id="recommended-route-shadow"
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
          stroke="rgba(248,238,210,0.66)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={12}
          vectorEffect="non-scaling-stroke"
          filter="url(#recommended-route-shadow)"
        />
        <path
          className="recommended-route-line"
          d={routePath}
          fill="none"
          stroke="rgba(121,70,48,0.86)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={5.5}
          vectorEffect="non-scaling-stroke"
        />
        <path
          className="recommended-route-flow"
          d={routePath}
          fill="none"
          pathLength={1}
          stroke="rgba(222,183,112,0.68)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.6}
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <style jsx>{`
        .recommended-route-line {
          opacity: 1;
        }

        .recommended-route-flow {
          opacity: 0;
          stroke-dasharray: 0.085 0.18;
          animation:
            recommended-route-flow 3600ms linear infinite,
            recommended-route-flow-in 360ms ease-out 180ms forwards;
        }

        @keyframes recommended-route-flow {
          from {
            stroke-dashoffset: 0.265;
          }

          to {
            stroke-dashoffset: 0;
          }
        }

        @keyframes recommended-route-flow-in {
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
  showRecommendedRoute,
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
          {showRecommendedRoute ? (
            <MapRecommendedRouteLayer models={models} />
          ) : null}
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
}: MapLabelProps) {
  const mapPosition = model.mapPosition ?? FALLBACK_MAP_POSITION;

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
        aria-label={`查看 ${model.label} 模型`}
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
              ? "scale-125 shadow-[0_0_0_1.5px_rgba(0,0,0,0.86),0_0_18px_rgba(255,255,255,0.84)]"
              : "shadow-[0_0_0_1px_rgba(0,0,0,0.78),0_0_10px_rgba(255,255,255,0.62)] group-hover:scale-125 group-hover:shadow-[0_0_0_1.5px_rgba(0,0,0,0.86),0_0_18px_rgba(255,255,255,0.84)] group-focus-visible:scale-125 group-focus-visible:shadow-[0_0_0_1.5px_rgba(0,0,0,0.86),0_0_18px_rgba(255,255,255,0.84)]"
          }`}
          style={{ top: `calc(50% + ${LABEL_DOT_OFFSET}px)` }}
        />
        <span
          className={`${mapLabelFont.className} relative block whitespace-nowrap text-[clamp(1.7rem,2vw,2.5rem)] leading-none tracking-[0.02em] transition duration-[720ms] ease-[cubic-bezier(0.16,0.84,0.22,1)] ${
            isPreviewed
              ? "scale-[1.03] text-[#3a2010]"
              : "text-[#18110d] group-hover:scale-[1.03] group-hover:text-[#3a2010] group-focus-visible:scale-[1.03] group-focus-visible:text-[#3a2010]"
          }`}
          style={MAP_LABEL_TEXT_STYLE}
        >
          {model.label}
        </span>
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
          aria-label="打开建筑目录"
          className={`${PAPER_PANEL_CLASS} pointer-events-auto group relative inline-flex items-center gap-2 overflow-hidden rounded-[1rem] px-3.5 py-2 backdrop-blur-md transition hover:border-[#4e3b2c]/18 hover:bg-[linear-gradient(180deg,_rgba(255,255,255,0.98)_0%,_rgba(250,246,240,1)_100%)]`}
        >
          <span className="pointer-events-none absolute inset-x-3 top-0 h-px bg-[rgba(255,255,255,0.96)]" />
          <span className="pointer-events-none absolute inset-x-4 bottom-0 h-px bg-[rgba(171,145,114,0.2)]" />
          <span
            className={`${mapLabelFont.className} relative text-[1.05rem] leading-none tracking-[0.04em] text-[#2f2118]`}
          >
            目录
          </span>
          <span className="rounded-full border border-[#4d3b2d]/10 bg-[rgba(255,255,255,0.92)] px-2 py-0.5 text-[10px] leading-none tracking-[0.16em] text-[#5c4a3a]">
            {models.length}
          </span>
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
                models.map((model, index) => (
                  <button
                    key={model.slug}
                    type="button"
                    onClick={() => onSelect(model.slug)}
                    onPointerEnter={() => onPreview(model.slug)}
                    onPointerDown={() => onPreview(model.slug)}
                    onPointerLeave={onPreviewClear}
                    onFocus={() => onPreview(model.slug)}
                    onBlur={onPreviewClear}
                    className="group flex w-full items-start gap-3 border-t border-[#8f7150]/8 px-4 py-3 text-left transition first:border-t-0 hover:bg-[rgba(250,245,238,0.92)]"
                  >
                    <span className="mt-1 shrink-0 text-[10px] leading-none tracking-[0.28em] text-[#a18364]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p
                          className={`${mapLabelFont.className} text-[1.28rem] leading-none tracking-[0.03em] text-[#241913] transition group-hover:text-[#3a2a1d]`}
                        >
                          {model.label}
                        </p>
                        <span className="mt-1 shrink-0 text-[11px] text-[#8c7156]">
                          入景
                        </span>
                      </div>
                      <p className="mt-1 text-[12px] leading-5 text-[#5e4b3a]">
                        {model.verse}
                      </p>
                    </div>
                  </button>
                ))
              ) : (
                <div className="px-4 py-4 text-sm leading-6 text-[#7c5131]">
                  图录中暂未发现可进入的 `.glb` 建筑模型。
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function OverviewStage({
  models,
  onSelect,
  isBackgroundAudioEnabled,
  onBackgroundAudioToggle,
}: OverviewStageProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);
  const [mapMode, setMapMode] = useState<MapMode>("normal");
  const [showRecommendedRoute, setShowRecommendedRoute] = useState(false);
  const isHeatMode = mapMode === "heat";

  const handleSelect = (slug: string) => {
    setIsDrawerOpen(false);
    onSelect(slug);
  };
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
        tag: "拙政园",
        copy: "江南古典园林代表，以水为脉，亭台楼榭与花木山石相映成景。",
        hint: "",
      };

  return (
    <section className="relative h-screen w-full overflow-hidden bg-[#ece2d5]">
      <OverviewMapFrame
        highlightedModel={previewModel}
        mapMode={mapMode}
        models={models}
        showRecommendedRoute={showRecommendedRoute}
      >
        {models.map((model) => (
          <MapLabel
            key={model.slug}
            model={model}
            onSelect={handleSelect}
            onPreview={setPreviewSlug}
            onPreviewClear={() => setPreviewSlug(null)}
            isPreviewed={previewSlug === model.slug}
          />
        ))}
      </OverviewMapFrame>

      <div className="absolute left-4 top-4 z-20 w-[min(22.5rem,calc(100vw-6.5rem))] sm:left-6 sm:top-6 sm:w-[22.5rem]">
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

      <div className="absolute bottom-4 left-4 z-30 flex flex-wrap items-center gap-2 sm:bottom-6 sm:left-6">
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
          onClick={() => setShowRecommendedRoute((value) => !value)}
          aria-pressed={showRecommendedRoute}
          aria-label={
            showRecommendedRoute ? "隐藏推荐路线" : "显示推荐路线"
          }
          className={`${PAPER_BUTTON_CLASS} inline-flex h-11 items-center gap-2 rounded-full px-4 text-[13px] font-medium tracking-[0.12em] backdrop-blur-md transition hover:border-[#4d3b2d]/20 hover:bg-[linear-gradient(180deg,_rgba(255,255,255,0.98)_0%,_rgba(250,246,240,1)_100%)] sm:h-12 sm:px-[1.125rem] ${
            showRecommendedRoute
              ? "border-[#8b462d]/25 text-[#5e3324] shadow-[0_14px_28px_rgba(112,70,42,0.14)]"
              : ""
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={`h-[17px] w-[17px] ${
              showRecommendedRoute ? "text-[#8b462d]" : "text-[#5a4839]"
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
          <span>推荐路线</span>
        </button>
      </div>

      {isHeatMode ? (
        <div
          className="pointer-events-none absolute bottom-4 right-4 z-30 w-[min(72vw,16rem)] px-1 py-1 text-[#3e332a] drop-shadow-[0_1px_2px_rgba(255,255,255,0.9)] sm:bottom-6 sm:right-6"
          aria-label="人气颜色说明"
        >
          <p
            className="inline-flex text-[12px] font-semibold tracking-[0.18em] text-[#2b211a]"
            style={{
              WebkitTextStroke: "2px rgba(255,255,255,0.78)",
              paintOrder: "stroke fill",
              textShadow:
                "0 1px 2px rgba(42,31,21,0.18), 0 0 8px rgba(255,255,255,0.74)",
            }}
          >
            人气等级
          </p>
          <div className="mt-2.5 h-2.5 rounded-full bg-[linear-gradient(90deg,_#44a563_0%,_#e5b82d_42%,_#e86f2a_70%,_#d62d2a_100%)] shadow-[inset_0_1px_2px_rgba(30,24,18,0.16)]" />
          <div
            className="mt-2 grid grid-cols-4 text-[11px] font-semibold tracking-[0.08em] text-[#2b211a]"
            style={{
              WebkitTextStroke: "2px rgba(255,255,255,0.78)",
              paintOrder: "stroke fill",
              textShadow:
                "0 1px 2px rgba(42,31,21,0.18), 0 0 8px rgba(255,255,255,0.74)",
            }}
          >
            <span className="justify-self-start">清静</span>
            <span className="justify-self-center">适中</span>
            <span className="justify-self-center">热门</span>
            <span className="justify-self-end">拥挤</span>
          </div>
        </div>
      ) : null}

      <DirectoryDrawer
        models={models}
        isOpen={isDrawerOpen}
        onToggle={() => setIsDrawerOpen((value) => !value)}
        onClose={() => setIsDrawerOpen(false)}
        onSelect={handleSelect}
        onPreview={setPreviewSlug}
        onPreviewClear={() => setPreviewSlug(null)}
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
  isBackgroundAudioEnabled,
  onBackgroundAudioToggle,
}: SingleModelStageProps) {
  const interpretationText = model.interpretation.replace(/\n\s*\n+/g, "\n");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const daylightProgressRef = useRef(0.5);
  const sunLightRef = useRef<DirectionalLight | null>(null);
  const sunTargetRef = useRef<Object3D | null>(null);
  const shadowMaterialRef = useRef<ShadowMaterial | null>(null);
  const shadowRadiusRef = useRef(1);
  const [daylightProgress, setDaylightProgress] = useState(0.5);
  const [viewerState, setViewerState] = useState<ViewerState>({
    kind: "loading",
    message: `正在加载 ${model.label}…`,
  });
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isInterpretationReady, setIsInterpretationReady] = useState(false);
  const [isInterpretationOpen, setIsInterpretationOpen] = useState(true);
  const [typedInterpretation, setTypedInterpretation] = useState("");
  const [isNarrationEnabled, setIsNarrationEnabled] = useState(true);
  const [isNarrationAvailable, setIsNarrationAvailable] = useState<
    boolean | null
  >(null);
  const [narrationAudioSrc, setNarrationAudioSrc] = useState<string | null>(
    null
  );
  const narrationAudioRef = useRef<HTMLAudioElement | null>(null);
  const narrationAudioSessionRef = useRef(0);
  const daylightSceneStyle = getDaylightSceneStyle(daylightProgress);
  const currentModelIndex = Math.max(
    models.findIndex((item) => item.slug === model.slug),
    0
  );
  const previousModel =
    models[(currentModelIndex - 1 + models.length) % models.length];
  const nextModel = models[(currentModelIndex + 1) % models.length];
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
    stopNarrationAudio(
      {
        audioRef: narrationAudioRef,
        audioSessionRef: narrationAudioSessionRef,
      },
      true
    );
    setIsNarrationAvailable(null);
    setNarrationAudioSrc(null);
    setIsDrawerOpen(false);
    setIsInterpretationReady(false);
    setIsInterpretationOpen(true);
    setTypedInterpretation("");
    daylightProgressRef.current = 0.5;
    setDaylightProgress(0.5);
  }, [model.slug]);

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

  const handleNarrationToggle = () => {
    if (!narrationAudioSrc) {
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

  useEffect(() => {
    if (!isInterpretationReady) {
      return;
    }

    if (!isInterpretationOpen) {
      return;
    }

    if (typedInterpretation.length >= interpretationText.length) {
      return;
    }

    const nextCharacter = interpretationText[typedInterpretation.length];
    const delay =
      nextCharacter === "\n"
        ? INTERPRETATION_TYPE_INTERVAL_MS * 3
        : /[，。；：、“”]/.test(nextCharacter)
          ? INTERPRETATION_TYPE_INTERVAL_MS * 2
          : INTERPRETATION_TYPE_INTERVAL_MS;

    const timer = window.setTimeout(() => {
      setTypedInterpretation(
        interpretationText.slice(0, typedInterpretation.length + 1)
      );
    }, delay);

    return () => window.clearTimeout(timer);
  }, [
    isInterpretationOpen,
    isInterpretationReady,
    interpretationText,
    typedInterpretation,
  ]);

  useEffect(() => {
    if (isInterpretationOpen && isNarrationEnabled) {
      return;
    }

    stopNarrationAudio(
      {
        audioRef: narrationAudioRef,
        audioSessionRef: narrationAudioSessionRef,
      },
      true
    );
  }, [isInterpretationOpen, isNarrationEnabled]);

  useEffect(() => {
    if (
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
    isNarrationEnabled,
    narrationAudioSrc,
  ]);

  useEffect(() => {
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
  }, [model.label, model.slug, syncDaylightShadow]);

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
      <div
        ref={containerRef}
        className="absolute inset-0 z-[4] cursor-grab active:cursor-grabbing"
      />

      <DirectoryDrawer
        models={models}
        isOpen={isDrawerOpen}
        onToggle={() => setIsDrawerOpen((value) => !value)}
        onClose={() => setIsDrawerOpen(false)}
        onSelect={handleDrawerSelect}
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

        <button
          type="button"
          onClick={() => onSelect(previousModel.slug)}
          aria-label={`查看上一个模型：${previousModel.label}`}
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
          onClick={() => onSelect(nextModel.slug)}
          aria-label={`查看下一个模型：${nextModel.label}`}
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

      <div className="absolute left-4 top-4 z-10 flex w-[min(19.75rem,calc(100vw-2rem))] flex-col gap-4 sm:left-6 sm:top-6 sm:w-[19.75rem]">
        <div className="w-full">
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
          </div>
        </div>

        <div className="w-full">
          {isInterpretationReady && isInterpretationOpen ? (
            <div className="relative w-full">
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
                className={`${PAPER_PANEL_CLASS} relative w-full overflow-hidden rounded-[1.5rem] px-4 py-4 backdrop-blur-xl sm:px-5 sm:py-5`}
              >
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,_rgba(255,255,255,0.7)_0%,_transparent_34%),linear-gradient(180deg,_rgba(134,108,76,0.03)_0%,_rgba(255,255,255,0)_100%)]" />
                <div className="relative flex min-w-0 items-start justify-between gap-3">
                  <h3
                    className={`${mapLabelFont.className} text-[1.52rem] leading-none tracking-[0.03em] text-[#2f2118]`}
                  >
                    关于建筑
                  </h3>
                  <button
                    type="button"
                    onClick={handleNarrationToggle}
                    disabled={!narrationAudioSrc}
                    aria-pressed={narrationAudioSrc ? isNarrationEnabled : false}
                    aria-label={
                      narrationAudioSrc
                        ? isNarrationEnabled
                          ? "关闭音频"
                          : "开启音频"
                        : isNarrationAvailable === false
                          ? "暂无解说音频"
                          : "正在检查音频"
                    }
                    className={`${PAPER_BUTTON_CLASS} flex h-9 w-9 shrink-0 items-center justify-center rounded-full backdrop-blur-md transition hover:border-[#4d3b2d]/20 hover:bg-[linear-gradient(180deg,_rgba(255,255,255,0.98)_0%,_rgba(250,246,240,1)_100%)] ${
                      narrationAudioSrc
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
                      {narrationAudioSrc && isNarrationEnabled ? (
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

                <div className="paper-scrollarea relative mt-4 max-h-[min(42vh,24rem)] overflow-y-auto pr-1 sm:max-h-[calc(100vh-22rem)]">
                  <div>
                    {renderInterpretationContent(
                      typedInterpretation,
                      typedInterpretation.length < interpretationText.length
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
          models={models}
          model={selectedModel}
          onSelect={runInkTransition}
          onBack={() => runInkTransition(null)}
          isBackgroundAudioEnabled={isBackgroundAudioEnabled}
          onBackgroundAudioToggle={handleBackgroundAudioToggle}
        />
      ) : (
        <OverviewStage
          models={models}
          onSelect={runInkTransition}
          isBackgroundAudioEnabled={isBackgroundAudioEnabled}
          onBackgroundAudioToggle={handleBackgroundAudioToggle}
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
