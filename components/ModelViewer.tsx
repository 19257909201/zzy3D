"use client";

import Image from "next/image";
import { Ma_Shan_Zheng } from "next/font/google";
import {
  type CSSProperties,
  type MutableRefObject,
  startTransition,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SiteModelSummary } from "@/lib/site-models";
import type {
  Material,
  Mesh,
  Object3D,
  PerspectiveCamera,
  Texture,
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
};

type OverviewStageProps = {
  models: SiteModelSummary[];
  onSelect: (slug: string) => void;
};

type SingleModelStageProps = {
  models: SiteModelSummary[];
  model: SiteModelSummary;
  onSelect: (slug: string) => void;
  onBack: () => void;
};

type OverviewMapFrameProps = {
  highlightedModel?: SiteModelSummary | null;
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

type InkWashOverlayProps = {
  phase: InkTransitionPhase;
  label: string;
  isMapFontReady: boolean;
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

type InterpretationAudioRefs = {
  audioRef: MutableRefObject<HTMLAudioElement | null>;
  audioSessionRef: MutableRefObject<number>;
};

function createMistTextureCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;

  const context = canvas.getContext("2d");

  if (!context) {
    return null;
  }

  const gradient = context.createRadialGradient(128, 128, 14, 128, 128, 128);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.96)");
  gradient.addColorStop(0.24, "rgba(248, 252, 246, 0.62)");
  gradient.addColorStop(0.52, "rgba(226, 237, 225, 0.2)");
  gradient.addColorStop(1, "rgba(226, 237, 225, 0)");

  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  return canvas;
}

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

function MapBuildingLift({ model }: { model: SiteModelSummary }) {
  const mapPosition = model.mapPosition ?? FALLBACK_MAP_POSITION;
  const mapSize = model.mapSize;
  const safeWidth = Math.max(mapSize.width * 1.68, mapSize.width + 0.04, 0.108);
  const safeHeight = Math.max(
    mapSize.height * 1.72,
    mapSize.height + 0.036,
    0.092
  );
  const cropWidthPercent = 100 / safeWidth;
  const cropHeightPercent = 100 / safeHeight;
  const cropLeftPercent = -((mapPosition.x - safeWidth / 2) / safeWidth) * 100;
  const cropTopPercent = -((mapPosition.y - safeHeight / 2) / safeHeight) * 100;

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
        <div className="map-building-lift-glow absolute inset-[-26%] rounded-[42%] bg-[radial-gradient(circle,_rgba(255,247,236,0.9)_0%,_rgba(255,247,236,0.46)_42%,_rgba(255,247,236,0)_82%)] blur-2xl" />
        <div
          className="map-building-lift-surface absolute inset-0 drop-shadow-[0_14px_22px_rgba(58,36,18,0.26)]"
          style={{
            WebkitMaskImage:
              "radial-gradient(ellipse at center, rgba(0,0,0,1) 28%, rgba(0,0,0,0.96) 50%, rgba(0,0,0,0.24) 82%, transparent 95%)",
            maskImage:
              "radial-gradient(ellipse at center, rgba(0,0,0,1) 28%, rgba(0,0,0,0.96) 50%, rgba(0,0,0,0.24) 82%, transparent 95%)",
          }}
        >
          <div
            className="absolute bg-no-repeat"
            style={{
              left: `${cropLeftPercent}%`,
              top: `${cropTopPercent}%`,
              width: `${cropWidthPercent}%`,
              height: `${cropHeightPercent}%`,
              backgroundImage: "url('/api/layout-image')",
              backgroundSize: "100% 100%",
            }}
          />
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
      `}</style>
    </>
  );
}

function OverviewMapFrame({
  highlightedModel,
  children,
}: OverviewMapFrameProps) {
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
            className="select-none object-cover"
          />

          {highlightedModel ? <MapBuildingLift model={highlightedModel} /> : null}
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

function OverviewStage({ models, onSelect }: OverviewStageProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);

  const handleSelect = (slug: string) => {
    setIsDrawerOpen(false);
    onSelect(slug);
  };
  const previewModel =
    previewSlug === null
      ? null
      : models.find((model) => model.slug === previewSlug) ?? null;

  return (
    <section className="relative h-screen w-full overflow-hidden bg-[#ece2d5]">
      <OverviewMapFrame highlightedModel={previewModel}>
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

      <DirectoryDrawer
        models={models}
        isOpen={isDrawerOpen}
        onToggle={() => setIsDrawerOpen((value) => !value)}
        onClose={() => setIsDrawerOpen(false)}
        onSelect={handleSelect}
        onPreview={setPreviewSlug}
        onPreviewClear={() => setPreviewSlug(null)}
      />

      {previewModel ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4 sm:bottom-6">
          <div className="max-w-xl rounded-[1.35rem] border border-[#65513f]/10 bg-[linear-gradient(180deg,_rgba(255,255,252,0.94)_0%,_rgba(247,243,236,0.97)_100%)] px-5 py-3 text-center text-sm text-[#5e4b3a] shadow-[0_18px_36px_rgba(72,51,32,0.14)] backdrop-blur-md">
            <div className="flex justify-center text-[#2f2118]">
              <p
                className={`${mapLabelFont.className} text-[1.28rem] leading-none tracking-[0.03em]`}
              >
                {previewModel.overviewTag}
              </p>
            </div>
            <p className="mt-2 text-[13px] leading-6 text-[#5e4b3a] sm:text-[14px]">
              {previewModel.overviewCopy}
            </p>
            <p className="mt-1.5 text-[12px] leading-5 text-[#8c7156]">
              {previewModel.overviewHint}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SingleModelStage({
  models,
  model,
  onSelect,
  onBack,
}: SingleModelStageProps) {
  const interpretationText = model.interpretation.replace(/\n\s*\n+/g, "\n");
  const containerRef = useRef<HTMLDivElement | null>(null);
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
    let baseMistTexture: Texture | null = null;
    let baseMistMaterials: Material[] = [];
    let baseMistSprites: Object3D[] = [];
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

        const ambientLight = new THREE.AmbientLight(0xfbfff8, 1.2);
        const hemiLight = new THREE.HemisphereLight(0xf4fbef, 0xa7b4a1, 2.2);
        const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
        const fillLight = new THREE.DirectionalLight(0xd6ead7, 1.35);
        const rimLight = new THREE.DirectionalLight(0xf8f0de, 0.92);

        keyLight.position.set(7, 10, 9);
        fillLight.position.set(-6, 4, 7);
        rimLight.position.set(3, 4, -8);

        scene.add(ambientLight, hemiLight, keyLight, fillLight, rimLight);

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

            const mistCanvas = createMistTextureCanvas();

            if (mistCanvas) {
              baseMistTexture = new THREE.CanvasTexture(mistCanvas);
              baseMistTexture.colorSpace = THREE.SRGBColorSpace;

              const lowerMistMaterial = new THREE.SpriteMaterial({
                map: baseMistTexture,
                color: 0xf1f6ee,
                opacity: 0.18,
                transparent: true,
                depthWrite: false,
              });
              const lowerMist = new THREE.Sprite(lowerMistMaterial);
              lowerMist.position.set(0, bottomY + radius * 0.08, radius * 0.04);
              lowerMist.scale.set(radius * 1.8, radius * 0.52, 1);
              lowerMist.renderOrder = 1;

              baseMistMaterials = [lowerMistMaterial];
              baseMistSprites = [lowerMist];
              scene.add(lowerMist);
            }

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
              message: `正在展开 ${model.label}。拖拽可旋转，滚轮可缩放。`,
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
                message: `正在查看 ${model.label}。拖拽可旋转，滚轮可缩放。`,
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

      baseMistSprites.forEach((sprite) => {
        sprite.parent?.remove(sprite);
      });
      baseMistMaterials.forEach((material) => {
        material.dispose();
      });
      baseMistTexture?.dispose();
      renderer?.dispose();

      if (renderer?.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [model.label, model.slug]);

  return (
    <section className="relative h-screen w-full overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,_#fffefb_0%,_#f7f3ec_46%,_#ece2d5_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_14%,_rgba(255,255,255,0.72)_0%,_rgba(255,255,255,0.18)_26%,_transparent_48%),radial-gradient(circle_at_82%_18%,_rgba(244,234,218,0.36)_0%,_transparent_28%),radial-gradient(circle_at_54%_86%,_rgba(232,214,189,0.18)_0%,_transparent_34%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,_rgba(255,255,255,0.24)_0%,_rgba(255,255,255,0.08)_22%,_rgba(255,255,255,0)_44%,_rgba(142,111,79,0.08)_100%)]" />
      <div className="pointer-events-none absolute left-[-10%] top-[6%] h-[38%] w-[42%] rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.72)_0%,_rgba(255,255,255,0.18)_48%,_transparent_78%)] blur-3xl" />
      <div className="pointer-events-none absolute right-[-10%] top-[18%] h-[36%] w-[34%] rounded-full bg-[radial-gradient(circle,_rgba(245,233,216,0.36)_0%,_rgba(245,233,216,0.12)_50%,_transparent_78%)] blur-3xl" />
      <div className="pointer-events-none absolute inset-x-[10%] bottom-[-14%] h-[42%] rounded-full bg-[radial-gradient(circle,_rgba(233,217,198,0.24)_0%,_rgba(233,217,198,0.1)_36%,_transparent_74%)] blur-3xl" />

      <div
        ref={containerRef}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
      />

      <DirectoryDrawer
        models={models}
        isOpen={isDrawerOpen}
        onToggle={() => setIsDrawerOpen((value) => !value)}
        onClose={() => setIsDrawerOpen(false)}
        onSelect={handleDrawerSelect}
      />

      <button
        type="button"
        onClick={onBack}
        aria-label="返回总览"
        className={`${PAPER_BUTTON_CLASS} absolute bottom-2 left-4 z-30 flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-md transition hover:border-[#4d3b2d]/20 hover:bg-[linear-gradient(180deg,_rgba(255,255,255,0.98)_0%,_rgba(250,246,240,1)_100%)] sm:bottom-4 sm:left-6 sm:h-12 sm:w-12`}
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

                <div className="relative mt-4 max-h-[min(42vh,24rem)] overflow-y-auto pr-1 [scrollbar-gutter:stable] sm:max-h-[calc(100vh-22rem)]">
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

      <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4 sm:bottom-6">
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
        ) : (
          <div
            className={`max-w-xl rounded-full border px-4 py-2 text-center text-sm backdrop-blur-md ${
              viewerState.kind === "error"
                ? "border-rose-300/45 bg-rose-50/88 text-rose-900"
                : "border-[#65513f]/10 bg-[linear-gradient(180deg,_rgba(255,255,252,0.92)_0%,_rgba(247,243,236,0.96)_100%)] text-[#5e4b3a] shadow-[0_14px_32px_rgba(72,51,32,0.12)]"
            }`}
          >
            {viewerState.message}
          </div>
        )}
      </div>
    </section>
  );
}

export default function ModelViewer({ models }: ModelViewerProps) {
  const [displayedSlug, setDisplayedSlug] = useState<string | null>(null);
  const [isMapFontReady, setIsMapFontReady] = useState(false);
  const [transitionPhase, setTransitionPhase] =
    useState<InkTransitionPhase>("covering");
  const [transitionKind, setTransitionKind] =
    useState<InkTransitionKind>("initial");
  const [transitionLabel, setTransitionLabel] = useState("一园入画·掌上云游");
  const pendingSlugRef = useRef<string | null>(null);

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

        startTransition(() => {
          setDisplayedSlug(nextSlug);
        });
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

  const runInkTransition = (nextSlug: string | null) => {
    if (transitionPhase !== "hidden") {
      return;
    }

    pendingSlugRef.current = nextSlug;
    setTransitionLabel(
      nextSlug
        ? models.find((model) => model.slug === nextSlug)?.label ?? "入景"
        : "园林总览"
    );
    setTransitionKind("switch");
    setTransitionPhase("covering");
  };

  const selectedModel =
    models.find((model) => model.slug === displayedSlug) ?? null;

  return (
    <div className="relative min-h-screen">
      {selectedModel ? (
        <SingleModelStage
          models={models}
          model={selectedModel}
          onSelect={runInkTransition}
          onBack={() => runInkTransition(null)}
        />
      ) : (
        <OverviewStage models={models} onSelect={runInkTransition} />
      )}

      <InkWashOverlay
        phase={transitionPhase}
        label={transitionLabel}
        isMapFontReady={isMapFontReady}
      />
    </div>
  );
}
